-- Contract packet lifecycle model to replace ambiguous project-level "Pending" semantics.
-- This introduces a first-class packet row per active project contract cycle and
-- links packet rows to one-or-many documents in the packet.

CREATE TABLE IF NOT EXISTS public.contract_packets (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  estimate_id INTEGER REFERENCES public.estimates(id),
  source_email_id INTEGER REFERENCES public.emails(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'requested',
  packet_type TEXT NOT NULL DEFAULT 'unknown',
  requested_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  triage_started_at TIMESTAMPTZ,
  triage_completed_at TIMESTAMPTZ,
  sent_back_at TIMESTAMPTZ,
  counterparty_response_due_at TIMESTAMPTZ,
  counterparty_responded_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  sla_minutes INTEGER,
  owner TEXT,
  next_action TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_packets_status_check CHECK (
    status IN (
      'requested',
      'received',
      'triage_in_progress',
      'ready_to_send_back',
      'sent_back',
      'awaiting_counterparty',
      'executed',
      'on_hold',
      'archived'
    )
  ),
  CONSTRAINT contract_packets_packet_type_check CHECK (
    packet_type IN ('single_pdf', 'multi_doc_packet', 'mixed', 'unknown')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contract_packets_one_active_per_project
  ON public.contract_packets(project_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_contract_packets_status
  ON public.contract_packets(status);

CREATE INDEX IF NOT EXISTS idx_contract_packets_received
  ON public.contract_packets(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_packets_project_status
  ON public.contract_packets(project_id, status)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_contract_packets_source_email
  ON public.contract_packets(source_email_id)
  WHERE source_email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contract_packet_documents (
  id BIGSERIAL PRIMARY KEY,
  packet_id BIGINT NOT NULL REFERENCES public.contract_packets(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_role TEXT NOT NULL DEFAULT 'supporting',
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_packet_documents_role_check CHECK (
    document_role IN (
      'primary_contract',
      'po',
      'insurance',
      'sov',
      'plan_set',
      'exhibit',
      'supporting'
    )
  ),
  CONSTRAINT ux_contract_packet_documents UNIQUE (packet_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_packet_documents_packet
  ON public.contract_packet_documents(packet_id);

CREATE INDEX IF NOT EXISTS idx_contract_packet_documents_role
  ON public.contract_packet_documents(packet_id, document_role);

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

-- Bootstrap one active packet per project from existing project-level status
-- when no active packet exists yet.
INSERT INTO public.contract_packets (
  project_id,
  status,
  packet_type,
  requested_at,
  received_at,
  sent_back_at,
  executed_at,
  metadata,
  next_action,
  is_active,
  created_at,
  updated_at
)
SELECT
  p.id,
  CASE COALESCE(p.contract_status, 'Pending')
    WHEN 'Executed' THEN 'executed'
    WHEN 'Sent Back' THEN 'sent_back'
    WHEN 'Received' THEN 'received'
    ELSE 'requested'
  END AS status,
  'unknown' AS packet_type,
  CASE WHEN COALESCE(p.contract_status, 'Pending') = 'Pending' THEN p.updated_at ELSE NULL END,
  CASE WHEN COALESCE(p.contract_status, 'Pending') IN ('Received', 'Sent Back', 'Executed') THEN p.updated_at ELSE NULL END,
  CASE WHEN COALESCE(p.contract_status, 'Pending') = 'Sent Back' THEN p.updated_at ELSE NULL END,
  CASE WHEN COALESCE(p.contract_status, 'Pending') = 'Executed' THEN p.updated_at ELSE NULL END,
  jsonb_build_object('seeded_from_projects_contract_status', true, 'legacy_status', COALESCE(p.contract_status, 'Pending')),
  CASE COALESCE(p.contract_status, 'Pending')
    WHEN 'Pending' THEN 'Request contract packet from counterparty'
    WHEN 'Received' THEN 'Review packet and classify required docs'
    WHEN 'Sent Back' THEN 'Await counterparty response'
    WHEN 'Executed' THEN 'Archive final signed packet'
    ELSE 'Review contract packet status'
  END,
  TRUE,
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now())
FROM public.projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_packets cp
  WHERE cp.project_id = p.id
    AND cp.is_active = TRUE
);
