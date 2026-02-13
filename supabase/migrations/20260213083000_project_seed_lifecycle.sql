-- Project seed lifecycle for deterministic estimate-driven project creation.
--
-- Lifecycle states:
-- - seed: pre-award/pre-contract intake object, safe for auto-linking.
-- - active: promoted project with strong evidence (won/awarded/ready).
-- - lost: seed that is explicitly lost or aged out.
-- - archived: terminal state after manual cleanup.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS seed_key TEXT,
  ADD COLUMN IF NOT EXISTS seed_source TEXT,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_evidence_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.projects
  ADD CONSTRAINT projects_lifecycle_state_check
  CHECK (lifecycle_state IN ('seed', 'active', 'lost', 'archived'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_lifecycle_state_updated
  ON public.projects(lifecycle_state, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_seed_key
  ON public.projects(seed_key)
  WHERE seed_key IS NOT NULL;
