-- Move estimate extraction triage status-reset logic into a DB-owned function.

CREATE OR REPLACE FUNCTION public.run_estimate_extraction_triage(
  p_max_rows INTEGER DEFAULT 10,
  p_estimate_column_id TEXT DEFAULT 'file_mksebs2e'
)
RETURNS TABLE (
  candidate_rows INTEGER,
  processed_rows INTEGER,
  reset_to_pending INTEGER,
  marked_non_pdf INTEGER,
  skipped_no_asset INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_rows INTEGER := GREATEST(1, COALESCE(p_max_rows, 10));
  v_candidate_rows INTEGER := 0;
  v_reset_to_pending INTEGER := 0;
  v_marked_non_pdf INTEGER := 0;
BEGIN
  CREATE TEMP TABLE tmp_estimate_triage_candidates ON COMMIT DROP AS
  SELECT
    d.id AS doc_id,
    e.id AS estimate_id,
    d.file_extension
  FROM estimates e
  JOIN documents d ON d.source = 'monday_asset'
    AND d.monday_item_id = e.monday_item_id
    AND d.monday_column_id = p_estimate_column_id
  WHERE e.extraction_status = 'failed'
    AND d.extraction_status IN ('failed', 'success')
    AND d.extraction_attempts < 5
  ORDER BY d.updated_at ASC
  LIMIT v_max_rows;

  SELECT COUNT(*)::int
  INTO v_candidate_rows
  FROM tmp_estimate_triage_candidates;

  IF v_candidate_rows = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0;
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_estimate_triage_non_pdf ON COMMIT DROP AS
  SELECT estimate_id
  FROM tmp_estimate_triage_candidates
  WHERE lower(COALESCE(file_extension, '')) NOT IN ('', '.pdf', 'pdf');

  SELECT COUNT(*)::int
  INTO v_marked_non_pdf
  FROM tmp_estimate_triage_non_pdf;

  UPDATE estimates
  SET extraction_status = 'failed',
      extraction_error = '[triage:non_pdf] Estimate column file is non-PDF',
      extracted_at = now(),
      updated_at = now()
  WHERE id IN (SELECT DISTINCT estimate_id FROM tmp_estimate_triage_non_pdf);

  CREATE TEMP TABLE tmp_estimate_triage_pdf ON COMMIT DROP AS
  SELECT doc_id, estimate_id
  FROM tmp_estimate_triage_candidates
  WHERE lower(COALESCE(file_extension, '')) IN ('', '.pdf', 'pdf');

  SELECT COUNT(*)::int
  INTO v_reset_to_pending
  FROM tmp_estimate_triage_pdf;

  UPDATE documents
  SET extraction_status = 'pending',
      updated_at = now()
  WHERE id IN (SELECT doc_id FROM tmp_estimate_triage_pdf);

  UPDATE estimates
  SET extraction_status = 'pending',
      updated_at = now()
  WHERE id IN (SELECT DISTINCT estimate_id FROM tmp_estimate_triage_pdf);

  RETURN QUERY
  SELECT
    v_candidate_rows,
    v_candidate_rows,
    v_reset_to_pending,
    v_marked_non_pdf,
    0;
END;
$$;
