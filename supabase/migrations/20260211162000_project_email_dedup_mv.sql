-- Deduplicated project email message snapshot (materialized view).
--
-- Purpose:
-- - Collapse duplicate mailbox copies of the same logical message.
-- - Keep raw `emails` unchanged.
-- - Speed up triage/status queries that repeatedly scan large email volumes.

DROP MATERIALIZED VIEW IF EXISTS public.project_email_dedup_mv;

CREATE MATERIALIZED VIEW public.project_email_dedup_mv AS
WITH base AS (
  SELECT
    e.id,
    e.project_id,
    e.mailbox_id,
    m.email AS mailbox_email,
    e.received_at,
    COALESCE(NULLIF(e.internet_message_id, ''), NULLIF(e.message_id, ''), 'id:' || e.id::text) AS message_key,
    e.subject,
    e.normalized_subject,
    e.from_email,
    e.body_preview,
    COALESCE(e.has_attachments, 0) AS has_attachments
  FROM public.emails e
  JOIN public.mailboxes m ON m.id = e.mailbox_id
  WHERE e.project_id IS NOT NULL
    AND COALESCE(e.is_excluded, 0) = 0
),
ranked AS (
  SELECT
    b.*,
    ROW_NUMBER() OVER (
      PARTITION BY b.project_id, b.message_key
      ORDER BY b.received_at DESC, b.id DESC
    ) AS rn
  FROM base b
),
agg AS (
  SELECT
    b.project_id,
    b.message_key,
    COUNT(*) AS email_row_count,
    COUNT(DISTINCT b.mailbox_id) AS mailbox_count,
    MIN(b.received_at) AS first_received_at,
    MAX(b.received_at) AS last_received_at,
    COUNT(*) FILTER (WHERE b.has_attachments = 1) AS rows_with_attachments,
    BOOL_OR(
      COALESCE(b.subject, '') ~* 'dust|permit|noi|pointandpay|maricopa|swppp|certificate'
      OR COALESCE(b.body_preview, '') ~* 'dust|permit|noi|pointandpay|maricopa|swppp|certificate'
    ) AS has_permit_signal,
    ARRAY_AGG(DISTINCT b.mailbox_email ORDER BY b.mailbox_email) AS mailbox_emails
  FROM base b
  GROUP BY b.project_id, b.message_key
)
SELECT
  a.project_id,
  a.message_key,
  r.id AS canonical_email_id,
  r.received_at AS canonical_received_at,
  r.subject AS canonical_subject,
  r.normalized_subject AS canonical_normalized_subject,
  r.from_email AS canonical_from_email,
  a.email_row_count,
  (a.email_row_count - 1) AS duplicate_row_count,
  a.mailbox_count,
  a.first_received_at,
  a.last_received_at,
  a.rows_with_attachments,
  a.has_permit_signal,
  a.mailbox_emails
FROM agg a
JOIN ranked r
  ON r.project_id = a.project_id
 AND r.message_key = a.message_key
 AND r.rn = 1;

CREATE UNIQUE INDEX idx_project_email_dedup_mv_pk
  ON public.project_email_dedup_mv(project_id, message_key);

CREATE INDEX idx_project_email_dedup_mv_project_last
  ON public.project_email_dedup_mv(project_id, last_received_at DESC);

CREATE INDEX idx_project_email_dedup_mv_permit_signal
  ON public.project_email_dedup_mv(project_id, has_permit_signal)
  WHERE has_permit_signal = true;
