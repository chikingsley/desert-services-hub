-- Standardize FTS column naming: all tables use search_vector.
-- emails was the odd one out with search_document.

ALTER TABLE emails RENAME COLUMN search_document TO search_vector;
ALTER INDEX idx_emails_search RENAME TO idx_emails_search_vector;

-- Update the trigger function to reference the new column name.
CREATE OR REPLACE FUNCTION emails_search_document_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    concat_ws(' ',
      COALESCE(NEW.subject, ''),
      COALESCE(NEW.body_preview, ''),
      COALESCE(NEW.from_name, ''),
      COALESCE(NEW.from_email, '')
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
