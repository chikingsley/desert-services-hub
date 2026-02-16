/**
 * Monday sync job for a single item.
 */

import { db } from "@lib/db/hub";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import { getItemRich } from "@monday/client";
import { ESTIMATING_COLUMNS } from "@monday/types";
import { SKIP_GROUPS } from "./helpers";

interface FileColumnValue {
  id: string;
  value: string | null;
}

const PROTOCOL_RE = /^https?:\/\//;
const WWW_RE = /^www\./;

interface FileColumnAsset {
  assetId: number;
  name: string;
}

const FILE_COLUMNS = {
  [ESTIMATING_COLUMNS.ESTIMATE.id]: "estimate_storage_path",
} as const;

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function extractLinkedId(
  item: { columnValues: Array<{ id: string; linkedItemIds?: string[] }> },
  columnId: string
): string | null {
  const col = item.columnValues.find((cv) => cv.id === columnId);
  return col?.linkedItemIds?.[0] ?? null;
}

function parseFileColumnValue(rawValue: string | null): FileColumnAsset[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      files?: Array<{ assetId: number; name: string }>;
    };
    return (
      parsed.files?.map((file) => ({
        assetId: file.assetId,
        name: file.name,
      })) ?? []
    );
  } catch {
    return [];
  }
}

/**
 * Check if an item has files in estimate file columns.
 */
export function itemHasFiles(columnValues: FileColumnValue[]): boolean {
  for (const col of columnValues) {
    if (col.id in FILE_COLUMNS && col.value) {
      const assets = parseFileColumnValue(col.value);
      if (assets.length > 0) {
        return true;
      }
    }
  }
  return false;
}

function normalizeSharePointUrl(rawUrl: string | null): string | null {
  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace(PROTOCOL_RE, "https://").replace(WWW_RE, "");
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

export async function syncItem(mondayItemId: string): Promise<boolean> {
  const item = await getItemRich(mondayItemId);
  if (!item) {
    console.log(`[monday] Item ${mondayItemId} not found in Monday`);
    return false;
  }

  if (SKIP_GROUPS.includes(item.groupTitle)) {
    return false;
  }

  const cols = item.columns;
  const accountMondayId = extractLinkedId(
    item,
    ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  const accountDomain = await lookupAccountDomain(accountMondayId);
  const accountId = await lookupAccountId(accountMondayId);

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
    normalizeSharePointUrl(cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id])
  )) as Array<{ id: number }>;

  const estimateId = upsertResult[0]?.id ?? null;
  if (estimateId) {
    await ensureEstimateHasCurrentVersion(estimateId, {
      source: "sync",
      total: bidValue ?? 0,
    });
  }

  console.log(`[monday] Synced: ${item.name} (${item.id})`);

  const shouldDownloadFiles = itemHasFiles(item.columnValues);
  if (estimateId) {
    console.log(`[monday] Synced estimate row id ${estimateId}`);
  }

  if (shouldDownloadFiles) {
    console.log(`[monday] Item ${mondayItemId} has downloadable files`);
  }

  return shouldDownloadFiles;
}
