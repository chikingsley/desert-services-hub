/**
 * Account, contact, and link sync from Monday.com boards to Postgres.
 *
 * Extracted from sync.ts — handles fetching snapshots from Monday's
 * CONTRACTORS and CONTACTS boards, upserting into accounts/contacts tables,
 * and maintaining estimate_contacts join table.
 */
import { db } from "@lib/db/hub";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";
import { chunk } from "./sql-utils";

const RELATION_SOURCE_DIRECT = "monday.direct_contacts";
const RELATION_SOURCE_LEGACY = "monday.legacy_deal_contact";
const SQL_WRITE_BATCH_SIZE = 250;

const NUMERIC_ID_REGEX = /^\d+$/;
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_PREFIX_REGEX = /^www\./;

// ── Types ──────────────────────────────────────────────────────────────

export interface MondayAccountSnapshot {
  mondayItemId: string;
  name: string;
  domain: string | null;
}

export interface MondayContactSnapshot {
  mondayItemId: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  officePhone: string | null;
  companyPhone: string | null;
  companyFax: string | null;
  title: string | null;
  priority: string | null;
  contractorMondayId: string | null;
  groupId: string;
  groupTitle: string;
}

export interface EstimateContactPair {
  estimateMondayId: string;
  contactMondayId: string;
  source: typeof RELATION_SOURCE_DIRECT | typeof RELATION_SOURCE_LEGACY;
}

export interface RelationPairCollection {
  pairs: EstimateContactPair[];
  mondayPairsDirect: number;
  mondayPairsLegacy: number;
}

export interface LinkStats {
  mondayPairsDirect: number;
  mondayPairsLegacy: number;
  mondayPairsUnique: number;
  estimateContactsResolved: number;
  missingEstimate: number;
  missingContact: number;
  touchedEstimates: number;
  contactsSynced: number;
  accountsSynced: number;
}

interface SqlAccountRow {
  id: number;
  monday_account_id: string | null;
  domain: string | null;
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

export async function syncAccountsToDb(
  accountSnapshots: Map<string, MondayAccountSnapshot>
): Promise<{ accountIdByMondayId: Map<string, number>; synced: number }> {
  const rows = [...accountSnapshots.values()];
  const accountIdByMondayId = new Map<string, number>();
  if (rows.length === 0) {
    return { accountIdByMondayId, synced: 0 };
  }

  const mondayIds = rows.map((row) => row.mondayItemId);
  const mondayPlaceholders = mondayIds.map(() => "?").join(", ");
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
    const domainPlaceholders = unresolvedDomains.map(() => "?").join(", ");
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
    const byMonday = existingByMondayId.get(row.mondayItemId);
    if (byMonday) {
      await db.run(
        `UPDATE accounts
         SET monday_name = ?,
             name = ?,
             domain = COALESCE(?, domain),
             type = 'contractor',
             updated_at = now()
         WHERE id = ?`,
        [row.name, row.name, row.domain, byMonday.id]
      );
      accountIdByMondayId.set(row.mondayItemId, byMonday.id);
      synced++;
      continue;
    }

    const byDomain = row.domain ? existingByDomain.get(row.domain) : undefined;
    if (byDomain) {
      await db.run(
        `UPDATE accounts
         SET monday_account_id = ?,
             monday_name = ?,
             name = ?,
             domain = COALESCE(?, domain),
             type = 'contractor',
             updated_at = now()
         WHERE id = ?`,
        [row.mondayItemId, row.name, row.name, row.domain, byDomain.id]
      );
      accountIdByMondayId.set(row.mondayItemId, byDomain.id);
      synced++;
      continue;
    }

    const inserted = (await db.run(
      `INSERT INTO accounts (
         domain, name, type, monday_account_id, monday_name, updated_at
       ) VALUES (?, ?, 'contractor', ?, ?, now())
       RETURNING id`,
      [row.domain, row.name, row.mondayItemId, row.name]
    )) as Array<{ id: number }>;

    const insertedId = inserted[0]?.id;
    if (insertedId) {
      accountIdByMondayId.set(row.mondayItemId, insertedId);
      synced++;
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
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())")
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

    await db.run(
      `INSERT INTO contacts (
         monday_item_id, name, email, phone, title, priority,
         account_id, contractor_monday_id,
         group_id, group_title,
         mobile_phone, office_phone, company_phone, company_fax,
         synced_at, updated_at
       ) VALUES ${valuesSql}
       ON CONFLICT (monday_item_id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         phone = excluded.phone,
         title = excluded.title,
         priority = excluded.priority,
         account_id = excluded.account_id,
         contractor_monday_id = excluded.contractor_monday_id,
         group_id = excluded.group_id,
         group_title = excluded.group_title,
         mobile_phone = excluded.mobile_phone,
         office_phone = excluded.office_phone,
         company_phone = excluded.company_phone,
         company_fax = excluded.company_fax,
         synced_at = now(),
         updated_at = now()`,
      args
    );
  }

  const mondayIds = rows.map((row) => row.mondayItemId);
  for (const batch of chunk(mondayIds, SQL_WRITE_BATCH_SIZE)) {
    const contactPlaceholders = batch.map(() => "?").join(", ");
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
    const deletePlaceholders = batch.map(() => "?").join(", ");
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
    const valuesSql = batch.map(() => "(?, ?, ?)").join(", ");
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
