\set ON_ERROR_STOP on
\pset pager off

-- Usage:
--   docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres \
--     -v q='lariat tofel' -f scripts/sql/triage_resolve_candidates.sql
--
-- Purpose:
--   Resolve likely project/estimate candidates with current-schema columns only.
--   This avoids stale-column mistakes like projects.project_name or estimates.project_id.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'name'
  ) THEN
    RAISE EXCEPTION 'Expected column public.projects.name is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'Expected table public.estimates is missing required columns';
  END IF;
END
$$;

\echo === PROJECT CANDIDATES ===
WITH q AS (
  SELECT
    :'q'::text AS raw,
    websearch_to_tsquery('simple', :'q') AS tsq
)
SELECT
  p.id,
  p.project_number,
  p.name,
  p.contractor,
  p.outlook_folder,
  p.contract_status,
  p.created_at,
  p.updated_at
FROM projects p
JOIN q ON true
WHERE
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      COALESCE(p.name, ''),
      COALESCE(p.contractor, ''),
      COALESCE(p.outlook_folder, ''),
      COALESCE(p.project_number, '')
    )
  ) @@ q.tsq
  OR p.name ILIKE '%' || q.raw || '%'
  OR COALESCE(p.contractor, '') ILIKE '%' || q.raw || '%'
  OR COALESCE(p.outlook_folder, '') ILIKE '%' || q.raw || '%'
  OR COALESCE(p.project_number, '') ILIKE '%' || q.raw || '%'
ORDER BY p.updated_at DESC
LIMIT 100;

\echo
\echo === ESTIMATE CANDIDATES ===
WITH q AS (
  SELECT
    :'q'::text AS raw,
    websearch_to_tsquery('simple', :'q') AS tsq
)
SELECT
  e.id,
  e.estimate_number,
  e.name,
  e.job_name,
  e.client_name,
  e.contractor,
  e.created_at,
  e.updated_at
FROM estimates e
JOIN q ON true
WHERE
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      COALESCE(e.name, ''),
      COALESCE(e.job_name, ''),
      COALESCE(e.client_name, ''),
      COALESCE(e.contractor, ''),
      COALESCE(e.estimate_number, '')
    )
  ) @@ q.tsq
  OR e.name ILIKE '%' || q.raw || '%'
  OR COALESCE(e.job_name, '') ILIKE '%' || q.raw || '%'
  OR COALESCE(e.client_name, '') ILIKE '%' || q.raw || '%'
  OR COALESCE(e.contractor, '') ILIKE '%' || q.raw || '%'
  OR COALESCE(e.estimate_number, '') ILIKE '%' || q.raw || '%'
ORDER BY e.updated_at DESC
LIMIT 100;
