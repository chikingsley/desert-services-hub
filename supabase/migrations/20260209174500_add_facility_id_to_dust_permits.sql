-- Add facility_id to dust permit records for stable resubmission linkage.

ALTER TABLE IF EXISTS dust_permits_filed_by_desert_services
  ADD COLUMN IF NOT EXISTS facility_id TEXT;

CREATE INDEX IF NOT EXISTS idx_permits_facility_id
  ON dust_permits_filed_by_desert_services(facility_id);
