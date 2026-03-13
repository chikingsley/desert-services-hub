-- Materialized view: pre-computed domain-level email aggregation.
-- Eliminates the 692K-row scan for the sender-review page.
-- Refresh runs in background after classify/approve mutations.
CREATE MATERIALIZED VIEW IF NOT EXISTS domain_email_stats AS
SELECT
  COALESCE(
    NULLIF(real_sender_domain, ''),
    NULLIF(original_sender_domain, ''),
    NULLIF(from_domain, '')
  ) AS domain,
  COUNT(*)::int AS email_count,
  COUNT(DISTINCT COALESCE(
    NULLIF(real_sender_email, ''),
    NULLIF(original_sender_email, ''),
    NULLIF(from_email, '')
  ))::int AS sender_count,
  COUNT(DISTINCT account_id)
    FILTER (WHERE account_id IS NOT NULL)::int AS linked_account_count,
  MIN(received_at)::text AS first_received_at,
  MAX(received_at)::text AS last_received_at
FROM emails
WHERE is_excluded = 0
  AND classification IS NULL
  AND COALESCE(
    NULLIF(real_sender_domain, ''),
    NULLIF(original_sender_domain, ''),
    NULLIF(from_domain, '')
  ) IS NOT NULL
GROUP BY 1;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_email_stats_domain
  ON domain_email_stats (domain);

-- Expression partial index on emails for per-domain lookups (samples query).
CREATE INDEX IF NOT EXISTS idx_emails_sender_domain_unreviewed
  ON emails (
    COALESCE(
      NULLIF(real_sender_domain, ''),
      NULLIF(original_sender_domain, ''),
      NULLIF(from_domain, '')
    )
  )
  WHERE is_excluded = 0 AND classification IS NULL;

-- Composite index: domain expression + received_at DESC + id DESC.
-- Enables efficient "top 5 recent emails for domain X" lookups
-- without scanning thousands of rows through the received_at index.
CREATE INDEX IF NOT EXISTS idx_emails_sender_domain_received
  ON emails (
    COALESCE(
      NULLIF(real_sender_domain, ''),
      NULLIF(original_sender_domain, ''),
      NULLIF(from_domain, '')
    ),
    received_at DESC,
    id DESC
  )
  WHERE is_excluded = 0 AND classification IS NULL;
