-- Ensure every estimate has a version and exactly one current version.
-- Root cause: Monday sync upserts wrote estimates without creating estimate_versions rows.

BEGIN;

-- Backfill estimates missing all versions.
INSERT INTO public.estimate_versions (
  id,
  estimate_id,
  version_number,
  source,
  total,
  is_current,
  created_at
)
SELECT
  md5(e.id::text || '-' || now()::text || '-' || random()::text) AS id,
  e.id AS estimate_id,
  1 AS version_number,
  'sync' AS source,
  COALESCE(e.extracted_grand_total, e.bid_value, 0) AS total,
  1 AS is_current,
  COALESCE(e.updated_at, e.created_at, now()) AS created_at
FROM public.estimates e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.estimate_versions v
  WHERE v.estimate_id = e.id
);

-- Normalize so each estimate has exactly one current version.
WITH ranked AS (
  SELECT
    v.id,
    row_number() OVER (
      PARTITION BY v.estimate_id
      ORDER BY v.is_current DESC, v.version_number DESC, v.created_at DESC, v.id DESC
    ) AS rn
  FROM public.estimate_versions v
)
UPDATE public.estimate_versions v
SET is_current = CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END
FROM ranked
WHERE v.id = ranked.id
  AND v.is_current <> CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END;

-- Enforce one current version per estimate going forward.
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimate_versions_one_current
ON public.estimate_versions (estimate_id)
WHERE is_current = 1;

COMMIT;
