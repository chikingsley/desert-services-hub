-- Fix BIGSERIAL → SERIAL for tables that Bun.sql cannot read.
-- Bun.sql throws ERR_POSTGRES_UNSUPPORTED_INTEGER_SIZE on bigint columns,
-- which poisons the connection pool and crashes the job worker.
-- All affected tables have tiny ID ranges (max ~154k) — well within int4.

-- 1. Drop the view that depends on contract_packets.id
DROP VIEW IF EXISTS public.contract_packet_queue_v;

-- 2. Alter contract_packet_documents first (has FK to contract_packets.id)
ALTER TABLE public.contract_packet_documents
  ALTER COLUMN id SET DATA TYPE integer,
  ALTER COLUMN packet_id SET DATA TYPE integer;

-- 3. Alter contract_packets
ALTER TABLE public.contract_packets
  ALTER COLUMN id SET DATA TYPE integer;

-- 4. Alter project_match_reviews
ALTER TABLE public.project_match_reviews
  ALTER COLUMN id SET DATA TYPE integer;

-- 5. Recreate the view (identical to original)
CREATE OR REPLACE VIEW public.contract_packet_queue_v AS
WITH doc_counts AS (
  SELECT
    cpd.packet_id,
    count(*)::int AS packet_document_count,
    count(*) FILTER (WHERE cpd.document_role = 'primary_contract')::int AS primary_contract_count,
    count(*) FILTER (WHERE cpd.is_required)::int AS required_document_count
  FROM public.contract_packet_documents cpd
  GROUP BY cpd.packet_id
)
SELECT
  cp.id,
  cp.project_id,
  p.name AS project_name,
  p.contract_status AS legacy_contract_status,
  cp.estimate_id,
  cp.source_email_id,
  cp.is_active,
  cp.status,
  cp.packet_type,
  cp.owner,
  cp.next_action,
  cp.requested_at,
  cp.received_at,
  cp.triage_started_at,
  cp.triage_completed_at,
  cp.sent_back_at,
  cp.counterparty_response_due_at,
  cp.counterparty_responded_at,
  cp.executed_at,
  cp.sla_minutes,
  cp.notes,
  cp.metadata,
  cp.created_at,
  cp.updated_at,
  COALESCE(dc.packet_document_count, 0) AS packet_document_count,
  COALESCE(dc.primary_contract_count, 0) AS primary_contract_count,
  COALESCE(dc.required_document_count, 0) AS required_document_count,
  CASE
    WHEN cp.received_at IS NULL THEN NULL
    ELSE FLOOR(EXTRACT(EPOCH FROM (now() - cp.received_at)) / 60)::int
  END AS minutes_since_received,
  CASE
    WHEN cp.received_at IS NULL OR cp.sla_minutes IS NULL THEN FALSE
    WHEN cp.status IN ('executed', 'archived') THEN FALSE
    WHEN FLOOR(EXTRACT(EPOCH FROM (now() - cp.received_at)) / 60)::int > cp.sla_minutes THEN TRUE
    ELSE FALSE
  END AS is_sla_breached
FROM public.contract_packets cp
JOIN public.projects p ON p.id = cp.project_id
LEFT JOIN doc_counts dc ON dc.packet_id = cp.id;

-- 6. Alter project_sov_revisions
ALTER TABLE public.project_sov_revisions
  ALTER COLUMN id SET DATA TYPE integer;

-- 7. Add retry tracking to attachments for transient failure recovery
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS extraction_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;
