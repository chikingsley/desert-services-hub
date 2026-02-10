-- Public schema sync
--
-- This migration captures tables/columns that were created ad-hoc in production
-- and need to exist in fresh environments.

-- ============================================================================
-- Marketing permits (market intelligence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_permits (
  id TEXT PRIMARY KEY,
  project_name TEXT,
  company_id TEXT,
  company_name TEXT,
  status TEXT,
  submitted_date TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  closed_date TEXT,
  previous_app_id TEXT,
  project_start_date TEXT,
  project_end_date TEXT,
  address TEXT,
  city TEXT,
  parcel TEXT,
  is_block_permit INTEGER DEFAULT 0,
  is_accelerated INTEGER DEFAULT 0,
  invoice_number TEXT,
  invoice_charges REAL,
  invoice_balance REAL,
  raw_data JSONB,
  scraped_at BIGINT,
  detail_scraped_at BIGINT,
  created_at BIGINT DEFAULT (EXTRACT(epoch FROM now()))::bigint
);

CREATE INDEX IF NOT EXISTS idx_marketing_permits_city
  ON public.marketing_permits(city);
CREATE INDEX IF NOT EXISTS idx_marketing_permits_company_id
  ON public.marketing_permits(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_permits_company_name
  ON public.marketing_permits(company_name);
CREATE INDEX IF NOT EXISTS idx_marketing_permits_status
  ON public.marketing_permits(status);
CREATE INDEX IF NOT EXISTS idx_marketing_permits_submitted_date
  ON public.marketing_permits(submitted_date);

-- ============================================================================
-- Estimate poller state tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimate_poller_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.estimate_poller_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  estimate_name TEXT,
  monday_item_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Schema drift: additional columns used by code
-- ============================================================================

-- Accounts (sales ops enrichment)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS ssm_assignment TEXT;
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS pdl_enrichment JSONB;
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS pdl_enriched_at TIMESTAMPTZ;

-- Estimates (editor fields)
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS job_name TEXT;
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_estimates_base_number
  ON public.estimates(base_number);

