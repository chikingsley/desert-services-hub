-- Add search_vector to projects for full-text search parity with
-- emails, estimates, and documents.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION projects_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.contractor, '') || ' ' ||
    coalesce(NEW.address, '') || ' ' ||
    coalesce(NEW.location_city, '') || ' ' ||
    coalesce(NEW.project_number, '') || ' ' ||
    coalesce(NEW.notes, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_search_vector ON projects;
CREATE TRIGGER trg_projects_search_vector
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_search_vector_update();

-- Backfill existing rows
UPDATE projects SET search_vector = to_tsvector('english',
  coalesce(name, '') || ' ' ||
  coalesce(contractor, '') || ' ' ||
  coalesce(address, '') || ' ' ||
  coalesce(location_city, '') || ' ' ||
  coalesce(project_number, '') || ' ' ||
  coalesce(notes, '')
);

CREATE INDEX IF NOT EXISTS idx_projects_search_vector ON projects USING gin(search_vector);
