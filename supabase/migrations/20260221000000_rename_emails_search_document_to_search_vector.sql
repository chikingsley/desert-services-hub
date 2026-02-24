-- Standardize FTS column naming: all tables use search_vector.
-- emails was the odd one out with search_document.

-- Add search_vector if neither column exists (fresh DB), or rename if search_document exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'search_document'
  ) THEN
    ALTER TABLE emails RENAME COLUMN search_document TO search_vector;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE emails ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Rename index if it exists under old name.
DO $$
BEGIN
  IF to_regclass('public.idx_emails_search') IS NOT NULL
     AND to_regclass('public.idx_emails_search_vector') IS NULL THEN
    ALTER INDEX idx_emails_search RENAME TO idx_emails_search_vector;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_emails_search_vector ON emails USING gin(search_vector);

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
