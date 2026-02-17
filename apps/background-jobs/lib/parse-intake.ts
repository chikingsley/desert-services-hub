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
import { db } from "@lib/db/hub";
import {
  type ClassifyResult,
  classifyPdf,
  type ParseResult,
  parsePdf,
} from "@lib/pdf-analysis";

const LOG = "[doc-parse]";

// ============================================================================
// Types
// ============================================================================

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
// Core — PDF Analysis Service calls
// ============================================================================

async function runParse(pdfPath: string): Promise<ParseResult> {
  const results = await parsePdf(pdfPath);
  if (!results[0]) {
    throw new Error("pdf-analysis parse returned empty results");
  }
  return results[0];
}

async function runClassify(pdfPath: string): Promise<ClassifyResult> {
  const results = await classifyPdf(pdfPath);
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
