-- Consolidate attachments + monday_assets into unified documents table
-- Previously: attachments (249,874 rows), documents (67,669 rows), monday_assets (2,502 rows)
-- After: documents (254,799 rows) with source column distinguishing origin

-- Step 1: Add new columns to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'parsed';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS outlook_attachment_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_extension TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_attempts INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS monday_asset_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS monday_item_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS monday_column_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS local_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMPTZ;

-- Step 2: Backfill existing documents from linked attachments (COALESCE preserves existing values)
-- Only reference columns that exist on attachments in the initial schema.
DO $$
BEGIN
  IF to_regclass('public.attachments') IS NULL THEN
    RETURN;
  END IF;

  UPDATE documents d SET
    source = 'parsed',
    outlook_attachment_id = a.attachment_id,
    content_type = COALESCE(d.content_type, a.content_type),
    file_size = COALESCE(d.file_size, a.size),
    storage_bucket = COALESCE(d.storage_bucket, a.storage_bucket),
    storage_path = COALESCE(d.storage_path, a.storage_path),
    extracted_text = COALESCE(d.extracted_text, a.extracted_text),
    extracted_at = COALESCE(d.extracted_at, a.extracted_at)
  FROM attachments a
  WHERE a.id = d.attachment_id;
END $$;

-- Step 3: Insert unlinked attachments (no parsed document yet)
-- Only reference columns that exist on attachments in the initial schema.
DO $$
BEGIN
  IF to_regclass('public.attachments') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO documents (
    source, email_id, outlook_attachment_id, file_name, content_type,
    file_size, storage_bucket, storage_path,
    extracted_text, extraction_status, extraction_error,
    extracted_at, document_type, created_at
  )
  SELECT
    'email_attachment', a.email_id, a.attachment_id, a.name, a.content_type,
    a.size, a.storage_bucket, a.storage_path,
    a.extracted_text, a.extraction_status, a.extraction_error,
    a.extracted_at, 'unknown', a.created_at
  FROM attachments a
  WHERE NOT EXISTS (
    SELECT 1 FROM documents d WHERE d.attachment_id = a.id
  );
END $$;

-- Step 4: Insert monday_assets
DO $$
BEGIN
  IF to_regclass('public.monday_assets') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO documents (
    source, monday_asset_id, monday_item_id, monday_column_id,
    file_name, file_extension, file_size, local_path, downloaded_at,
    document_type, extraction_status, created_at
  )
  SELECT
    'monday_asset', ma.monday_asset_id, ma.monday_item_id, ma.column_id,
    ma.file_name, ma.file_extension, ma.file_size, ma.local_path, ma.downloaded_at,
    'unknown', 'downloaded', ma.created_at
  FROM monday_assets ma;
END $$;

-- Step 5: Link monday_asset documents to estimates
UPDATE documents d SET estimate_id = e.id
FROM estimates e
WHERE d.source = 'monday_asset'
  AND d.monday_item_id = e.monday_item_id
  AND d.estimate_id IS NULL;

-- Step 6: Indexes
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
CREATE INDEX IF NOT EXISTS idx_documents_outlook_attachment_id ON documents(outlook_attachment_id) WHERE outlook_attachment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_monday_asset_id ON documents(monday_asset_id) WHERE monday_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_monday_item_id ON documents(monday_item_id) WHERE monday_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_extraction_attempts ON documents(extraction_attempts) WHERE extraction_status = 'failed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_email_attachment_upsert
  ON documents(email_id, outlook_attachment_id)
  WHERE source = 'email_attachment' AND outlook_attachment_id IS NOT NULL;

-- Step 7: Drop old FK and column, then old tables
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_attachment_id_fkey;
ALTER TABLE documents DROP COLUMN IF EXISTS attachment_id;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS monday_assets CASCADE;
