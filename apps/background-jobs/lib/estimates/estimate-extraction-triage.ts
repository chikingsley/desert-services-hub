/**
 * Estimate Extraction Triage — Reset Failed Estimates for Reprocessing
 *
 * In the unified pipeline, triage simply resets failed monday_asset documents
 * back to 'pending' so the document backfill picks them up again.
 *
 * The backfill handles: download → Kreuzberg → Stage 1 classify → Stage 2 extract.
 */
import { db } from "@lib/db/hub";

const ESTIMATE_COLUMN_ID = "file_mksebs2e";

export interface EstimateExtractionTriageOptions {
  maxRows?: number;
  log?: (line: string) => void;
}

export interface EstimateExtractionTriageResult {
  candidateRows: number;
  processedRows: number;
  resetToPending: number;
  markedNonPdf: number;
  skippedNoAsset: number;
}

const listFailedEstimateDocuments = db.query<
  {
    doc_id: number;
    estimate_id: number;
    name: string;
    file_name: string | null;
    file_extension: string | null;
  },
  [number]
>(`
  SELECT
    d.id as doc_id,
    e.id as estimate_id,
    e.name,
    d.file_name,
    d.file_extension
  FROM estimates e
  JOIN documents d ON d.source = 'monday_asset'
    AND d.monday_item_id = e.monday_item_id
    AND d.monday_column_id = '${ESTIMATE_COLUMN_ID}'
  WHERE e.extraction_status = 'failed'
    AND d.extraction_status IN ('failed', 'success')
    AND d.extraction_attempts < 5
  ORDER BY d.updated_at ASC
  LIMIT $1
`);

const resetDocToPending = db.prepare(`
  UPDATE documents
  SET extraction_status = 'pending',
      updated_at = now()
  WHERE id = $1
`);

const markEstimatePending = db.prepare(`
  UPDATE estimates
  SET extraction_status = 'pending',
      updated_at = now()
  WHERE id = $1
`);

const markEstimateNonPdf = db.prepare(`
  UPDATE estimates
  SET extraction_status = 'failed',
      extraction_error = '[triage:non_pdf] Estimate column file is non-PDF',
      extracted_at = now(),
      updated_at = now()
  WHERE id = $1
`);

export async function runEstimateExtractionTriage(
  options?: EstimateExtractionTriageOptions
): Promise<EstimateExtractionTriageResult> {
  const maxRows = Number.isFinite(options?.maxRows)
    ? Math.max(1, Number(options?.maxRows))
    : 10;
  const log = options?.log ?? console.log;

  const rows = await listFailedEstimateDocuments.all(maxRows);

  const result: EstimateExtractionTriageResult = {
    candidateRows: rows.length,
    processedRows: 0,
    resetToPending: 0,
    markedNonPdf: 0,
    skippedNoAsset: 0,
  };

  if (rows.length === 0) {
    return result;
  }

  log(`[triage] ${rows.length} failed estimate documents to reset`);

  for (const row of rows) {
    const ext = (row.file_extension ?? "").toLowerCase();
    result.processedRows++;

    if (ext && ext !== ".pdf" && ext !== "pdf") {
      await markEstimateNonPdf.run(row.estimate_id);
      result.markedNonPdf++;
      log(`[triage] ${row.name}: non-pdf (${row.file_name})`);
      continue;
    }

    // Reset both the document and estimate to pending for reprocessing
    await resetDocToPending.run(row.doc_id);
    await markEstimatePending.run(row.estimate_id);
    result.resetToPending++;
    log(`[triage] ${row.name}: reset to pending (doc #${row.doc_id})`);
  }

  log(
    `[triage] Done: ${result.resetToPending} reset, ${result.markedNonPdf} non-pdf, ${result.skippedNoAsset} no asset`
  );

  return result;
}
