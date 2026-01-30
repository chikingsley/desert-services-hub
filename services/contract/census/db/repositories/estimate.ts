/**
 * Estimate Repository
 */
import { db } from "../connection";
import type { Estimate, UpsertEstimateData } from "../types";

function parseEstimateRow(row: Record<string, unknown>): Estimate {
  return {
    id: row.id as number,
    mondayItemId: row.monday_item_id as string,
    name: row.name as string,
    estimateNumber: row.estimate_number as string | null,
    contractor: row.contractor as string | null,
    groupId: row.group_id as string | null,
    groupTitle: row.group_title as string | null,
    mondayUrl: row.monday_url as string | null,
    accountMondayId: row.account_monday_id as string | null,
    accountDomain: row.account_domain as string | null,
    bidStatus: row.bid_status as string | null,
    bidValue: row.bid_value as number | null,
    awardedValue: row.awarded_value as number | null,
    bidSource: row.bid_source as string | null,
    awarded: row.awarded === 1,
    dueDate: row.due_date as string | null,
    location: row.location as string | null,
    sharepointUrl: row.sharepoint_url as string | null,
    estimateStorageBucket: row.estimate_storage_bucket as string | null,
    estimateStoragePath: row.estimate_storage_path as string | null,
    estimateFileName: row.estimate_file_name as string | null,
    estimateSyncedAt: row.estimate_synced_at as string | null,
    plansStoragePath: row.plans_storage_path as string | null,
    contractsStoragePath: row.contracts_storage_path as string | null,
    noiStoragePath: row.noi_storage_path as string | null,
    syncedAt: row.synced_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function upsertEstimate(data: UpsertEstimateData): number {
  db.run(
    `INSERT INTO estimates (
      monday_item_id, name, estimate_number, contractor, group_id, group_title,
      monday_url, account_monday_id, account_domain, bid_status, bid_value,
      awarded_value, bid_source, awarded, due_date, location, sharepoint_url,
      estimate_storage_bucket, estimate_storage_path, estimate_file_name, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(monday_item_id) DO UPDATE SET
      name = excluded.name,
      estimate_number = excluded.estimate_number,
      contractor = excluded.contractor,
      group_id = excluded.group_id,
      group_title = excluded.group_title,
      monday_url = excluded.monday_url,
      account_monday_id = excluded.account_monday_id,
      account_domain = excluded.account_domain,
      bid_status = excluded.bid_status,
      bid_value = excluded.bid_value,
      awarded_value = excluded.awarded_value,
      bid_source = excluded.bid_source,
      awarded = excluded.awarded,
      due_date = excluded.due_date,
      location = excluded.location,
      sharepoint_url = excluded.sharepoint_url,
      estimate_storage_bucket = COALESCE(excluded.estimate_storage_bucket, estimates.estimate_storage_bucket),
      estimate_storage_path = COALESCE(excluded.estimate_storage_path, estimates.estimate_storage_path),
      estimate_file_name = COALESCE(excluded.estimate_file_name, estimates.estimate_file_name),
      synced_at = datetime('now'),
      updated_at = datetime('now')`,
    [
      data.mondayItemId,
      data.name,
      data.estimateNumber ?? null,
      data.contractor ?? null,
      data.groupId ?? null,
      data.groupTitle ?? null,
      data.mondayUrl ?? null,
      data.accountMondayId ?? null,
      data.accountDomain ?? null,
      data.bidStatus ?? null,
      data.bidValue ?? null,
      data.awardedValue ?? null,
      data.bidSource ?? null,
      data.awarded ? 1 : 0,
      data.dueDate ?? null,
      data.location ?? null,
      data.sharepointUrl ?? null,
      data.estimateStorageBucket ?? null,
      data.estimateStoragePath ?? null,
      data.estimateFileName ?? null,
    ]
  );

  const row = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM estimates WHERE monday_item_id = ?"
    )
    .get(data.mondayItemId);

  return row?.id ?? 0;
}

export function updateEstimateStorage(
  mondayItemId: string,
  bucket: string,
  path: string,
  fileName: string
): void {
  db.run(
    `UPDATE estimates
     SET estimate_storage_bucket = ?,
         estimate_storage_path = ?,
         estimate_file_name = ?,
         estimate_synced_at = datetime('now'),
         updated_at = datetime('now')
     WHERE monday_item_id = ?`,
    [bucket, path, fileName, mondayItemId]
  );
}

export function updatePlansStorage(mondayItemId: string, path: string): void {
  db.run(
    `UPDATE estimates
     SET plans_storage_path = ?,
         updated_at = datetime('now')
     WHERE monday_item_id = ?`,
    [path, mondayItemId]
  );
}

export function getEstimateByMondayId(mondayItemId: string): Estimate | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM estimates WHERE monday_item_id = ?"
    )
    .get(mondayItemId);

  return row ? parseEstimateRow(row) : null;
}

export function getEstimateById(id: number): Estimate | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM estimates WHERE id = ?"
    )
    .get(id);

  return row ? parseEstimateRow(row) : null;
}

export function getAllEstimates(): Estimate[] {
  const rows = db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM estimates ORDER BY synced_at DESC"
    )
    .all();

  return rows.map(parseEstimateRow);
}

export function getEstimatesWithoutFile(): Estimate[] {
  const rows = db
    .query<Record<string, unknown>, []>(
      `SELECT * FROM estimates
       WHERE estimate_storage_path IS NULL
       ORDER BY synced_at DESC`
    )
    .all();

  return rows.map(parseEstimateRow);
}

export function getEstimateStats(): {
  total: number;
  withFile: number;
  withoutFile: number;
} {
  const total =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM estimates")
      .get()?.count ?? 0;

  const withFile =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE estimate_storage_path IS NOT NULL"
      )
      .get()?.count ?? 0;

  return {
    total,
    withFile,
    withoutFile: total - withFile,
  };
}

export function searchEstimates(query: string, limit = 50): Estimate[] {
  const pattern = `%${query}%`;
  const rows = db
    .query<Record<string, unknown>, [string, string, string, number]>(
      `SELECT * FROM estimates
       WHERE name LIKE ? OR estimate_number LIKE ? OR contractor LIKE ?
       ORDER BY synced_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit);

  return rows.map(parseEstimateRow);
}
