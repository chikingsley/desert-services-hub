/**
 * Quiet estimate sync: Monday ESTIMATING board -> Supabase Postgres estimates table.
 *
 * Reuses the Monday client from @monday/client and the shared Postgres repository layer
 * connection from @lib/db/hub. Returns stats instead of printing.
 */
import { db } from "@lib/db/hub";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import { getItemsRich, type MondayItemRich, query } from "@monday/client";
import {
  BOARD_IDS,
  CONTACTS_COLUMNS,
  CONTRACTORS_COLUMNS,
  ESTIMATING_COLUMNS,
} from "@monday/types";

const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_PREFIX_REGEX = /^www\./;
const NUMERIC_ID_REGEX = /^\d+$/;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const RELATION_SOURCE_DIRECT = "monday.direct_contacts";
const RELATION_SOURCE_LEGACY = "monday.legacy_deal_contact";
const ACCOUNT_BATCH_SIZE = 100;
const CONTACT_BATCH_SIZE = 50;
const SQL_WRITE_BATCH_SIZE = 250;

interface EstimateRow {
  mondayItemId: string;
  name: string;
  estimateNumber: string | null;
  contractor: string | null;
  groupId: string;
  groupTitle: string;
  mondayUrl: string;
  accountMondayId: string | null;
  accountDomain: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  awardedValue: number | null;
  bidSource: string | null;
  awarded: boolean;
  dueDate: string | null;
  location: string | null;
  sharepointUrl: string | null;
}

interface MondayAccountSnapshot {
  mondayItemId: string;
  name: string;
  domain: string | null;
}

interface MondayContactSnapshot {
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

interface EstimateContactPair {
  estimateMondayId: string;
  contactMondayId: string;
  source: typeof RELATION_SOURCE_DIRECT | typeof RELATION_SOURCE_LEGACY;
}

interface RelationPairCollection {
  pairs: EstimateContactPair[];
  mondayPairsDirect: number;
  mondayPairsLegacy: number;
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

interface LinkStats {
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

export interface SyncResult {
  fetched: number;
  upserted: number;
  errors: number;
  changes: StatusChange[];
  estimateFileItemIds: string[];
  linkStats: LinkStats;
}

export interface StatusChange {
  mondayItemId: string;
  name: string;
  oldStatus: string | null;
  newStatus: string | null;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function hasEstimateFiles(item: MondayItemRich): boolean {
  const estimateCol = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.ESTIMATE.id
  );
  if (!estimateCol?.value) {
    return false;
  }

