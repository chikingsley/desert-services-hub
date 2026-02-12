-- Query performance indexes for high-cost runtime paths.
-- Ordered by expected impact.

-- 1) Emails API dedup listing/count workload.
CREATE INDEX IF NOT EXISTS idx_emails_active_dedup_partition
ON public.emails (
  (
    CASE
      WHEN from_domain IN (
        'buildingconnected.com',
        'planhub.com',
        'cyberhoot.com',
        'texturacorp.com',
        'worklio.com',
        'avanan-mail.net'
      )
      OR from_domain LIKE '%bidmail.com'
      OR from_domain LIKE '%procoretech.com'
      THEN normalized_subject || '|' || COALESCE(from_name, '') || '|' || floor(extract(epoch from timezone('UTC', received_at)) / 3600)::bigint::text
      ELSE COALESCE(internet_message_id, message_id)::text
    END
  ),
  id
)
WHERE is_excluded = 0;

CREATE INDEX IF NOT EXISTS idx_emails_active_received_desc
ON public.emails (received_at DESC, id)
WHERE is_excluded = 0;

-- 2) Estimate fuzzy matching path in estimate-email candidate search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_estimates_fuzzy_text_trgm
ON public.estimates
USING gin (
  lower(
    coalesce(name, '') || ' ' ||
    coalesce(job_name, '') || ' ' ||
    coalesce(contractor, '') || ' ' ||
    coalesce(job_address, '') || ' ' ||
    coalesce(location, '') || ' ' ||
    coalesce(estimate_number, '')
  ) gin_trgm_ops
);
