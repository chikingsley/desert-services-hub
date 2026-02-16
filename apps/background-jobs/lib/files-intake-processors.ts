/**
 * Files Intake — Per-Type Processors
 *
 * Individual file processors extracted from files-intake.ts:
 *   - PDF (fast Kreuzberg extraction for text-based PDFs)
 *   - Images (OCR via pdf-analysis)
 *   - Office documents (Kreuzberg native extraction)
 *   - Text files (direct read)
 *   - ZIP archives (extract + recursive processing)
 *   - Unsupported files (metadata-only storage)
 */
import { existsSync } from "node:fs";
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

const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../../packages/documents/pdf-analysis-cli"
);

const LOG = "[files-intake]";

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

export interface EmailMeta {
  originalFrom: string;
  originalSubject: string;
  forwarderEmail: string;
}

interface OcrOutput {
  text: string;
  pages: number[];
  processing_time_ms: number;
  model: string;
  provider: string;
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
// Fast PDF Extraction — Kreuzberg (text-based PDFs only)
// ============================================================================

const MIN_KREUZBERG_TEXT_LENGTH = 100;

export async function processPdfFast(
  pdfPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType | null> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;
  const started = performance.now();

  try {
    const result = await extractFile(pdfPath);
    const content = result.content ?? "";

    if (content.length >= MIN_KREUZBERG_TEXT_LENGTH) {
      const elapsed = Math.round(performance.now() - started);

      const rawExtraction = {
        text_content: content,
        table_count: result.tables?.length ?? 0,
        tables: result.tables?.map((t) => t.markdown) ?? [],
        metadata: result.metadata ?? {},
        extractor: "kreuzberg",
        char_count: content.length,
      };

      const row = (await insertFileRecord.get(
        "pdf_document",
        pdfPath,
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
        `${LOG}   Fast PDF #${row?.id}: ${content.length} chars in ${elapsed}ms (kreuzberg)`
      );

      return {
        documentId: row?.id ?? null,
        fileName,
        documentType: "pdf_document",
        pageCount: 0,
        processingTimeMs: elapsed,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Image Processing — OCR via pdf-analysis
// ============================================================================

async function runOcr(imagePath: string): Promise<OcrOutput> {
  const uvBin = resolveUvBin();
  const proc = Bun.spawn(
    [uvBin, "run", "pdf-analysis", "ocr", imagePath, "--format", "json"],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 120_000);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      `pdf-analysis ocr exit ${exitCode}: ${stderr.trim().slice(0, 500)}`
    );
  }

  return JSON.parse(stdout) as OcrOutput;
}

export async function processImage(
  imagePath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = imagePath.split("/").pop() ?? imagePath;
  const started = performance.now();

  try {
    console.log(`${LOG}   OCR image: ${fileName}`);
    const ocrResult = await runOcr(imagePath);
    const elapsed = Math.round(performance.now() - started);

    const rawExtraction = {
      ocr_text: ocrResult.text,
      ocr_model: ocrResult.model,
      ocr_provider: ocrResult.provider,
    };

    const row = (await insertFileRecord.get(
      "image_ocr",
      imagePath,
      fileName,
      ocrResult.text,
      JSON.stringify(rawExtraction),
      ocrResult.model,
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    console.log(
      `${LOG}   Stored image #${row?.id}: ${ocrResult.text.length} chars OCR'd in ${elapsed}ms`
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
