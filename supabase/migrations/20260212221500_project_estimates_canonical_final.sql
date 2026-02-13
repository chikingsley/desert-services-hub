-- Canonical final estimate pointer per project
--
-- Adds a single explicit "final SOV" pointer by marking one linked estimate as
-- canonical for each project. This allows automation to fetch one deterministic
-- estimate/SOV source per project.

ALTER TABLE public.project_estimates
  ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canonicalized_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_estimates_one_canonical_per_project
  ON public.project_estimates(project_id)
  WHERE is_canonical;

CREATE INDEX IF NOT EXISTS idx_project_estimates_project_canonical
  ON public.project_estimates(
    project_id,
    is_canonical DESC,
    canonicalized_at DESC,
    created_at DESC
  );
