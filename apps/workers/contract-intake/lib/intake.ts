/**
 * Contract Intake Processing
 *
 * Classifies + extracts structured data from IC (Internal Contracts)
 * group PDF attachments using the pdf-analysis LLM pipeline.
 *
 * Flow:
 *   1. Group sync detects new IC post with PDF attachments
 *   2. Enqueues contract_intake job (emailId, subject, pdfPaths)
 *   3. This module processes each PDF:
 *      - Spawns pdf-analysis ingest (pdfplumber → LLM classification + extraction)
 *      - Stores result in documents table
 *      - Matches to estimate by reference number if found
 */
import { join } from "node:path";
import { db } from "@lib/db/hub";

// ============================================================================
// Config
// ============================================================================

const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../../../apps/cli-tools/pdf-analysis-cli"
);

// ============================================================================
// Types
// ============================================================================

export interface IngestOutput {
  filename: string;
  document_type: string;
  summary: string;
  extracted: {
    parties?: { contractor?: string; subcontractor?: string };
    project?: { name?: string; address?: string; number?: string };
    financial?: {
      contract_value?: number | null;
      retainage_pct?: number | null;
      payment_terms?: string;
    };
    dates?: {
      effective_date?: string;
      start_date?: string;
      completion_date?: string;
    };
    scope?: string;
    line_items?: Array<{
      description: string;
      amount?: number | null;
      qty?: number | null;
      unit?: string;
    }>;
    requirements?: string[];
    estimate_reference?: string;
    [key: string]: unknown;
  };
  page_count: number;
  text_method: string;
  model: string;
  processing_time_ms: number;
}

export interface IntakeResult {
  documentId: number | null;
  fileName: string;
  documentType: string;
  summary: string;
  estimateLinked: boolean;
  error?: string;
}

// ============================================================================
// Prepared Statements
// ============================================================================

const insertDocument = db.prepare(`
  INSERT INTO documents (
    email_id, document_type, summary, raw_extraction,
    file_path, file_name, model, processing_time_ms,
    extraction_status
  ) VALUES (
    $1, $2, $3, $4::jsonb,
    $5, $6, $7, $8,
    'success'
  )
  RETURNING id
`);

const insertDocumentError = db.prepare(`
  INSERT INTO documents (
    email_id, file_path, file_name,
    extraction_status, extraction_error
  ) VALUES ($1, $2, $3, 'failed', $4)
  RETURNING id
`);

const matchEstimateByRef = db.query<{ id: number; name: string }>(
  "SELECT id, name FROM estimates WHERE estimate_number = ? LIMIT 1"
);

const linkDocumentToEstimate = db.prepare(
  "UPDATE documents SET estimate_id = $1 WHERE id = $2"
);

// ============================================================================
// Core
// ============================================================================

/**
 * Run pdf-analysis ingest on a single PDF file.
 * Spawns the Python CLI, parses JSON output.
 */
export async function runIngest(pdfPath: string): Promise<IngestOutput> {
  const proc = Bun.spawn(
    [
      "uv",
      "run",
      "-m",
      "pdf_analysis.cli",
      "ingest",
      pdfPath,
      "--format",
      "json",
    ],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 180_000); // 3min for LLM
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      `pdf-analysis exit ${exitCode}: ${stderr.trim().slice(0, 500)}`
    );
  }

  const results = JSON.parse(stdout) as IngestOutput[];
  if (!results[0]) {
    throw new Error("pdf-analysis returned empty results");
  }

  return results[0];
}

/**
 * Process a single PDF: ingest → store → link.
 */
async function processSinglePdf(
  emailId: number,
  pdfPath: string
): Promise<IntakeResult> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;

  try {
    const result = await runIngest(pdfPath);
    const ext = result.extracted;

    const documentRow = await insertDocument.get(
      emailId,
      result.document_type,
      result.summary,
      JSON.stringify(ext),
      pdfPath,
      fileName,
      result.model,
      result.processing_time_ms
    );

    const documentId = (documentRow as { id: number } | null)?.id ?? null;
    let estimateLinked = false;

    // Try to match to estimate by reference
    if (documentId && ext.estimate_reference) {
      const estimate = await matchEstimateByRef.get(ext.estimate_reference);
      if (estimate) {
        await linkDocumentToEstimate.run(estimate.id, documentId);
        estimateLinked = true;
        console.log(
          `[contract-intake]   Linked to estimate: ${estimate.name} (ref: ${ext.estimate_reference})`
        );
      }
    }

    console.log(
      `[contract-intake]   ${fileName}: ${result.document_type} — ${result.summary.slice(0, 80)}`
    );

    return {
      documentId,
      fileName,
      documentType: result.document_type,
      summary: result.summary,
      estimateLinked,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[contract-intake]   Failed ${fileName}: ${msg}`);
    await insertDocumentError.run(
      emailId,
      pdfPath,
      fileName,
      msg.slice(0, 1000)
    );

    return {
      documentId: null,
      fileName,
      documentType: "error",
      summary: msg,
      estimateLinked: false,
      error: msg,
    };
  }
}

/**
 * Process a contract_intake job: classify + extract each PDF,
 * store results, and try to match to an estimate.
 */
export async function processContractIntake(
  emailId: number,
  subject: string,
  pdfPaths: string[]
): Promise<IntakeResult[]> {
  console.log(
    `[contract-intake] Processing ${pdfPaths.length} PDF(s) from "${subject}"`
  );

  const results: IntakeResult[] = [];
  for (const pdfPath of pdfPaths) {
    const result = await processSinglePdf(emailId, pdfPath);
    results.push(result);
  }

  const succeeded = results.filter((r) => !r.error).length;
  const linked = results.filter((r) => r.estimateLinked).length;
  console.log(
    `[contract-intake] Done: ${succeeded}/${results.length} extracted, ${linked} linked to estimates`
  );

  return results;
}
