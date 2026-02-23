/**
 * Account, contact, and link sync from Monday.com boards to Postgres.
 *
 * Extracted from sync.ts — handles fetching snapshots from Monday's
 * CONTRACTORS and CONTACTS boards, upserting into accounts/contacts tables,
 * and maintaining estimate_contacts join table.
 */
import { db } from "@lib/db/client";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";
import { chunk } from "./sql-utils";

const RELATION_SOURCE_DIRECT = "monday.direct_contacts";
const RELATION_SOURCE_LEGACY = "monday.legacy_deal_contact";
const SQL_WRITE_BATCH_SIZE = 250;

const NUMERIC_ID_REGEX = /^\d+$/;
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_PREFIX_REGEX = /^www\./;

function buildTuplePlaceholders(width: number, tupleIndex: number): string {
  const start = tupleIndex * width + 1;
  return `(${Array.from({ length: width }, (_, idx) => `$${start + idx}`).join(", ")})`;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface MondayAccountSnapshot {
  domain: string | null;
  mondayItemId: string;
  name: string;
}

export interface MondayContactSnapshot {
  companyFax: string | null;
  companyPhone: string | null;
  contractorMondayId: string | null;
  email: string | null;
  groupId: string;
  groupTitle: string;
  mobilePhone: string | null;
  mondayItemId: string;
  name: string;
  officePhone: string | null;
  phone: string | null;
  priority: string | null;
  title: string | null;
}

export interface EstimateContactPair {
  contactMondayId: string;
  estimateMondayId: string;
  source: typeof RELATION_SOURCE_DIRECT | typeof RELATION_SOURCE_LEGACY;
}

export interface RelationPairCollection {
  mondayPairsDirect: number;
  mondayPairsLegacy: number;
  pairs: EstimateContactPair[];
}

export interface LinkStats {
  accountsSynced: number;
  contactsSynced: number;
  estimateContactsResolved: number;
  missingContact: number;
  missingEstimate: number;
  mondayPairsDirect: number;
  mondayPairsLegacy: number;
  mondayPairsUnique: number;
  touchedEstimates: number;
}

interface SqlAccountRow {
  domain: string | null;
  id: number;
  monday_account_id: string | null;
}

interface SqlContactIdRow {
  id: number;
  monday_item_id: string;
}

// ── Shared utilities ───────────────────────────────────────────────────

export function sanitizeMondayId(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return NUMERIC_ID_REGEX.test(trimmed) ? trimmed : null;
}

export function uniqueNumericIds(
  values: Iterable<string | null | undefined>
): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const id = sanitizeMondayId(value);
    if (id) {
      set.add(id);
    }
  }
  return [...set];
}

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const domain = raw
    .split(" - ")[0]
    .trim()
    .toLowerCase()
    .replace(PROTOCOL_REGEX, "")
    .replace(WWW_PREFIX_REGEX, "")
    .split("/")[0]
    .trim();
  return domain || null;
}

function readLinkedIds(
  columnValues: Array<{ id: string; linkedItemIds?: string[] }>,
  columnId: string
): string[] {
  const col = columnValues.find((cv) => cv.id === columnId);
  return uniqueNumericIds(col?.linkedItemIds ?? []);
}

// ── Contact pair collection ────────────────────────────────────────────

export function collectEstimateContactPairs(
  items: Array<{
    id: string;
    columnValues: Array<{ id: string; linkedItemIds?: string[] }>;
  }>
): RelationPairCollection {
  const dedup = new Map<string, EstimateContactPair>();
  let mondayPairsDirect = 0;
  let mondayPairsLegacy = 0;

  for (const item of items) {
    const estimateMondayId = sanitizeMondayId(item.id);
    if (!estimateMondayId) {
      continue;
    }

    const directIds = readLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.CONTACTS_DIRECT.id
    );
    const legacyIds = readLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.CONTACTS.id
    );

    for (const contactMondayId of directIds) {
      const key = `${estimateMondayId}:${contactMondayId}`;
      dedup.set(key, {
        estimateMondayId,
        contactMondayId,
        source: RELATION_SOURCE_DIRECT,
      });
      mondayPairsDirect++;
    }

    for (const contactMondayId of legacyIds) {
      const key = `${estimateMondayId}:${contactMondayId}`;
      if (!dedup.has(key)) {
        dedup.set(key, {
          estimateMondayId,
          contactMondayId,
          source: RELATION_SOURCE_LEGACY,
        });
      }
      mondayPairsLegacy++;
    }
  }

  return {
    pairs: [...dedup.values()],
    mondayPairsDirect,
    mondayPairsLegacy,
  };
}

