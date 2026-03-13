ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS clean_markdown TEXT,
  ADD COLUMN IF NOT EXISTS extraction_method TEXT,
  ADD COLUMN IF NOT EXISTS extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS page_count INTEGER;
