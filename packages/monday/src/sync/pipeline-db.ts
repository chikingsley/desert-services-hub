import { db } from "@lib/db/hub";

// ============================================================================
// Prepared Statements
// ============================================================================

export const getExistingAssets = db.query<{ monday_asset_id: string }>(
  "SELECT monday_asset_id FROM monday_assets WHERE monday_item_id = ?"
);

export const insertAsset = db.prepare(`
  INSERT INTO monday_assets
    (monday_asset_id, monday_item_id, column_id, file_name, file_extension, file_size, local_path, downloaded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, now())
  ON CONFLICT DO NOTHING
`);

export const updateEstimatePath = db.prepare(
  "UPDATE estimates SET estimate_storage_path = ?, estimate_file_name = ?, updated_at = now() WHERE monday_item_id = ?"
);

export const getEstimateByMondayId = db.query<{
  id: number;
  name: string;
  extraction_status: string | null;
}>(
  "SELECT id, name, extraction_status FROM estimates WHERE monday_item_id = ?"
);

export const getLatestEstimateAsset = db.query<{
  monday_asset_id: string;
  file_name: string;
  local_path: string | null;
}>(
  `SELECT monday_asset_id, file_name, local_path
   FROM monday_assets
   WHERE monday_item_id = ?
     AND column_id = ?
   ORDER BY downloaded_at DESC NULLS LAST, id DESC
   LIMIT 1`
);

export const updateAssetLocalPath = db.prepare(
  "UPDATE monday_assets SET local_path = ?, downloaded_at = now() WHERE monday_asset_id = ?"
);

export const markOldVersionsNotCurrent = db.prepare(
  "UPDATE estimate_versions SET is_current = 0 WHERE estimate_id = ?"
);

export const getNextVersionNumber = db.query<{ next_num: number }>(
  "SELECT COALESCE(MAX(version_number), 0) + 1 as next_num FROM estimate_versions WHERE estimate_id = ?"
);

export const insertVersion = db.prepare(`
  INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
  VALUES (?, ?, ?, 'ocr', ?, 1)
`);

export const insertLineItem = db.prepare(`
  INSERT INTO estimate_line_items
    (id, version_id, item_name, description, quantity, unit, unit_price, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export const updateExtractionSuccess = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'success',
    extraction_error = NULL,
    extracted_at = now(),
    extracted_grand_total = ?,
    extracted_job_name = ?,
    extracted_estimator = ?,
    job_name = COALESCE(NULLIF(TRIM(job_name), ''), NULLIF(TRIM(?), ''), job_name),
    job_address = COALESCE(NULLIF(TRIM(job_address), ''), NULLIF(TRIM(?), ''), job_address),
    estimator = COALESCE(NULLIF(TRIM(estimator), ''), NULLIF(TRIM(?), ''), estimator),
    client_name = COALESCE(NULLIF(TRIM(client_name), ''), NULLIF(TRIM(?), ''), client_name),
    client_address = COALESCE(NULLIF(TRIM(client_address), ''), NULLIF(TRIM(?), ''), client_address)
  WHERE id = ?
`);

export const updateExtractionFailed = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'failed',
    extraction_error = ?,
    extracted_at = now()
  WHERE id = ?
`);