// ── DB sync: accounts ──────────────────────────────────────────────────

/** Resolve a single account snapshot: match by monday_id, then domain, then insert. */
async function resolveAccountRow(
  row: MondayAccountSnapshot,
  existingByMondayId: Map<string, SqlAccountRow>,
  existingByDomain: Map<string, SqlAccountRow>
): Promise<{ id: number; inserted: boolean } | null> {
  const byMonday = existingByMondayId.get(row.mondayItemId);
  if (byMonday) {
    return { id: byMonday.id, inserted: false };
  }

  const byDomain = row.domain ? existingByDomain.get(row.domain) : undefined;
  if (byDomain) {
    if (!byDomain.monday_account_id) {
      await db.run("UPDATE accounts SET monday_account_id = $1 WHERE id = $2", [
        row.mondayItemId,
        byDomain.id,
      ]);
    }
    return { id: byDomain.id, inserted: false };
  }

  const inserted = (await db.run(
    `INSERT INTO accounts (
       domain, name, type, monday_account_id, monday_name, updated_at
     ) VALUES ($1, $2, 'contractor', $3, $4, now())
     RETURNING id`,
    [row.domain, row.name, row.mondayItemId, row.name]
  )) as Array<{ id: number }>;

  const insertedId = inserted[0]?.id;
  return insertedId ? { id: insertedId, inserted: true } : null;
}

export async function syncAccountsToDb(
  accountSnapshots: Map<string, MondayAccountSnapshot>
): Promise<{ accountIdByMondayId: Map<string, number>; synced: number }> {
  const rows = [...accountSnapshots.values()];
  const accountIdByMondayId = new Map<string, number>();
  if (rows.length === 0) {
    return { accountIdByMondayId, synced: 0 };
  }

  const mondayIds = rows.map((row) => row.mondayItemId);
  const mondayPlaceholders = mondayIds
    .map((_, idx) => `$${idx + 1}`)
    .join(", ");
  const existingByMondayRows = await db
    .query<SqlAccountRow>(
      `SELECT id, monday_account_id, domain
       FROM accounts
       WHERE monday_account_id IN (${mondayPlaceholders})`
    )
    .all(...mondayIds);

  const existingByMondayId = new Map<string, SqlAccountRow>();
  for (const row of existingByMondayRows) {
    if (row.monday_account_id) {
      existingByMondayId.set(row.monday_account_id, row);
    }
  }

  const unresolved = rows.filter(
    (row) => !existingByMondayId.has(row.mondayItemId)
  );
  const unresolvedDomains = [
    ...new Set(
      unresolved
        .map((row) => row.domain)
        .filter((domain): domain is string => Boolean(domain))
    ),
  ];

  const existingByDomain = new Map<string, SqlAccountRow>();
  if (unresolvedDomains.length > 0) {
    const domainPlaceholders = unresolvedDomains
      .map((_, idx) => `$${idx + 1}`)
      .join(", ");
    const existingByDomainRows = await db
      .query<SqlAccountRow>(
        `SELECT id, monday_account_id, domain
         FROM accounts
         WHERE domain IN (${domainPlaceholders})`
      )
      .all(...unresolvedDomains);
    for (const row of existingByDomainRows) {
      if (row.domain) {
        existingByDomain.set(row.domain, row);
      }
    }
  }

  let synced = 0;
  for (const row of rows) {
    const resolved = await resolveAccountRow(
      row,
      existingByMondayId,
      existingByDomain
    );
    if (resolved) {
      accountIdByMondayId.set(row.mondayItemId, resolved.id);
      if (resolved.inserted) {
        synced++;
      }
    }
  }

  return { accountIdByMondayId, synced };
}

// ── DB sync: contacts ──────────────────────────────────────────────────

