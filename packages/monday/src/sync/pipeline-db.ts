import { db } from "@lib/db/hub";

// ============================================================================
// Prepared Statements
// ============================================================================

export const getExistingAssets = db.query<{ monday_asset_id: string }>(
  "SELECT monday_asset_id FROM documents WHERE source = 'monday_asset' AND monday_item_id = ?"
);

export const insertAsset = db.prepare(`
  INSERT INTO documents
    (source, monday_asset_id, monday_item_id, monday_column_id, file_name, file_extension, file_size, local_path, downloaded_at, document_type, extraction_status)
  VALUES ('monday_asset', ?, ?, ?, ?, ?, ?, ?, now(), 'unknown', 'downloaded')
  ON CONFLICT (monday_asset_id) WHERE monday_asset_id IS NOT NULL DO NOTHING
`);

export const updateEstimatePath = db.prepare(
  "UPDATE estimates SET estimate_storage_path = ?, estimate_file_name = ?, updated_at = now() WHERE monday_item_id = ?"
);
