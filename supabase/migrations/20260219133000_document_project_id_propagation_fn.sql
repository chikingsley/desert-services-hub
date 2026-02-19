-- Move document project-id propagation to a DB-owned function.
-- This keeps the backfill logic close to the data model and callable from app jobs.

CREATE OR REPLACE FUNCTION public.propagate_document_project_ids()
RETURNS TABLE (
  total_updated INTEGER,
  via_email INTEGER,
  via_estimate INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_via_email INTEGER := 0;
  v_via_estimate INTEGER := 0;
BEGIN
  -- Pass 1: documents.email_id -> emails.project_id
  UPDATE documents
  SET project_id = e.project_id,
      updated_at = now()
  FROM emails e
  WHERE documents.email_id = e.id
    AND documents.project_id IS NULL
    AND e.project_id IS NOT NULL;
  GET DIAGNOSTICS v_via_email = ROW_COUNT;

  -- Pass 2: documents.estimate_id -> project_estimates.project_id
  -- If an estimate links to multiple projects, prefer active/seed over lost.
  UPDATE documents
  SET project_id = pe_best.project_id,
      updated_at = now()
  FROM (
    SELECT DISTINCT ON (pe.estimate_id)
      pe.estimate_id,
      pe.project_id
    FROM project_estimates pe
    JOIN projects p ON p.id = pe.project_id
    ORDER BY pe.estimate_id,
      CASE p.lifecycle_state
        WHEN 'active' THEN 0
        WHEN 'seed' THEN 1
        WHEN 'lost' THEN 2
        ELSE 3
      END ASC
  ) pe_best
  WHERE documents.estimate_id = pe_best.estimate_id
    AND documents.project_id IS NULL;
  GET DIAGNOSTICS v_via_estimate = ROW_COUNT;

  RETURN QUERY
  SELECT
    v_via_email + v_via_estimate,
    v_via_email,
    v_via_estimate;
END;
$$;
