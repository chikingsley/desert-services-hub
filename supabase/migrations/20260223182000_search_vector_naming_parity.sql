-- Standardize search_vector trigger and index naming across all tables.
-- Convention: trg_{table}_search_vector, idx_{table}_search_vector

ALTER TRIGGER emails_search_trigger ON emails RENAME TO trg_emails_search_vector;
ALTER INDEX IF EXISTS idx_estimates_search RENAME TO idx_estimates_search_vector;
