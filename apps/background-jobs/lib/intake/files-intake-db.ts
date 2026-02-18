/**
 * Files Intake — Shared DB Infrastructure
 *
 * Shared configuration, types, prepared statements, and Kreuzberg extraction
 * helpers used by the per-type file processors in files-intake-processors.ts.
 */

import { extractFile } from "@kreuzberg/node";
import { db } from "@lib/db/hub";

// ============================================================================
// Config
// ============================================================================

export const LOG = "[files-intake]";
export const MIN_KREUZBERG_TEXT_LENGTH = 100;
export const KREUZBERG_OCR_BACKEND =
  process.env.KREUZBERG_OCR_BACKEND?.trim() || null;
const KREUZBERG_OCR_LANGUAGE =
  process.env.KREUZBERG_OCR_LANGUAGE?.trim() || undefined;

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

export interface EmailMeta {
  originalFrom: string;
  originalSubject: string;
  forwarderEmail: string;
}

export interface KreuzbergExtraction {
  content: string;
  tables: string[];
  metadata: Record<string, unknown>;
  extractor: string;
  ocrAttempted: boolean;
  ocrError?: string;
}

// ============================================================================
// Prepared Statements
// ============================================================================

export const insertFileRecord = db.prepare(`
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

export const insertFileError = db.prepare(`
  INSERT INTO documents (
    file_path, file_name,
    extraction_status, extraction_error,
    original_from, original_subject, forwarder_email
  ) VALUES ($1, $2, 'failed', $3, $4, $5, $6)
  RETURNING id
`);

// ============================================================================
// Kreuzberg Extraction Helpers
// ============================================================================

function getOcrConfig(): { backend: string; language?: string } | null {
  if (!KREUZBERG_OCR_BACKEND) {
    return null;
  }
  if (KREUZBERG_OCR_LANGUAGE) {
    return { backend: KREUZBERG_OCR_BACKEND, language: KREUZBERG_OCR_LANGUAGE };
  }
  return { backend: KREUZBERG_OCR_BACKEND };
}

export async function extractWithKreuzberg(
  filePath: string,
  options?: { minTextLength?: number; preferOcr?: boolean }
): Promise<KreuzbergExtraction> {
  const minTextLength = options?.minTextLength ?? 0;
  const preferOcr = options?.preferOcr ?? false;
  const firstPass = await extractFile(filePath);

  let content = firstPass.content ?? "";
  let tables = firstPass.tables?.map((table) => table.markdown) ?? [];
  const metadata =
    (firstPass.metadata as Record<string, unknown> | undefined) ?? {};
  const ocrConfig = getOcrConfig();
  const shouldTryOcr =
    ocrConfig !== null && (preferOcr || content.length < minTextLength);

  let ocrAttempted = false;
  let ocrError: string | undefined;
  let extractor = "kreuzberg";

  if (shouldTryOcr && ocrConfig) {
    ocrAttempted = true;
    try {
      const ocrPass = await extractFile(filePath, null, {
        forceOcr: true,
        ocr: ocrConfig,
      });
      const ocrContent = ocrPass.content ?? "";
      if (ocrContent.length > content.length) {
        content = ocrContent;
        tables = ocrPass.tables?.map((table) => table.markdown) ?? tables;
      }
      extractor = `kreuzberg+ocr:${ocrConfig.backend}`;
    } catch (error) {
      ocrError = error instanceof Error ? error.message : String(error);
    }
  }

  return { content, tables, metadata, extractor, ocrAttempted, ocrError };
}
