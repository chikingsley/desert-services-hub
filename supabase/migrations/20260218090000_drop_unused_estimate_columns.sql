-- Remove deprecated estimate columns and keep bill-to company in contractor.

ALTER TABLE public.estimates
  DROP COLUMN IF EXISTS client_name,
  DROP COLUMN IF EXISTS client_email,
  DROP COLUMN IF EXISTS client_phone,
  DROP COLUMN IF EXISTS estimate_storage_bucket,
  DROP COLUMN IF EXISTS estimate_synced_at,
  DROP COLUMN IF EXISTS plans_storage_path,
  DROP COLUMN IF EXISTS contracts_storage_path,
  DROP COLUMN IF EXISTS noi_storage_path,
  DROP COLUMN IF EXISTS service_type;

DROP INDEX IF EXISTS idx_estimates_service_type;
