-- Project-level final Schedule of Values (SOV)
--
-- Keeps one authoritative SOV snapshot per project plus append-only revisions.
-- Estimate extraction stays unchanged; publishing into this table is explicit.

CREATE TABLE IF NOT EXISTS public.project_sov_master (
  project_id INTEGER PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash TEXT NOT NULL,
  source_estimate_id INTEGER REFERENCES public.estimates(id) ON DELETE SET NULL,
  source_estimate_version_id TEXT REFERENCES public.estimate_versions(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_sov_master_source_estimate
  ON public.project_sov_master(source_estimate_id);

CREATE INDEX IF NOT EXISTS idx_project_sov_master_updated_at
  ON public.project_sov_master(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.project_sov_revisions (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash TEXT NOT NULL,
  source_estimate_id INTEGER REFERENCES public.estimates(id) ON DELETE SET NULL,
  source_estimate_version_id TEXT REFERENCES public.estimate_versions(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_sov_revisions_project_created
  ON public.project_sov_revisions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_sov_revisions_project_hash
  ON public.project_sov_revisions(project_id, snapshot_hash);
