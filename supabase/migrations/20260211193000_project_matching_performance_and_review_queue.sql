-- Project matching performance + review queue persistence.

-- Enable trigram operator class for ILIKE-backed fuzzy candidate fetch.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Exact-match acceleration for normalized project lookups.
CREATE INDEX IF NOT EXISTS idx_projects_normalized_name
  ON public.projects(normalized_name);

-- Fuzzy candidate search acceleration.
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
  ON public.projects USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_contractor_trgm
  ON public.projects USING GIN (contractor gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_address_trgm
  ON public.projects USING GIN (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_outlook_folder_trgm
  ON public.projects USING GIN (outlook_folder gin_trgm_ops);

-- Persist "manual review required" matching outcomes for operator triage.
CREATE TABLE IF NOT EXISTS public.project_match_reviews (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  primary_text TEXT NOT NULL,
  alias_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  contractor_hint TEXT,
  address_hint TEXT,
  account_id_hint INTEGER REFERENCES public.accounts(id),
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_project_id INTEGER REFERENCES public.projects(id),
  note TEXT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_key)
);

DO $$
BEGIN
  ALTER TABLE public.project_match_reviews
  ADD CONSTRAINT project_match_reviews_status_check
  CHECK (status IN ('pending', 'resolved', 'dismissed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_match_reviews_status_created
  ON public.project_match_reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_match_reviews_project
  ON public.project_match_reviews(selected_project_id);
