-- Project ↔ Estimate join table
--
-- Replaces the legacy `projects.linked_estimate_ids` string field (and any
-- ad-hoc usage of `projects.monday_item_id` to look up estimate SharePoint URLs).

CREATE TABLE IF NOT EXISTS public.project_estimates (
  project_id INTEGER NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  estimate_id INTEGER NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, estimate_id)
);

CREATE INDEX IF NOT EXISTS idx_project_estimates_project
  ON public.project_estimates(project_id);

CREATE INDEX IF NOT EXISTS idx_project_estimates_estimate
  ON public.project_estimates(estimate_id);

-- Backfill from projects.monday_item_id (legacy: some rows stored estimate monday_item_id here).
INSERT INTO public.project_estimates (project_id, estimate_id, source)
SELECT p.id, e.id, 'projects.monday_item_id'
FROM public.projects p
JOIN public.estimates e ON e.monday_item_id = p.monday_item_id
WHERE p.monday_item_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill from projects.linked_estimate_ids (legacy string containing Monday item IDs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'linked_estimate_ids'
  ) THEN
    INSERT INTO public.project_estimates (project_id, estimate_id, source)
    SELECT
      p.id AS project_id,
      e.id AS estimate_id,
      'projects.linked_estimate_ids' AS source
    FROM public.projects p
    -- linked_estimate_ids was a free-form string that usually contained a JSON-ish
    -- array of Monday item IDs (e.g. ["9646558866"]). We just extract long digit
    -- sequences (>= 6) to avoid relying on brittle word-boundary escapes.
    CROSS JOIN LATERAL regexp_matches(p.linked_estimate_ids, '([0-9]{6,})', 'g') AS m(match)
    JOIN public.estimates e ON e.monday_item_id = m.match[1]
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Drop the legacy column now that project_estimates is canonical.
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS linked_estimate_ids;
