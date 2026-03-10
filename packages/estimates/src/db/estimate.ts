/**
 * Estimate Repository
 */
import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import { parseBoolInt } from "@lib/db/parsers";
import { likeSearch } from "@lib/db/search";
import type { Estimate, UpsertEstimateData } from "@lib/db/types";
import { ensureEstimateHasCurrentVersion } from "@estimates/db/estimate-version";

type EstimateDbRow = Database["public"]["Tables"]["estimates"]["Row"];

function parseEstimateRow(row: EstimateDbRow): Estimate {
  return {
    id: row.id,
    mondayItemId: row.monday_item_id as string,
    name: row.name,
    estimateNumber: row.estimate_number,
    contractor: row.contractor,
    groupId: row.group_id,
    groupTitle: row.group_title,
    mondayUrl: row.monday_url,
    accountMondayId: row.account_monday_id,
    accountDomain: row.account_domain,
    bidStatus: row.bid_status,
    bidValue: row.bid_value,
    awardedValue: row.awarded_value,
    bidSource: row.bid_source,
    awarded: parseBoolInt(row.awarded),
    dueDate: row.due_date,
    location: row.location,
    sharepointUrl: row.sharepoint_url,
    estimateStoragePath: row.estimate_storage_path,
    estimateFileName: row.estimate_file_name,
    syncedAt: row.synced_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toEstimateUpsertParams(data: UpsertEstimateData): unknown[] {
  return [
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
    Number(data.awarded === true),
    data.dueDate ?? null,
    data.location ?? null,
    data.sharepointUrl ?? null,
    data.estimateStoragePath ?? null,
    data.estimateFileName ?? null,
  ];
}

export async function upsertEstimate(
  data: UpsertEstimateData
): Promise<number> {
  await db.run(
    `INSERT INTO estimates (
      monday_item_id, name, estimate_number, contractor, group_id, group_title,
      monday_url, account_monday_id, account_domain, bid_status, bid_value,
      awarded_value, bid_source, awarded, due_date, location, sharepoint_url,
      estimate_storage_path, estimate_file_name, synced_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
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
      estimate_storage_path = COALESCE(excluded.estimate_storage_path, estimates.estimate_storage_path),
      estimate_file_name = COALESCE(excluded.estimate_file_name, estimates.estimate_file_name),
      synced_at = now(),
      updated_at = now()`,
    toEstimateUpsertParams(data)
  );

  const row = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM estimates WHERE monday_item_id = $1"
    )
    .get(data.mondayItemId);

  const id = row?.id ?? 0;
  if (id > 0) {
    await ensureEstimateHasCurrentVersion(id, {
      source: "sync",
      total: data.bidValue ?? 0,
    });
  }

  return id;
}

export async function updateEstimateStorage(
  mondayItemId: string,
  _bucket: string,
  path: string,
  fileName: string
): Promise<void> {
  await db.run(
    `UPDATE estimates
     SET estimate_storage_path = $1,
         estimate_file_name = $2,
         updated_at = now()
     WHERE monday_item_id = $3`,
    [path, fileName, mondayItemId]
  );
}

export async function updatePlansStorage(
  mondayItemId: string,
  _path: string
): Promise<void> {
  await db.run(
    `UPDATE estimates
     SET updated_at = now()
     WHERE monday_item_id = $1`,
    [mondayItemId]
  );
}

export async function getEstimateByMondayId(
  mondayItemId: string
): Promise<Estimate | null> {
  const row = await db
    .query<EstimateDbRow, [string]>(
      "SELECT * FROM estimates WHERE monday_item_id = $1"
    )
    .get(mondayItemId);

  return row ? parseEstimateRow(row) : null;
}

export async function getEstimateById(id: number): Promise<Estimate | null> {
  const row = await db
    .query<EstimateDbRow, [number]>("SELECT * FROM estimates WHERE id = $1")
    .get(id);

  return row ? parseEstimateRow(row) : null;
}

export async function getAllEstimates(): Promise<Estimate[]> {
  const rows = await db
    .query<EstimateDbRow, []>("SELECT * FROM estimates ORDER BY synced_at DESC")
    .all();

  return rows.map(parseEstimateRow);
}

export async function getEstimatesWithoutFile(): Promise<Estimate[]> {
  const rows = await db
    .query<EstimateDbRow, []>(
      `SELECT * FROM estimates
       WHERE estimate_storage_path IS NULL
       ORDER BY synced_at DESC`
    )
    .all();

  return rows.map(parseEstimateRow);
}

export async function getEstimateStats(): Promise<{
  total: number;
  withFile: number;
  withoutFile: number;
}> {
  const total =
    (
      await db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM estimates")
        .get()
    )?.count ?? 0;

  const withFile =
    (
      await db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM estimates WHERE estimate_storage_path IS NOT NULL"
        )
        .get()
    )?.count ?? 0;

  return {
    total,
    withFile,
    withoutFile: total - withFile,
  };
}

export async function searchEstimates(
  query: string,
  limit = 50
): Promise<Estimate[]> {
  const rows = await likeSearch<EstimateDbRow>({
    table: "estimates",
    columns: ["name", "estimate_number", "contractor"],
    query,
    orderBy: "synced_at DESC",
    limit,
  });

  return rows.map(parseEstimateRow);
}

export interface EstimateExtractionTriageResult {
  candidateRows: number;
  markedNonPdf: number;
  processedRows: number;
  resetToPending: number;
  skippedNoAsset: number;
}

const runEstimateExtractionTriageStmt = db.query<{
  candidate_rows: number;
  processed_rows: number;
  reset_to_pending: number;
  marked_non_pdf: number;
  skipped_no_asset: number;
}>("SELECT * FROM public.run_estimate_extraction_triage($1)");

export async function runEstimateExtractionTriage(
  maxRows?: number
): Promise<EstimateExtractionTriageResult> {
  const row = await runEstimateExtractionTriageStmt.get(maxRows ?? 10);
  return {
    candidateRows: Number(row?.candidate_rows ?? 0),
    processedRows: Number(row?.processed_rows ?? 0),
    resetToPending: Number(row?.reset_to_pending ?? 0),
    markedNonPdf: Number(row?.marked_non_pdf ?? 0),
    skippedNoAsset: Number(row?.skipped_no_asset ?? 0),
  };
}
