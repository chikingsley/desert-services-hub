/**
 * Contract Email Intake — Parse Pipeline Processing
 *
 * Processes PDF attachments from forwarded emails using the parse pipeline:
 *   pdfplumber (text) + GLM OCR (vision) + Kimi K2.5 (reconciliation)
 *
 * Also runs classify to determine document type.
 *
 * Results are stored in the documents table with the reconciled markdown
 * as the summary and the full parse output as raw_extraction.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@lib/db/hub";

// ============================================================================
// Config
// ============================================================================

const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../../packages/documents/pdf-analysis-cli"
);

const LOG = "[doc-parse]";

function resolveUvBin(): string {
  if (process.env.UV_BIN?.trim()) {
    return process.env.UV_BIN.trim();
  }
  if (existsSync("/root/.local/bin/uv")) {
    return "/root/.local/bin/uv";
  }
  return "uv";
}

// ============================================================================
// Types
// ============================================================================

interface ParseOutput {
  filename: string;
  reconciled_markdown: string;
  page_count: number;
  processing_time_ms: number;
  ocr_model: string;
  reconcile_model: string;
  metadata: Record<string, unknown>;
}

interface ClassifyOutput {
  document_type: string;
  confidence: number;
  indicators: string[];
  page_count: number;
  filename: string;
  first_page_snippet: string;
}

export interface ContractsEmailIntakePayload {
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  attachmentPaths: string[];
  forwarderEmail: string;
}

export interface ParseIntakeResult {
  documentId: number | null;
  fileName: string;
  documentType: string;
  pageCount: number;
  processingTimeMs: number;
  error?: string;
}

// ============================================================================
// Prepared Statements
// ============================================================================

const insertDocument = db.prepare(`
  INSERT INTO documents (
    document_type, file_path, file_name,
    summary, raw_extraction,
    model, processing_time_ms,
    extraction_status,
    original_from, original_subject, forwarder_email
  ) VALUES (
    $1, $2, $3,
    $4, $5::jsonb,
    $6, $7,
    'success',
    $8, $9, $10
  )
  RETURNING id
`);

const insertDocumentError = db.prepare(`
  INSERT INTO documents (
    file_path, file_name,
    extraction_status, extraction_error,
    original_from, original_subject, forwarder_email
  ) VALUES (?, ?, 'failed', ?, ?, ?, ?)
  RETURNING id
`);

// ============================================================================
// Core — Spawn pdf-analysis CLI
// ============================================================================

async function runParse(pdfPath: string): Promise<ParseOutput> {
  const uvBin = resolveUvBin();
  const proc = Bun.spawn(
    [uvBin, "run", "pdf-analysis", "parse", pdfPath, "--format", "json"],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 300_000); // 5min for OCR + reconciliation
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      `pdf-analysis parse exit ${exitCode}: ${stderr.trim().slice(0, 500)}`
    );
  }

  return JSON.parse(stdout) as ParseOutput;
}

async function runClassify(pdfPath: string): Promise<ClassifyOutput> {
  const uvBin = resolveUvBin();
  const proc = Bun.spawn(
    [uvBin, "run", "pdf-analysis", "classify", pdfPath, "--format", "json"],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 30_000); // 30s — classify is fast
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      `pdf-analysis classify exit ${exitCode}: ${stderr.trim().slice(0, 500)}`
    );
  }

  // classify outputs a JSON array (one per file)
  const results = JSON.parse(stdout) as ClassifyOutput[];
  if (!results[0]) {
    throw new Error("pdf-analysis classify returned empty results");
  }
  return results[0];
}

// ============================================================================
// Process a single PDF
// ============================================================================

interface EmailMeta {
  originalFrom: string;
  originalSubject: string;
  forwarderEmail: string;
}

async function processSinglePdf(
  pdfPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResult> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;

  try {
    // Run classify (fast) and parse (slow) — classify first for quick feedback
    console.log(`${LOG}   Classifying: ${fileName}`);
    const classified = await runClassify(pdfPath);
    console.log(
      `${LOG}   Type: ${classified.document_type} (${(classified.confidence * 100).toFixed(0)}%)`
    );

    console.log(`${LOG}   Parsing: ${fileName}`);
    const parsed = await runParse(pdfPath);
    console.log(
      `${LOG}   Parsed: ${parsed.page_count} pages, ${parsed.processing_time_ms}ms`
    );

    // Store in documents table
    const rawExtraction = {
      reconciled_markdown: parsed.reconciled_markdown,
      classify: {
        document_type: classified.document_type,
        confidence: classified.confidence,
        indicators: classified.indicators,
      },
      ocr_model: parsed.ocr_model,
      reconcile_model: parsed.reconcile_model,
      page_count: parsed.page_count,
      metadata: parsed.metadata,
    };

    const row = (await insertDocument.get(
      classified.document_type,
      pdfPath,
      fileName,
      parsed.reconciled_markdown,
      JSON.stringify(rawExtraction),
      parsed.reconcile_model,
      parsed.processing_time_ms,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    const documentId = row?.id ?? null;

    console.log(
      `${LOG}   Stored document #${documentId}: ${classified.document_type}`
    );

    return {
      documentId,
      fileName,
      documentType: classified.document_type,
      pageCount: parsed.page_count,
      processingTimeMs: parsed.processing_time_ms,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed ${fileName}: ${msg}`);
    await insertDocumentError.run(pdfPath, fileName, msg.slice(0, 1000));

    return {
      documentId: null,
      fileName,
      documentType: "error",
      pageCount: 0,
      processingTimeMs: 0,
      error: msg,
    };
  }
}

// ============================================================================
// Main entry point — called by worker.ts
// ============================================================================

export async function processContractsEmailIntake(
  payload: ContractsEmailIntakePayload
): Promise<ParseIntakeResult[]> {
  const { attachmentPaths, originalSubject, originalFrom, forwarderEmail } =
    payload;

  console.log(
    `${LOG} Processing ${attachmentPaths.length} PDF(s) from "${originalSubject}" (${originalFrom})`
  );

  const emailMeta: EmailMeta = {
    originalFrom: originalFrom ?? "",
    originalSubject: originalSubject ?? "",
    forwarderEmail: forwarderEmail ?? "",
  };

  const results: ParseIntakeResult[] = [];
  for (const pdfPath of attachmentPaths) {
    const result = await processSinglePdf(pdfPath, emailMeta);
    results.push(result);
  }

  const succeeded = results.filter((r) => !r.error).length;
  console.log(
    `${LOG} Done: ${succeeded}/${results.length} parsed successfully`
  );

  return results;
}
