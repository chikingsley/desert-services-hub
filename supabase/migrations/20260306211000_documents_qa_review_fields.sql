ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS qa_status TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS qa_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_qa_status
  ON documents (qa_status);

CREATE INDEX IF NOT EXISTS idx_documents_reviewed_at
  ON documents (reviewed_at)
  WHERE reviewed_at IS NOT NULL;
