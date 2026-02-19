CREATE TABLE IF NOT EXISTS public.aqdata_permits (
  id TEXT PRIMARY KEY,
  facility_id TEXT,
  facility_name TEXT,
  project_name TEXT,
  company_id TEXT,
  company_name TEXT,
  status TEXT,
  submitted_date DATE,
  effective_date DATE,
  expiration_date DATE,
  closed_date DATE,
  previous_app_id TEXT,
  project_start_date DATE,
  project_completion_date DATE,
  address TEXT,
  city TEXT,
  parcel TEXT,
  is_block_permit BOOLEAN NOT NULL DEFAULT FALSE,
  is_accelerated BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_number TEXT,
  invoice_charges NUMERIC,
  invoice_balance NUMERIC,
  raw_export JSONB NOT NULL DEFAULT '{}'::jsonb,
  detail_fields JSONB,
  detail_html TEXT,
  detail_scraped_at TIMESTAMPTZ,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aqdata_permits_status ON public.aqdata_permits(status);
CREATE INDEX IF NOT EXISTS idx_aqdata_permits_company_name ON public.aqdata_permits(company_name);
CREATE INDEX IF NOT EXISTS idx_aqdata_permits_city ON public.aqdata_permits(city);
CREATE INDEX IF NOT EXISTS idx_aqdata_permits_exported_at ON public.aqdata_permits(exported_at DESC);

CREATE OR REPLACE FUNCTION public.set_aqdata_permits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aqdata_permits_updated_at ON public.aqdata_permits;
CREATE TRIGGER trg_aqdata_permits_updated_at
BEFORE UPDATE ON public.aqdata_permits
FOR EACH ROW
EXECUTE FUNCTION public.set_aqdata_permits_updated_at();
