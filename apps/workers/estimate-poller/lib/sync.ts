/**
 * Quiet estimate sync: Monday ESTIMATING board → hub.db estimates table.
 *
 * Reuses the Monday client from @monday/client and the shared hub.db
 * connection from @lib/db/hub. Returns stats instead of printing.
 */
import { db } from "@lib/db/hub";
import { getItemsRich, type MondayItemRich, query } from "@monday/client";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types";

const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_PREFIX_REGEX = /^www\./;

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

export interface SyncResult {
  fetched: number;
  upserted: number;
  errors: number;
  changes: StatusChange[];
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

function extractAccountId(item: MondayItemRich): string | null {
  const colValue = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  return colValue?.linkedItemIds?.[0] ?? null;
}

async function fetchAccountDomains(
  accountIds: string[]
): Promise<Map<string, string>> {
  const domainMap = new Map<string, string>();
  if (accountIds.length === 0) {
    return domainMap;
  }

  const uniqueIds = [...new Set(accountIds)];

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const result = await query<{
      items: Array<{
        id: string;
        column_values: Array<{ id: string; text: string | null }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          column_values(ids: ["company_domain"]) {
            id
            text
          }
        }
      }
    `);

    for (const item of result.items) {
      const domainCol = item.column_values.find(
        (cv) => cv.id === "company_domain"
      );
      if (domainCol?.text) {
        let domain = domainCol.text.split(" - ")[0].trim();
        domain = domain
          .replace(PROTOCOL_REGEX, "")
          .replace(WWW_PREFIX_REGEX, "")
          .split("/")[0];
        domainMap.set(item.id, domain);
      }
    }
  }

  return domainMap;
}

function extractEstimateRow(
  item: MondayItemRich,
  domainMap: Map<string, string>
): EstimateRow {
  const cols = item.columns;
  const accountMondayId = extractAccountId(item);
  const accountDomain = accountMondayId
    ? (domainMap.get(accountMondayId) ?? null)
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
 * Run a full sync cycle: fetch all estimates from Monday, upsert into hub.db,
 * detect status changes.
 */
export async function syncEstimates(): Promise<SyncResult> {
  // Snapshot before sync
  const before = await snapshotStatuses();

  // Fetch from Monday
  let items = await getItemsRich(BOARD_IDS.ESTIMATING);
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));

  // Batch-fetch account domains
  const accountIds = items
    .map((item) => extractAccountId(item))
    .filter((id): id is string => id !== null);
  const domainMap = await fetchAccountDomains(accountIds);

  // Upsert all
  let upserted = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const row = extractEstimateRow(item, domainMap);
      await db.run(
        `INSERT INTO estimates (
          monday_item_id, name, estimate_number, contractor,
          group_id, group_title, monday_url,
          account_monday_id, account_domain,
          bid_status, bid_value, awarded_value, bid_source,
          awarded, due_date, location, sharepoint_url,
          synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
        ON CONFLICT(monday_item_id) DO UPDATE SET
          name = excluded.name,
          estimate_number = COALESCE(excluded.estimate_number, estimates.estimate_number),
          contractor = excluded.contractor,
          group_id = excluded.group_id,
          group_title = excluded.group_title,
          monday_url = excluded.monday_url,
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
          updated_at = now()`,
        [
          row.mondayItemId,
          row.name,
          row.estimateNumber,
          row.contractor,
          row.groupId,
          row.groupTitle,
          row.mondayUrl,
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
      );
      upserted++;
    } catch {
      errors++;
    }
  }

  // Detect status changes
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

  return { fetched: items.length, upserted, errors, changes };
}
