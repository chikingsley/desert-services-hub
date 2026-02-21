-- Add materialized tsvector columns + GIN indexes to estimates and documents.
-- These were previously computed on-the-fly in queries; storing them makes
-- FTS lookups use the index instead of seq-scanning + computing per row.

-- ============================================================================
-- ESTIMATES
-- ============================================================================

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Backfill existing rows
UPDATE estimates
SET search_vector = to_tsvector('english',
  concat_ws(' ', name, job_name, contractor, job_address, location, estimate_number)
);

-- GIN index for fast @@ queries
CREATE INDEX IF NOT EXISTS idx_estimates_search
  ON estimates USING gin (search_vector);

-- Trigger to keep it updated
CREATE OR REPLACE FUNCTION estimates_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    concat_ws(' ', NEW.name, NEW.job_name, NEW.contractor, NEW.job_address, NEW.location, NEW.estimate_number)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estimates_search_vector ON estimates;
CREATE TRIGGER trg_estimates_search_vector
  BEFORE INSERT OR UPDATE OF name, job_name, contractor, job_address, location, estimate_number
  ON estimates
  FOR EACH ROW
  EXECUTE FUNCTION estimates_search_vector_update();

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Backfill existing rows (only where summary exists — no point indexing empty text)
UPDATE documents
SET search_vector = to_tsvector('english', COALESCE(summary, ''))
WHERE summary IS NOT NULL AND summary != '';

-- GIN index
CREATE INDEX IF NOT EXISTS idx_documents_search
  ON documents USING gin (search_vector);

-- Trigger to keep it updated on summary changes
CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.summary, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_search_vector ON documents;
CREATE TRIGGER trg_documents_search_vector
  BEFORE INSERT OR UPDATE OF summary
  ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_search_vector_update();