export async function syncContactsToDb(
  contactSnapshots: Map<string, MondayContactSnapshot>,
  accountIdByMondayId: Map<string, number>
): Promise<{ contactIdByMondayId: Map<string, number>; synced: number }> {
  const rows = [...contactSnapshots.values()];
  const contactIdByMondayId = new Map<string, number>();
  if (rows.length === 0) {
    return { contactIdByMondayId, synced: 0 };
  }

  for (const batch of chunk(rows, SQL_WRITE_BATCH_SIZE)) {
    const valuesSql = batch
      .map((_, idx) => {
        const start = idx * 14 + 1;
        const placeholders = Array.from(
          { length: 14 },
          (_, colIdx) => `$${start + colIdx}`
        ).join(", ");
        return `(${placeholders}, now(), now())`;
      })
      .join(", ");
    const args: Array<string | number | null> = [];

    for (const row of batch) {
      args.push(
        row.mondayItemId,
        row.name,
        row.email,
        row.phone,
        row.title,
        row.priority,
        row.contractorMondayId
          ? (accountIdByMondayId.get(row.contractorMondayId) ?? null)
          : null,
        row.contractorMondayId,
        row.groupId,
        row.groupTitle,
        row.mobilePhone,
        row.officePhone,
        row.companyPhone,
        row.companyFax
      );
    }

    // Add-only: insert new contacts, skip existing ones
    await db.run(
      `INSERT INTO contacts (
         monday_item_id, name, email, phone, title, priority,
         account_id, contractor_monday_id,
         group_id, group_title,
         mobile_phone, office_phone, company_phone, company_fax,
         synced_at, updated_at
       ) VALUES ${valuesSql}
       ON CONFLICT (monday_item_id) DO NOTHING`,
      args
    );
  }

  const mondayIds = rows.map((row) => row.mondayItemId);
  for (const batch of chunk(mondayIds, SQL_WRITE_BATCH_SIZE)) {
    const contactPlaceholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");
    const existing = await db
      .query<SqlContactIdRow>(
        `SELECT id, monday_item_id
         FROM contacts
         WHERE monday_item_id IN (${contactPlaceholders})`
      )
      .all(...batch);

    for (const row of existing) {
      contactIdByMondayId.set(row.monday_item_id, row.id);
    }
  }

  return { contactIdByMondayId, synced: rows.length };
}

// ── DB sync: estimate<->contact links ──────────────────────────────────

async function replaceEstimateContactLinks(
  touchedEstimateIds: number[],
  rows: Array<{ estimateId: number; contactId: number; source: string }>
): Promise<void> {
  if (touchedEstimateIds.length === 0) {
    return;
  }

  for (const batch of chunk(touchedEstimateIds, SQL_WRITE_BATCH_SIZE)) {
    const deletePlaceholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");
    await db.run(
      `DELETE FROM estimate_contacts
       WHERE estimate_id IN (${deletePlaceholders})
         AND source IN ('${RELATION_SOURCE_DIRECT}', '${RELATION_SOURCE_LEGACY}')`,
      batch
    );
  }

  if (rows.length === 0) {
    return;
  }

  for (const batch of chunk(rows, SQL_WRITE_BATCH_SIZE)) {
    const valuesSql = batch
      .map((_, idx) => buildTuplePlaceholders(3, idx))
      .join(", ");
    const args: Array<number | string> = [];
    for (const row of batch) {
      args.push(row.estimateId, row.contactId, row.source);
    }

    await db.run(
      `INSERT INTO estimate_contacts (estimate_id, contact_id, source)
       VALUES ${valuesSql}
       ON CONFLICT (estimate_id, contact_id) DO UPDATE
       SET source = CASE
         WHEN EXCLUDED.source = '${RELATION_SOURCE_DIRECT}' THEN EXCLUDED.source
         ELSE estimate_contacts.source
       END`,
      args
    );
  }
}

export async function syncEstimateContactLinks(
  pairs: EstimateContactPair[],
  estimateIdByMondayId: Map<string, number>,
  contactIdByMondayId: Map<string, number>
): Promise<{
  resolved: number;
  missingEstimate: number;
  missingContact: number;
  touchedEstimates: number;
}> {
  const dedup = new Map<
    string,
    { estimateId: number; contactId: number; source: string }
  >();
  let missingEstimate = 0;
  let missingContact = 0;

  for (const pair of pairs) {
    const estimateId = estimateIdByMondayId.get(pair.estimateMondayId);
    if (!estimateId) {
      missingEstimate++;
      continue;
    }

    const contactId = contactIdByMondayId.get(pair.contactMondayId);
    if (!contactId) {
      missingContact++;
      continue;
    }

    const key = `${estimateId}:${contactId}`;
    const current = dedup.get(key);
    if (
      !current ||
      pair.source === RELATION_SOURCE_DIRECT ||
      current.source !== RELATION_SOURCE_DIRECT
    ) {
      dedup.set(key, { estimateId, contactId, source: pair.source });
    }
  }

  const touchedEstimateIds = [...new Set([...estimateIdByMondayId.values()])];
  await replaceEstimateContactLinks(touchedEstimateIds, [...dedup.values()]);

  return {
    resolved: dedup.size,
    missingEstimate,
    missingContact,
    touchedEstimates: touchedEstimateIds.length,
  };
}
