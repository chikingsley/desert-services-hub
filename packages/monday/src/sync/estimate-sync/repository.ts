import { db } from "@lib/db/client";
import type { EstimateUpsertRow } from "./types";

const upsertEstimate = db.query<{ id: number }>(`
  INSERT INTO estimates (
    monday_item_id, name, estimate_number, contractor,
    group_id, group_title, monday_url,
    account_id, account_monday_id, account_domain,
    bid_status, bid_value, awarded_value, bid_source,
    awarded, due_date, location, lat, lng, sharepoint_url,
    synced_at, updated_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now(), now())
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
    lat = COALESCE(excluded.lat, estimates.lat),
    lng = COALESCE(excluded.lng, estimates.lng),
    sharepoint_url = COALESCE(excluded.sharepoint_url, estimates.sharepoint_url),
    synced_at = now(),
    updated_at = now()
  RETURNING id
`);

export async function upsertEstimateRow(
  row: EstimateUpsertRow
): Promise<number | null> {
  const result = await upsertEstimate.all(
    row.mondayItemId,
    row.name,
    row.estimateNumber,
    row.contractor,
    row.groupId,
    row.groupTitle,
    row.mondayUrl,
    row.accountId,
    row.accountMondayId,
    row.accountDomain,
    row.bidStatus,
    row.bidValue,
    row.awardedValue,
    row.bidSource,
    row.awarded ? 1 : 0,
    row.dueDate,
    row.location,
    row.lat,
    row.lng,
    row.sharepointUrl
  );

  return result[0]?.id ?? null;
}
