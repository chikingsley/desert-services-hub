/**
 * Monday item sync — fetch a single Monday item and upsert into estimates table.
 */

import { db } from "@lib/db/hub";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import { getItemRich } from "@monday/client";
import { ESTIMATING_COLUMNS } from "@monday/types";
import { itemHasFiles } from "@/apps/web/pipeline";
import { SKIP_GROUPS } from "./config";
import { enqueueJob } from "./queue";

// -- Helpers --

const PROTOCOL_RE = /^https?:\/\//;
const WWW_RE = /^www\./;

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replaceAll(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function extractLinkedId(
  item: { columnValues: { id: string; linkedItemIds?: string[] }[] },
  columnId: string
): string | null {
  const col = item.columnValues.find((cv) => cv.id === columnId);
  return col?.linkedItemIds?.[0] ?? null;
}

async function lookupAccountDomain(
  accountMondayId: string | null
): Promise<string | null> {
  if (!accountMondayId) {
    return null;
  }
  const row = await db
    .query<{ domain: string }>(
      "SELECT domain FROM accounts WHERE monday_account_id = ?"
    )
    .get(accountMondayId);
  return row?.domain ?? null;
}

async function lookupAccountId(
  accountMondayId: string | null
): Promise<number | null> {
  if (!accountMondayId) {
    return null;
  }
  const row = await db
    .query<{ id: number }>(
      "SELECT id FROM accounts WHERE monday_account_id = ? LIMIT 1"
    )
    .get(accountMondayId);
  return row?.id ?? null;
}

// -- Prepared statements --

const upsertEstimate = db.prepare(`
  INSERT INTO estimates (
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
  RETURNING id
`);

// -- Main --

export async function syncItem(mondayItemId: string): Promise<void> {
  const item = await getItemRich(mondayItemId);
  if (!item) {
    console.log(`[worker] Item ${mondayItemId} not found in Monday`);
    return;
  }

  if (SKIP_GROUPS.has(item.groupTitle)) {
    return;
  }

  const cols = item.columns;
  const accountMondayId = extractLinkedId(
    item,
    ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  const accountDomain = await lookupAccountDomain(accountMondayId);
  const accountId = await lookupAccountId(accountMondayId);

  // Parse SharePoint URL (link column returns "Label - URL" or just URL)
  let sharepointUrl = cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? null;
  if (sharepointUrl) {
    sharepointUrl = sharepointUrl
      .replace(PROTOCOL_RE, "https://")
      .replace(WWW_RE, "");
  }

  const bidValue = parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]);

  const upsertResult = (await upsertEstimate.run(
    item.id,
    item.name,
    cols[ESTIMATING_COLUMNS.ESTIMATE_ID.id] ?? null,
    cols[ESTIMATING_COLUMNS.CONTRACTOR.id] ?? null,
    item.groupId,
    item.groupTitle,
    item.url,
    accountId,
    accountMondayId,
    accountDomain,
    cols[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null,
    bidValue,
    parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes" ? 1 : 0,
    cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    sharepointUrl
  )) as { id: number }[];

  const estimateId = upsertResult[0]?.id;
  if (estimateId) {
    await ensureEstimateHasCurrentVersion(estimateId, {
      source: "sync",
      total: bidValue ?? 0,
    });
  }

  console.log(`[worker] Synced: ${item.name} (${item.id})`);

  // Enqueue file download if item has file columns with content
  if (itemHasFiles(item.columnValues)) {
    await enqueueJob.run("download_files", mondayItemId, "{}");
    console.log(`[worker] Enqueued download_files for ${mondayItemId}`);
  }
}
