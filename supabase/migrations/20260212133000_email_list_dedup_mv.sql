-- Materialized view for default emails list dedup path.
-- This preserves the existing dedup semantics for active (non-excluded) rows
-- and gives /api/emails a fast default path without recomputing window functions
-- on every request.

DROP MATERIALIZED VIEW IF EXISTS public.email_list_dedup_mv;

CREATE MATERIALIZED VIEW public.email_list_dedup_mv AS
WITH base AS (
  SELECT
    e.id,
    e.message_id,
    e.internet_message_id,
    e.mailbox_id,
    e.conversation_id,
    e.subject,
    e.normalized_subject,
    e.from_email,
    e.from_name,
    e.from_domain,
    e.to_emails,
    e.cc_emails,
    e.received_at,
    e.has_attachments,
    e.attachment_names,
    e.body_preview,
    e.web_url,
    e.categories,
    e.classification,
    e.classification_confidence,
    e.classification_method,
    e.project_name,
    e.contractor_name,
    e.account_id,
    e.project_id,
    e.thread_id,
    e.is_internal,
    e.is_forwarded,
    e.original_sender_email,
    e.original_sender_domain,
    e.is_platform_email,
    e.platform_name,
    e.real_sender_name,
    e.real_sender_company,
    e.real_sender_email,
    e.real_sender_domain,
    e.is_excluded,
    e.created_at,
    CASE
      WHEN e.from_domain IN (
        'buildingconnected.com',
        'planhub.com',
        'cyberhoot.com',
        'texturacorp.com',
        'worklio.com',
        'avanan-mail.net'
      )
      OR e.from_domain LIKE '%bidmail.com'
      OR e.from_domain LIKE '%procoretech.com'
      THEN e.normalized_subject || '|' || COALESCE(e.from_name, '') || '|' || floor(extract(epoch from timezone('UTC', e.received_at)) / 3600)::bigint::text
      ELSE COALESCE(e.internet_message_id, e.message_id)::text
    END AS dedup_key
  FROM public.emails e
  WHERE COALESCE(e.is_excluded, 0) = 0
),
ranked AS (
  SELECT
    b.*,
    ROW_NUMBER() OVER (
      PARTITION BY b.dedup_key
      ORDER BY b.id
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY b.dedup_key
    ) AS recipient_count
  FROM base b
)
SELECT
  id,
  message_id,
  internet_message_id,
  mailbox_id,
  conversation_id,
  subject,
  normalized_subject,
  from_email,
  from_name,
  from_domain,
  to_emails,
  cc_emails,
  received_at,
  has_attachments,
  attachment_names,
  body_preview,
  web_url,
  categories,
  classification,
  classification_confidence,
  classification_method,
  project_name,
  contractor_name,
  account_id,
  project_id,
  thread_id,
  is_internal,
  is_forwarded,
  original_sender_email,
  original_sender_domain,
  is_platform_email,
  platform_name,
  real_sender_name,
  real_sender_company,
  real_sender_email,
  real_sender_domain,
  is_excluded,
  created_at,
  recipient_count
FROM ranked
WHERE rn = 1;

CREATE UNIQUE INDEX idx_email_list_dedup_mv_id
  ON public.email_list_dedup_mv(id);

CREATE INDEX idx_email_list_dedup_mv_received
  ON public.email_list_dedup_mv(received_at DESC, id);

CREATE INDEX idx_email_list_dedup_mv_classification
  ON public.email_list_dedup_mv(classification);

CREATE INDEX idx_email_list_dedup_mv_from_domain
  ON public.email_list_dedup_mv(from_domain);
