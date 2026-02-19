import { db } from "@lib/db/client";

// ============================================================================
// Prepared Statements
// ============================================================================

export const getExistingAssets = db.query<{ monday_asset_id: string }>(
  "SELECT monday_asset_id FROM documents WHERE source = 'monday_asset' AND monday_item_id = $1"
);

export const insertAsset = db.query(`
  INSERT INTO documents
    (source, monday_asset_id, monday_item_id, monday_column_id, file_name, file_extension, file_size, local_path, downloaded_at, document_type, extraction_status)
  VALUES ('monday_asset', $1, $2, $3, $4, $5, $6, $7, now(), 'unknown', 'downloaded')
  ON CONFLICT (monday_asset_id) WHERE monday_asset_id IS NOT NULL DO UPDATE
  SET monday_item_id = EXCLUDED.monday_item_id,
      monday_column_id = EXCLUDED.monday_column_id,
      file_name = EXCLUDED.file_name,
      file_extension = EXCLUDED.file_extension,
      file_size = EXCLUDED.file_size,
      local_path = EXCLUDED.local_path,
      downloaded_at = now(),
      extraction_status = 'downloaded',
      extraction_error = NULL,
      extraction_attempts = 0,
      last_attempted_at = NULL,
      updated_at = now()
`);

export const updateEstimatePath = db.query(
  "UPDATE estimates SET estimate_storage_path = $1, estimate_file_name = $2, updated_at = now() WHERE monday_item_id = $3"
);
