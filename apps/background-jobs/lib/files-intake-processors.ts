/**
 * Files Intake — Per-Type Processors
 *
 * Individual file processors extracted from files-intake.ts:
 *   - PDF (Kreuzberg extraction, optional Kreuzberg OCR pass)
 *   - Images (Kreuzberg extraction, optional Kreuzberg OCR pass)
 *   - Office documents (Kreuzberg native extraction)
 *   - Text files (direct read)
 *   - ZIP archives (extract + recursive processing)
 *   - Unsupported files (metadata-only storage)
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { extractFile } from "@kreuzberg/node";
import { db } from "@lib/db/hub";
import type {
  ContractsEmailIntakePayload as ContractsEmailIntakePayloadType,
  ParseIntakeResult as ParseIntakeResultType,
} from "./parse-intake";

// ============================================================================
// Config
// ============================================================================

const LOG = "[files-intake]";
const MIN_KREUZBERG_TEXT_LENGTH = 100;
const KREUZBERG_OCR_BACKEND = process.env.KREUZBERG_OCR_BACKEND?.trim() || null;
const KREUZBERG_OCR_LANGUAGE =
  process.env.KREUZBERG_OCR_LANGUAGE?.trim() || undefined;

// ============================================================================
// Types
// ============================================================================

export interface EmailMeta {
  originalFrom: string;
  originalSubject: string;
  forwarderEmail: string;
}

interface KreuzbergExtraction {
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

const insertFileRecord = db.prepare(`
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

const insertFileError = db.prepare(`
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

async function extractWithKreuzberg(
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

// ============================================================================
// PDF Processing — Kreuzberg
// ============================================================================

export async function processPdf(
  pdfPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;
  const started = performance.now();

  try {
    const extracted = await extractWithKreuzberg(pdfPath, {
      minTextLength: MIN_KREUZBERG_TEXT_LENGTH,
    });
    const elapsed = Math.round(performance.now() - started);

    // Classify from extracted text (pure regex, no file I/O)
    let documentType = "pdf_document";
    try {
      const { classifyText } = await import("@lib/pdf-analysis");
      const classified = await classifyText(extracted.content, fileName);
      if (classified.document_type !== "unknown") {
        documentType = classified.document_type;
      }
    } catch {
      // classify-text service unavailable — fall back to generic type
    }

    const rawExtraction = {
      text_content: extracted.content,
      table_count: extracted.tables.length,
      tables: extracted.tables,
      metadata: extracted.metadata,
      extractor: extracted.extractor,
      char_count: extracted.content.length,
      ocr_attempted: extracted.ocrAttempted,
      ocr_error: extracted.ocrError ?? null,
    };

    const row = (await insertFileRecord.get(
      documentType,
      pdfPath,
      fileName,
      extracted.content.slice(0, 10_000),
      JSON.stringify(rawExtraction),
      extracted.extractor,
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    console.log(
      `${LOG}   Stored PDF #${row?.id} [${documentType}]: ${extracted.content.length} chars in ${elapsed}ms (${extracted.extractor})`
    );

    return {
      documentId: row?.id ?? null,
      fileName,
      documentType,
      pageCount: 0,
      processingTimeMs: elapsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed PDF ${fileName}: ${msg}`);
    await insertFileError.run(
      pdfPath,
      fileName,
      msg.slice(0, 1000),
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    );
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
// Image Processing — Kreuzberg (optionally with OCR backend)
// ============================================================================

export async function processImage(
  imagePath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = imagePath.split("/").pop() ?? imagePath;
  const started = performance.now();

  try {
    const extracted = await extractWithKreuzberg(imagePath, {
      minTextLength: 1,
      preferOcr: true,
    });
    const elapsed = Math.round(performance.now() - started);

    const rawExtraction = {
      text_content: extracted.content,
      table_count: extracted.tables.length,
      tables: extracted.tables,
      metadata: extracted.metadata,
      extractor: extracted.extractor,
      char_count: extracted.content.length,
      ocr_attempted: extracted.ocrAttempted,
      ocr_error: extracted.ocrError ?? null,
    };

    const row = (await insertFileRecord.get(
      "image_ocr",
      imagePath,
      fileName,
      extracted.content.slice(0, 10_000),
      JSON.stringify(rawExtraction),
      extracted.extractor,
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    console.log(
      `${LOG}   Stored image #${row?.id}: ${extracted.content.length} chars in ${elapsed}ms (${extracted.extractor})`
    );

    return {
      documentId: row?.id ?? null,
      fileName,
      documentType: "image_ocr",
      pageCount: 1,
      processingTimeMs: elapsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed image ${fileName}: ${msg}`);
    await insertFileError.run(
      imagePath,
      fileName,
      msg.slice(0, 1000),
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    );
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
// Text Processing — direct read + store
// ============================================================================

export async function processTextFile(
  textPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = textPath.split("/").pop() ?? textPath;
  const started = performance.now();

  try {
    const content = await Bun.file(textPath).text();
    const elapsed = Math.round(performance.now() - started);

    const isEmailBody = fileName === "email-body.txt";
    const docType = isEmailBody ? "email_body" : "text_document";

    const rawExtraction = {
      text_content: content,
      source: isEmailBody ? "email_body" : "file_attachment",
      char_count: content.length,
    };

    const row = (await insertFileRecord.get(
      docType,
      textPath,
      fileName,
      content.slice(0, 10_000),
      JSON.stringify(rawExtraction),
      "direct_read",
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    console.log(
      `${LOG}   Stored ${docType} #${row?.id}: ${content.length} chars`
    );

    return {
      documentId: row?.id ?? null,
      fileName,
      documentType: docType,
      pageCount: 0,
      processingTimeMs: elapsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed text ${fileName}: ${msg}`);
    await insertFileError.run(
      textPath,
      fileName,
      msg.slice(0, 1000),
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    );
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
// Office Document Processing — Kreuzberg native extraction
// ============================================================================

export async function processOfficeDocument(
  filePath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const started = performance.now();

  try {
    console.log(`${LOG}   Extracting office doc: ${fileName}`);
    const result = await extractFile(filePath);
    const elapsed = Math.round(performance.now() - started);

    const content = result.content ?? "";

    let docType = "office_document";
    if (ext === "xlsx" || ext === "xls" || ext === "ods") {
      docType = "spreadsheet";
    } else if (ext === "pptx" || ext === "ppt" || ext === "odp") {
      docType = "presentation";
    }

    const rawExtraction = {
      text_content: content,
      table_count: result.tables?.length ?? 0,
      tables: result.tables?.map((t) => t.markdown) ?? [],
      metadata: result.metadata ?? {},
      extractor: "kreuzberg",
      char_count: content.length,
    };

    const row = (await insertFileRecord.get(
      docType,
      filePath,
      fileName,
      content.slice(0, 10_000),
      JSON.stringify(rawExtraction),
      "kreuzberg",
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    console.log(
      `${LOG}   Stored ${docType} #${row?.id}: ${content.length} chars in ${elapsed}ms`
    );

    return {
      documentId: row?.id ?? null,
      fileName,
      documentType: docType,
      pageCount: 0,
      processingTimeMs: elapsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed office doc ${fileName}: ${msg}`);
    await insertFileError.run(
      filePath,
      fileName,
      msg.slice(0, 1000),
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    );
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
// ZIP Archive Processing — extract and process contents
// ============================================================================

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (
      !(entry.name.startsWith(".") || entry.name.startsWith("__MACOSX"))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Process a ZIP archive by extracting contents and routing each file.
 * Accepts `processFiles` callback to avoid circular import with main entry point.
 */
