import { db } from "@lib/db/client";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import { getItemRich } from "@monday/client/rich";
import { SKIP_GROUPS } from "@monday/sync/helpers";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";
import {
  extractAccountId,
  normalizeSharePointUrl,
  parseLocationCoords,
  parseNumber,
} from "./fields";
import { itemHasEstimateFiles } from "./file-assets";
import { upsertEstimateRow } from "./repository";

async function lookupAccountRecord(
  accountMondayId: string | null
): Promise<{ accountId: number | null; accountDomain: string | null }> {
  if (!accountMondayId) {
    return { accountId: null, accountDomain: null };
  }

  const row = await db
    .query<{ id: number; domain: string | null }>(
      "SELECT id, domain FROM accounts WHERE monday_account_id = $1 LIMIT 1"
    )
    .get(accountMondayId);

  return {
    accountId: row?.id ?? null,
    accountDomain: row?.domain ?? null,
  };
}

export async function syncEstimateItem(mondayItemId: string): Promise<boolean> {
  const item = await getItemRich(mondayItemId);
  if (!item) {
    console.log(`[monday] Item ${mondayItemId} not found in Monday`);
    return false;
  }

  if (SKIP_GROUPS.includes(item.groupTitle)) {
    return false;
  }

  const cols = item.columns;
  const accountMondayId = extractAccountId(item);
  const { accountId, accountDomain } =
    await lookupAccountRecord(accountMondayId);
  const bidValue = parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]);
  const coords = parseLocationCoords(item);

  const estimateId = await upsertEstimateRow({
    mondayItemId: item.id,
    name: item.name,
    estimateNumber: cols[ESTIMATING_COLUMNS.ESTIMATE_ID.id] ?? null,
    contractor: cols[ESTIMATING_COLUMNS.CONTRACTOR.id] ?? null,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
    mondayUrl: item.url,
    accountId,
    accountMondayId,
    accountDomain,
    bidStatus: cols[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null,
    bidValue,
    awardedValue: parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    bidSource: cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    awarded: cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes",
    dueDate: cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    location: cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    sharepointUrl: normalizeSharePointUrl(
      cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id]
    ),
  });

  if (estimateId) {
    await ensureEstimateHasCurrentVersion(estimateId, {
      source: "sync",
      total: bidValue ?? 0,
    });
  }

  console.log(`[monday] Synced: ${item.name} (${item.id})`);

  const shouldDownloadFiles = itemHasEstimateFiles(item.columnValues);
  if (estimateId) {
    console.log(`[monday] Synced estimate row id ${estimateId}`);
  }

  if (shouldDownloadFiles) {
    console.log(`[monday] Item ${mondayItemId} has downloadable files`);
  }

  return shouldDownloadFiles;
}
