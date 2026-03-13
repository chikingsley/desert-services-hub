ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS sharepoint_path TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_url TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_sharepoint_path
  ON documents(sharepoint_path)
  WHERE sharepoint_path IS NOT NULL;