export async function processZipFile(
  zipPath: string,
  emailMeta: EmailMeta,
  payload: ContractsEmailIntakePayloadType,
  processFiles: (
    p: ContractsEmailIntakePayloadType
  ) => Promise<ParseIntakeResultType[]>
): Promise<ParseIntakeResultType[]> {
  const fileName = zipPath.split("/").pop() ?? zipPath;
  const extractDir = join(
    "/app/data/backfill",
    `zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    await mkdir(extractDir, { recursive: true });

    const proc = Bun.spawn(["unzip", "-o", "-q", zipPath, "-d", extractDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`unzip exit ${exitCode}: ${stderr.trim().slice(0, 500)}`);
    }

    const files = await listFilesRecursive(extractDir);

    if (files.length === 0) {
      console.log(`${LOG}   ZIP empty: ${fileName}`);
      return [];
    }

    console.log(
      `${LOG}   ZIP "${fileName}" → ${files.length} file(s): ${files.map((f) => f.split("/").pop()).join(", ")}`
    );

    const results = await processFiles({
      ...payload,
      attachmentPaths: files,
    });

    return results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed ZIP ${fileName}: ${msg}`);
    await insertFileError.run(
      zipPath,
      fileName,
      msg.slice(0, 1000),
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    );
    return [
      {
        documentId: null,
        fileName,
        documentType: "error",
        pageCount: 0,
        processingTimeMs: 0,
        error: msg,
      },
    ];
  } finally {
    await rm(extractDir, { recursive: true, force: true }).catch(
      (cleanupError) => {
        console.warn(
          `${LOG}   ZIP cleanup failed for ${fileName}:`,
          cleanupError
        );
      }
    );
  }
}
