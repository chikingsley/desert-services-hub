\set ON_ERROR_STOP on
\pset pager off

-- Usage example:
--   docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres \
--     -v query='lariat village tofel' \
--     -v since='2025-12-01' \
--     -v exact_subject='Tofel Dent- Lariat contract' \
--     -v counterparty_domain='tofeldent.com' \
--     -f scripts/sql/triage_followup_story.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'emails' AND column_name = 'search_document'
  ) THEN
    RAISE EXCEPTION 'Expected column public.emails.search_document is missing';
  END IF;
END
$$;

\echo === EXACT SUBJECT THREAD ===
SELECT
  :'exact_subject' AS subject_anchor,
  MIN(received_at) AS first_seen,
  MAX(received_at) AS last_seen,
  COUNT(*)::int AS message_copies,
  COUNT(DISTINCT LOWER(COALESCE(from_email, '')))::int AS distinct_senders
FROM emails
WHERE COALESCE(is_excluded, 0) = 0
  AND subject ILIKE '%' || :'exact_subject' || '%';

DROP TABLE IF EXISTS triage_followup_uniq;

CREATE TEMP TABLE triage_followup_uniq AS
WITH matched AS (
  SELECT
    e.id,
    e.message_id,
    e.internet_message_id,
    e.normalized_subject,
    e.from_name,
    e.from_domain,
    e.received_at,
    e.subject,
    e.from_email,
    e.attachment_names,
    m.email AS mailbox
  FROM emails e
  JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE COALESCE(e.is_excluded, 0) = 0
    AND e.received_at >= :'since'::timestamptz
    AND e.search_document @@ websearch_to_tsquery('english', :'query')
), dedup AS (
  SELECT
    m.*,
    CASE
      WHEN (
        m.from_domain = ANY (
          ARRAY[
            'buildingconnected.com',
            'planhub.com',
            'cyberhoot.com',
            'texturacorp.com',
            'worklio.com',
            'avanan-mail.net'
          ]
        )
        OR m.from_domain ILIKE '%bidmail.com'
        OR m.from_domain ILIKE '%procoretech.com'
      ) THEN
        (
          COALESCE(m.normalized_subject, '') || '|' || COALESCE(m.from_name, '') || '|' ||
          FLOOR(EXTRACT(EPOCH FROM TIMEZONE('UTC', m.received_at)) / 3600)::bigint::text
        )
      ELSE COALESCE(m.internet_message_id, m.message_id)
    END AS dedup_key
  FROM matched m
), ranked AS (
  SELECT
    d.*,
    ROW_NUMBER() OVER (PARTITION BY d.dedup_key ORDER BY d.id) AS rn
  FROM dedup d
)
SELECT
  id,
  received_at,
  mailbox,
  from_email,
  from_domain,
  subject,
  attachment_names
FROM ranked
WHERE rn = 1;

CREATE INDEX triage_followup_uniq_received_idx ON triage_followup_uniq (received_at DESC);
ANALYZE triage_followup_uniq;

\echo
\echo === POST-SINCE MATCH SUMMARY (DEDUPED) ===
SELECT
  COUNT(*)::int AS deduped_message_count,
  MIN(received_at) AS first_seen,
  MAX(received_at) AS last_seen,
  COUNT(*) FILTER (WHERE from_email ILIKE '%' || :'counterparty_domain')::int AS from_counterparty_domain
FROM triage_followup_uniq;

\echo
\echo === POST-SINCE CATEGORY BREAKDOWN (DEDUPED) ===
SELECT
  CASE
    WHEN subject ILIKE '%contract%' THEN 'contract-subject'
    WHEN subject ILIKE '%section 3%'
      OR COALESCE(attachment_names, '') ILIKE '%section 3%'
      OR COALESCE(attachment_names, '') ILIKE '%dbra%'
      THEN 'section3-dbra'
    WHEN subject ILIKE '%inspection%' THEN 'inspection'
    WHEN subject ILIKE '%application for payment%'
      OR subject ILIKE '%lien waiver%'
      OR COALESCE(attachment_names, '') ILIKE '%application for payment%'
      THEN 'payapp-lienwaiver'
    WHEN subject ILIKE '%noi permit%'
      OR COALESCE(attachment_names, '') ILIKE '%noi permit%'
      OR COALESCE(attachment_names, '') ILIKE '%dust control permit%'
      THEN 'noi-dust-permit'
    WHEN subject ILIKE '%drive entrace%'
      OR subject ILIKE '%drive entrance%'
      THEN 'drive-entrances'
    WHEN subject ILIKE '%schedule%' THEN 'schedule-update'
    ELSE 'other'
  END AS category,
  COUNT(*)::int AS messages,
  MIN(received_at) AS first_seen,
  MAX(received_at) AS last_seen
FROM triage_followup_uniq
GROUP BY 1
ORDER BY messages DESC;

\echo
\echo === CONTRACT-LIKE SIGNAL AFTER EXACT THREAD (DEDUPED) ===
WITH exact AS (
  SELECT MAX(received_at) AS last_exact_seen
  FROM emails
  WHERE COALESCE(is_excluded, 0) = 0
    AND subject ILIKE '%' || :'exact_subject' || '%'
)
SELECT
  COUNT(*) FILTER (WHERE subject ILIKE '%contract%')::int AS contract_subject_count,
  COUNT(*) FILTER (
    WHERE COALESCE(attachment_names, '') ILIKE '%contract%'
      OR COALESCE(attachment_names, '') ILIKE '%subcontract%'
      OR COALESCE(attachment_names, '') ILIKE '%agreement%'
      OR COALESCE(attachment_names, '') ILIKE '%docusign%'
  )::int AS contract_attachment_like_count,
  MAX(received_at) FILTER (
    WHERE subject ILIKE '%contract%'
      OR COALESCE(attachment_names, '') ILIKE '%contract%'
      OR COALESCE(attachment_names, '') ILIKE '%subcontract%'
      OR COALESCE(attachment_names, '') ILIKE '%agreement%'
      OR COALESCE(attachment_names, '') ILIKE '%docusign%'
  ) AS last_contract_like_seen
FROM triage_followup_uniq
WHERE received_at > COALESCE((SELECT last_exact_seen FROM exact), '-infinity'::timestamptz);

\echo
\echo === RECENT MATCHED TIMELINE (DEDUPED, NEWEST FIRST) ===
SELECT
  id,
  received_at,
  mailbox,
  from_email,
  subject,
  attachment_names
FROM triage_followup_uniq
ORDER BY received_at DESC
LIMIT 60;