  try {
    const parsed = JSON.parse(estimateCol.value) as {
      files?: Array<{ assetId?: number }>;
    };
    return (
      parsed.files?.some((file) =>
        Number.isFinite(file.assetId ?? Number.NaN)
      ) ?? false
    );
  } catch {
    return false;
  }
}

function sanitizeMondayId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return NUMERIC_ID_REGEX.test(trimmed) ? trimmed : null;
}

function uniqueNumericIds(
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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlStringList(values: string[]): string {
  return values.map(sqlQuote).join(", ");
}

function sqlNumberList(values: number[]): string {
  return values.join(", ");
}

function extractEmail(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const match = raw.match(EMAIL_REGEX);
  return match?.[0]?.toLowerCase() ?? null;
}

function normalizeDomain(raw: string | null | undefined): string | null {
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

function getColumnText(
  columns: Array<{ id: string; text: string | null }>,
  columnId: string
): string | null {
  return columns.find((col) => col.id === columnId)?.text ?? null;
}

function getColumnRelationHead(
  columns: Array<{ id: string; linked_item_ids?: string[] }>,
  columnId: string
): string | null {
  const linked = columns.find((col) => col.id === columnId)?.linked_item_ids;
  return sanitizeMondayId(linked?.[0]);
}

function readLinkedIds(item: MondayItemRich, columnId: string): string[] {
  const col = item.columnValues.find((cv) => cv.id === columnId);
  return uniqueNumericIds(col?.linkedItemIds ?? []);
}

function extractAccountId(item: MondayItemRich): string | null {
  const colValue = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  return sanitizeMondayId(colValue?.linkedItemIds?.[0]);
}

function collectEstimateContactPairs(
  items: MondayItemRich[]
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
      item,
      ESTIMATING_COLUMNS.CONTACTS_DIRECT.id
    );
    const legacyIds = readLinkedIds(item, ESTIMATING_COLUMNS.CONTACTS.id);

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

async function fetchAccountSnapshots(
  accountIds: string[]
): Promise<Map<string, MondayAccountSnapshot>> {
  const snapshots = new Map<string, MondayAccountSnapshot>();
  const uniqueIds = uniqueNumericIds(accountIds);
  if (uniqueIds.length === 0) {
    return snapshots;
  }

  for (const batch of chunk(uniqueIds, ACCOUNT_BATCH_SIZE)) {
    const result = await query<{
      items: Array<{
        id: string;
        name: string;
        column_values: Array<{ id: string; text: string | null }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          name
          column_values(ids: ["${CONTRACTORS_COLUMNS.DOMAIN.id}"]) {
            id
            text
          }
        }
      }
    `);

    for (const item of result.items) {
      snapshots.set(item.id, {
        mondayItemId: item.id,
        name: item.name.trim() || item.name,
        domain: normalizeDomain(
          getColumnText(item.column_values, CONTRACTORS_COLUMNS.DOMAIN.id)
        ),
      });
    }
  }

  return snapshots;
}

async function fetchContactSnapshots(
  contactIds: string[]
): Promise<Map<string, MondayContactSnapshot>> {
  const snapshots = new Map<string, MondayContactSnapshot>();
  const uniqueIds = uniqueNumericIds(contactIds);
  if (uniqueIds.length === 0) {
    return snapshots;
  }

  const contactColumnIds = [
    CONTACTS_COLUMNS.EMAIL.id,
    CONTACTS_COLUMNS.PHONE.id,
    CONTACTS_COLUMNS.MOBILE_PHONE.id,
    CONTACTS_COLUMNS.OFFICE_PHONE.id,
    CONTACTS_COLUMNS.COMPANY_PHONE.id,
    CONTACTS_COLUMNS.COMPANY_FAX.id,
    CONTACTS_COLUMNS.TITLE.id,
    CONTACTS_COLUMNS.PRIORITY.id,
    CONTACTS_COLUMNS.CONTRACTOR.id,
  ];
  const columnLiteral = contactColumnIds.map((id) => `"${id}"`).join(", ");

  for (const batch of chunk(uniqueIds, CONTACT_BATCH_SIZE)) {
    const result = await query<{
      items: Array<{
        id: string;
        name: string;
        group: { id: string; title: string };
        column_values: Array<{
          id: string;
          text: string | null;
          linked_item_ids?: string[];
        }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          name
          group {
            id
            title
          }
          column_values(ids: [${columnLiteral}]) {
            id
            text
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    `);

    for (const item of result.items) {
      snapshots.set(item.id, {
        mondayItemId: item.id,
        name: item.name.trim() || item.name,
        email: extractEmail(
          getColumnText(item.column_values, CONTACTS_COLUMNS.EMAIL.id)
        ),
        phone: getColumnText(item.column_values, CONTACTS_COLUMNS.PHONE.id),
        mobilePhone: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.MOBILE_PHONE.id
        ),
        officePhone: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.OFFICE_PHONE.id
        ),
        companyPhone: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.COMPANY_PHONE.id
        ),
        companyFax: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.COMPANY_FAX.id
        ),
        title: getColumnText(item.column_values, CONTACTS_COLUMNS.TITLE.id),
        priority: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.PRIORITY.id
        ),
        contractorMondayId: getColumnRelationHead(
          item.column_values,
          CONTACTS_COLUMNS.CONTRACTOR.id
        ),
        groupId: item.group?.id ?? "",
        groupTitle: item.group?.title ?? "",
      });
    }
  }

  return snapshots;
}

