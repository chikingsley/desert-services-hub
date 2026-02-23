-- Add tsvector search_vector column to dust_permits_filed_by_desert_services
-- for full-text search parity with emails and estimates tables.

-- 1. Add the column
ALTER TABLE dust_permits_filed_by_desert_services
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create trigger function
CREATE OR REPLACE FUNCTION dust_permits_search_update()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.project_name, '') || ' ' ||
    coalesce(NEW.company_name, '') || ' ' ||
    coalesce(NEW.address, '') || ' ' ||
    coalesce(NEW.city, '') || ' ' ||
    coalesce(NEW.facility_id, '') || ' ' ||
    coalesce(NEW.status, '')
  );
  RETURN NEW;
END;
$$;

-- 3. Create trigger
CREATE TRIGGER trg_dust_permits_search_vector
  BEFORE INSERT OR UPDATE OF project_name, company_name, address, city, facility_id, status
  ON dust_permits_filed_by_desert_services
  FOR EACH ROW
  EXECUTE FUNCTION dust_permits_search_update();

-- 4. GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_dust_permits_search_vector
  ON dust_permits_filed_by_desert_services USING gin(search_vector);

-- 5. Backfill existing rows
UPDATE dust_permits_filed_by_desert_services
SET search_vector = to_tsvector('english',
  coalesce(project_name, '') || ' ' ||
  coalesce(company_name, '') || ' ' ||
  coalesce(address, '') || ' ' ||
  coalesce(city, '') || ' ' ||
  coalesce(facility_id, '') || ' ' ||
  coalesce(status, '')
);
