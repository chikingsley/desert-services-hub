-- Add content_hash column for dedup across mailboxes and forwards
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Index for fast hash lookups during dedup check
CREATE INDEX IF NOT EXISTS idx_attachments_content_hash
  ON attachments(content_hash)
  WHERE content_hash IS NOT NULL;

-- Add 'deduped' as a recognized extraction_status for tracking
COMMENT ON COLUMN attachments.content_hash IS 'SHA-256 hex digest of file content, computed on download for cross-mailbox/forward dedup';