async function syncAccountsToDb(
  accountSnapshots: Map<string, MondayAccountSnapshot>
): Promise<{ accountIdByMondayId: Map<string, number>; synced: number }> {
  const rows = [...accountSnapshots.values()];
  const accountIdByMondayId = new Map<string, number>();
  if (rows.length === 0) {
    return { accountIdByMondayId, synced: 0 };
  }

  const mondayIds = rows.map((row) => row.mondayItemId);
  const existingByMondayRows = await db
    .query<SqlAccountRow>(
      `SELECT id, monday_account_id, domain
       FROM accounts
       WHERE monday_account_id IN (${sqlStringList(mondayIds)})`
    )
    .all();

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
    const existingByDomainRows = await db
      .query<SqlAccountRow>(
        `SELECT id, monday_account_id, domain
         FROM accounts
         WHERE domain IN (${sqlStringList(unresolvedDomains)})`
      )
      .all();
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

async function syncContactsToDb(
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
    const existing = await db
      .query<SqlContactIdRow>(
        `SELECT id, monday_item_id
         FROM contacts
         WHERE monday_item_id IN (${sqlStringList(batch)})`
      )
      .all();

    for (const row of existing) {
      contactIdByMondayId.set(row.monday_item_id, row.id);
    }
  }

  return { contactIdByMondayId, synced: rows.length };
}

