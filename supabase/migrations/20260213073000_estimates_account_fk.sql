-- Add canonical estimate -> account foreign key.
-- Keep nullable initially; backfill whatever can be resolved today.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES public.accounts(id);

CREATE INDEX IF NOT EXISTS idx_estimates_account_id
  ON public.estimates(account_id);

-- Backfill by Monday account ID (strongest mapping).
UPDATE public.estimates e
SET account_id = a.id
FROM public.accounts a
WHERE e.account_id IS NULL
  AND e.account_monday_id IS NOT NULL
  AND a.monday_account_id = e.account_monday_id;

-- Backfill by domain where Monday ID is missing.
UPDATE public.estimates e
SET account_id = a.id
FROM public.accounts a
WHERE e.account_id IS NULL
  AND e.account_domain IS NOT NULL
  AND a.domain IS NOT NULL
  AND lower(a.domain) = lower(e.account_domain);
