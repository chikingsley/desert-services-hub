-- Add missing GIN index on documents.search_vector for full-text search parity
-- with emails and estimates tables.

CREATE INDEX IF NOT EXISTS idx_documents_search_vector
  ON documents USING gin(search_vector);