async function replaceEstimateContactLinks(
  touchedEstimateIds: number[],
  rows: Array<{ estimateId: number; contactId: number; source: string }>
): Promise<void> {
  if (touchedEstimateIds.length === 0) {
    return;
  }

  for (const batch of chunk(touchedEstimateIds, SQL_WRITE_BATCH_SIZE)) {
    await db.run(
      `DELETE FROM estimate_contacts
       WHERE estimate_id IN (${sqlNumberList(batch)})`
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

async function syncEstimateContactLinks(
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

function extractEstimateRow(
  item: MondayItemRich,
  accountSnapshots: Map<string, MondayAccountSnapshot>
): EstimateRow {
  const cols = item.columns;
  const accountMondayId = extractAccountId(item);
  const accountDomain = accountMondayId
    ? (accountSnapshots.get(accountMondayId)?.domain ?? null)
    : null;

  return {
    mondayItemId: item.id,
    name: item.name,
    estimateNumber: cols[ESTIMATING_COLUMNS.ESTIMATE_ID.id] ?? null,
    contractor: cols[ESTIMATING_COLUMNS.CONTRACTOR.id] ?? null,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
    mondayUrl: item.url,
    accountMondayId,
    accountDomain,
    bidStatus: cols[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null,
    bidValue: parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]),
    awardedValue: parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    bidSource: cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    awarded: cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes",
    dueDate: cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    location: cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    sharepointUrl: cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? null,
  };
}

/**
 * Snapshot current bid_status for all estimates, keyed by monday_item_id.
 * Used to detect status changes after upsert.
 */
async function snapshotStatuses(): Promise<Map<string, string | null>> {
  const rows = await db
    .query<{ monday_item_id: string; bid_status: string | null }>(
      "SELECT monday_item_id, bid_status FROM estimates WHERE monday_item_id IS NOT NULL"
    )
    .all();

  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(row.monday_item_id, row.bid_status);
  }
  return map;
}

/**
 * Run a full sync cycle: fetch all estimates from Monday, upsert into Supabase Postgres,
 * sync estimate<->contact/account links, and detect status changes.
 */
export async function syncEstimates(): Promise<SyncResult> {
  const before = await snapshotStatuses();

  let items = await getItemsRich(BOARD_IDS.ESTIMATING);
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
  const estimateFileItemIds = items
    .filter(hasEstimateFiles)
    .map((item) => item.id);

  const pairCollection = collectEstimateContactPairs(items);
  const contactIds = uniqueNumericIds(
    pairCollection.pairs.map((pair) => pair.contactMondayId)
  );

  const contactSnapshots = await fetchContactSnapshots(contactIds);
  const contactAccountIds = uniqueNumericIds(
    [...contactSnapshots.values()].map(
      (snapshot) => snapshot.contractorMondayId
    )
  );
  const directEstimateAccountIds = uniqueNumericIds(
    items.map((item) => extractAccountId(item))
  );

  const accountSnapshots = await fetchAccountSnapshots([
    ...directEstimateAccountIds,
    ...contactAccountIds,
  ]);
  const { accountIdByMondayId, synced: accountsSynced } =
    await syncAccountsToDb(accountSnapshots);
  const { contactIdByMondayId, synced: contactsSynced } =
    await syncContactsToDb(contactSnapshots, accountIdByMondayId);

  let upserted = 0;
  let errors = 0;
  const estimateIdByMondayId = new Map<string, number>();

  for (const item of items) {
    try {
      const row = extractEstimateRow(item, accountSnapshots);
      const estimateAccountId = row.accountMondayId
        ? (accountIdByMondayId.get(row.accountMondayId) ?? null)
        : null;
      const upsertResult = (await db.run(
        `INSERT INTO estimates (
          monday_item_id, name, estimate_number, contractor,
          group_id, group_title, monday_url,
          account_id, account_monday_id, account_domain,
          bid_status, bid_value, awarded_value, bid_source,
          awarded, due_date, location, sharepoint_url,
          synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
        ON CONFLICT(monday_item_id) DO UPDATE SET
          name = excluded.name,
          estimate_number = COALESCE(excluded.estimate_number, estimates.estimate_number),
          contractor = excluded.contractor,
          group_id = excluded.group_id,
          group_title = excluded.group_title,
          monday_url = excluded.monday_url,
          account_id = COALESCE(excluded.account_id, estimates.account_id),
          account_monday_id = COALESCE(excluded.account_monday_id, estimates.account_monday_id),
          account_domain = COALESCE(excluded.account_domain, estimates.account_domain),
          bid_status = excluded.bid_status,
          bid_value = excluded.bid_value,
          awarded_value = excluded.awarded_value,
          bid_source = excluded.bid_source,
          awarded = excluded.awarded,
          due_date = excluded.due_date,
          location = excluded.location,
          sharepoint_url = COALESCE(excluded.sharepoint_url, estimates.sharepoint_url),
          synced_at = now(),
          updated_at = now()
        RETURNING id`,
        [
          row.mondayItemId,
          row.name,
          row.estimateNumber,
          row.contractor,
          row.groupId,
          row.groupTitle,
          row.mondayUrl,
          estimateAccountId,
          row.accountMondayId,
          row.accountDomain,
          row.bidStatus,
          row.bidValue,
          row.awardedValue,
          row.bidSource,
          row.awarded ? 1 : 0,
          row.dueDate,
          row.location,
          row.sharepointUrl,
        ]
      )) as Array<{ id: number }>;

      const estimateId = upsertResult[0]?.id;
      if (estimateId) {
        estimateIdByMondayId.set(row.mondayItemId, estimateId);
        await ensureEstimateHasCurrentVersion(estimateId, {
          source: "sync",
          total: row.bidValue ?? 0,
        });
      }
      upserted++;
    } catch {
      errors++;
    }
  }

  const linkSync = await syncEstimateContactLinks(
    pairCollection.pairs,
    estimateIdByMondayId,
    contactIdByMondayId
  );

  const changes: StatusChange[] = [];
  for (const item of items) {
    const oldStatus = before.get(item.id) ?? null;
    const newStatus = item.columns[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null;

    if (oldStatus !== newStatus && before.has(item.id)) {
      changes.push({
        mondayItemId: item.id,
        name: item.name,
        oldStatus,
        newStatus,
      });
    }
  }

  const linkStats: LinkStats = {
    mondayPairsDirect: pairCollection.mondayPairsDirect,
    mondayPairsLegacy: pairCollection.mondayPairsLegacy,
    mondayPairsUnique: pairCollection.pairs.length,
    estimateContactsResolved: linkSync.resolved,
    missingEstimate: linkSync.missingEstimate,
    missingContact: linkSync.missingContact,
    touchedEstimates: linkSync.touchedEstimates,
    contactsSynced,
    accountsSynced,
  };

  return {
    fetched: items.length,
    upserted,
    errors,
    changes,
    estimateFileItemIds,
    linkStats,
  };
}
