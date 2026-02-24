-- Fix: emails_search_update() still referenced search_document after column rename.
-- Migration 20260221000000 renamed column to search_vector and created
-- emails_search_document_update(), but the trigger still called emails_search_update().
-- Fix the actual trigger function in-place.

CREATE OR REPLACE FUNCTION emails_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.subject, '') || ' ' ||
    coalesce(NEW.from_name, '') || ' ' ||
    coalesce(NEW.from_email, '') || ' ' ||
    coalesce(NEW.body_preview, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the unused function from the earlier migration
DROP FUNCTION IF EXISTS emails_search_document_update();
