-- Documents table (formerly contracts)
--
-- Goals:
-- - If a legacy `contracts` table exists, rename it to `documents`.
-- - Ensure the `documents` table exists for fresh environments.
-- - Add permit linkage and drop obsolete contract-specific columns.

DO $$
BEGIN
  -- Rename legacy `contracts` → `documents` only if `documents` doesn't already exist.
  IF to_regclass('public.contracts') IS NOT NULL AND to_regclass('public.documents') IS NULL THEN
    ALTER TABLE public.contracts RENAME TO documents;
  END IF;

  -- Best-effort rename of legacy index/sequence names (safe if already renamed).
  IF to_regclass('public.contracts_pkey') IS NOT NULL AND to_regclass('public.documents_pkey') IS NULL THEN
    ALTER INDEX public.contracts_pkey RENAME TO documents_pkey;
  END IF;

  IF to_regclass('public.idx_contracts_doc_type') IS NOT NULL AND to_regclass('public.idx_documents_doc_type') IS NULL THEN
    ALTER INDEX public.idx_contracts_doc_type RENAME TO idx_documents_doc_type;
  END IF;

  IF to_regclass('public.contracts_id_seq') IS NOT NULL AND to_regclass('public.documents_id_seq') IS NULL THEN
    ALTER SEQUENCE public.contracts_id_seq RENAME TO documents_id_seq;
  END IF;
END $$;

-- Create documents table for fresh DBs (the system treats this as the canonical document store).
CREATE TABLE IF NOT EXISTS public.documents (
  id SERIAL PRIMARY KEY,
  email_id INTEGER REFERENCES public.emails(id),
  estimate_id INTEGER REFERENCES public.estimates(id),
  project_id INTEGER REFERENCES public.projects(id),
  attachment_id INTEGER REFERENCES public.attachments(id),
  document_type TEXT NOT NULL DEFAULT 'unknown',
  summary TEXT,
  raw_extraction JSONB DEFAULT '{}'::jsonb,
  file_path TEXT,
  file_name TEXT,
  model TEXT,
  processing_time_ms INTEGER,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  extraction_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  original_from TEXT,
  original_subject TEXT,
  forwarder_email TEXT
);

-- Link documents to specific dust permits (NOIs, SWPPPs, permit PDFs, site plans, etc.)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS permit_id TEXT
  REFERENCES public.dust_permits_filed_by_desert_services(id);

CREATE INDEX IF NOT EXISTS idx_documents_permit
  ON public.documents(permit_id)
  WHERE permit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_doc_type
  ON public.documents(document_type);

CREATE INDEX IF NOT EXISTS idx_documents_email
  ON public.documents(email_id);

CREATE INDEX IF NOT EXISTS idx_documents_estimate
  ON public.documents(estimate_id);

CREATE INDEX IF NOT EXISTS idx_documents_project
  ON public.documents(project_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
  ON public.documents(extraction_status);

-- Drop contract-specific columns. Structured extraction data now lives in raw_extraction JSONB.
ALTER TABLE public.documents DROP COLUMN IF EXISTS contractor;
ALTER TABLE public.documents DROP COLUMN IF EXISTS subcontractor;
ALTER TABLE public.documents DROP COLUMN IF EXISTS project_name;
ALTER TABLE public.documents DROP COLUMN IF EXISTS project_address;
ALTER TABLE public.documents DROP COLUMN IF EXISTS project_number;
ALTER TABLE public.documents DROP COLUMN IF EXISTS contract_value;
ALTER TABLE public.documents DROP COLUMN IF EXISTS retainage_pct;
ALTER TABLE public.documents DROP COLUMN IF EXISTS scope;
ALTER TABLE public.documents DROP COLUMN IF EXISTS effective_date;
ALTER TABLE public.documents DROP COLUMN IF EXISTS start_date;
ALTER TABLE public.documents DROP COLUMN IF EXISTS completion_date;
ALTER TABLE public.documents DROP COLUMN IF EXISTS payment_terms;
ALTER TABLE public.documents DROP COLUMN IF EXISTS estimate_reference;
ALTER TABLE public.documents DROP COLUMN IF EXISTS line_items;
ALTER TABLE public.documents DROP COLUMN IF EXISTS requirements;
