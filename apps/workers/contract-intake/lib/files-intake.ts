/**
 * Files Intake — File-Type Router
 *
 * Routes files by type to the appropriate processing pipeline:
 *   - PDF → existing parse pipeline (pdfplumber + GLM OCR + Kimi K2.5)
 *   - Images → GLM OCR via pdf-analysis ocr command
 *   - Office → Kreuzberg native extraction (docx, xlsx, xls, doc, pptx, ppt)
 *   - Text → direct read + LLM classification
 *   - Other → metadata-only storage
 *
 * This module replaces processContractsEmailIntake as the main entry point
 * for the files_intake job type.
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { extractFile } from "@kreuzberg/node";
import { db } from "@lib/db/hub";
import type {
  ContractsEmailIntakePayload as ContractsEmailIntakePayloadType,
  ParseIntakeResult as ParseIntakeResultType,
} from "./parse-intake";
import { processContractsEmailIntake } from "./parse-intake";

// Re-export types so worker.ts can import from here
export type {
  ContractsEmailIntakePayload,
  ParseIntakeResult,
} from "./parse-intake";

// ============================================================================
// Config
// ============================================================================

const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../../../apps/cli-tools/pdf-analysis-cli"
);

const LOG = "[files-intake]";

// ============================================================================
// File Category Detection
// ============================================================================

const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "tif",
  "webp",
  "heic",
]);
const TEXT_EXTS = new Set(["txt", "csv", "md"]);
const PDF_EXTS = new Set(["pdf"]);
const OFFICE_EXTS = new Set([
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "odt",
  "ods",
  "odp",
  "rtf",
]);
const ZIP_EXTS = new Set(["zip"]);

type FileCategory = "pdf" | "image" | "text" | "office" | "zip" | "other";

function getFileCategory(filePath: string): FileCategory {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (PDF_EXTS.has(ext)) {
    return "pdf";
  }
  if (IMAGE_EXTS.has(ext)) {
    return "image";
  }
  if (OFFICE_EXTS.has(ext)) {
    return "office";
  }
  if (TEXT_EXTS.has(ext)) {
    return "text";
  }
  if (ZIP_EXTS.has(ext)) {
    return "zip";
  }
  return "other";
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

const insertUnsupported = db.prepare(`
  INSERT INTO documents (
    document_type, file_path, file_name,
    extraction_status,
    original_from, original_subject, forwarder_email
  ) VALUES ('unsupported', $1, $2, 'unsupported', $3, $4, $5)
  RETURNING id
`);

// ============================================================================
// Fast PDF Extraction — Kreuzberg (text-based PDFs only)
// ============================================================================

const MIN_KREUZBERG_TEXT_LENGTH = 100; // below this, PDF is likely scanned

async function processPdfFast(
  pdfPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType | null> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;
  const started = performance.now();

  try {
    const result = await extractFile(pdfPath);
    const content = result.content ?? "";

    // If Kreuzberg got meaningful text, this is a text-based PDF — done
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

    // Not enough text — likely a scanned PDF, return null to fall through
    return null;
  } catch {
    // Kreuzberg failed — fall through to heavy pipeline
    return null;
  }
}

// ============================================================================
// Image Processing — OCR via pdf-analysis
// ============================================================================

interface EmailMeta {
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

async function runOcr(imagePath: string): Promise<OcrOutput> {
  const proc = Bun.spawn(
    ["uv", "run", "pdf-analysis", "ocr", imagePath, "--format", "json"],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 120_000); // 2min for OCR
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

async function processImage(
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

async function processTextFile(
  textPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = textPath.split("/").pop() ?? textPath;
  const started = performance.now();

  try {
    const content = await Bun.file(textPath).text();
    const elapsed = Math.round(performance.now() - started);

    // Determine if this is email body text or a standalone file
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
      content.slice(0, 10_000), // summary = first 10k chars
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

async function processOfficeDocument(
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

    // Map extension to a document type hint
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

async function processZipFile(
  zipPath: string,
  emailMeta: EmailMeta,
  payload: ContractsEmailIntakePayloadType
): Promise<ParseIntakeResultType[]> {
  const fileName = zipPath.split("/").pop() ?? zipPath;
  const extractDir = join(
    "/app/data/backfill",
    `zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    await mkdir(extractDir, { recursive: true });

    // Extract ZIP
    const proc = Bun.spawn(["unzip", "-o", "-q", zipPath, "-d", extractDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`unzip exit ${exitCode}: ${stderr.trim().slice(0, 500)}`);
    }

    // List extracted files (recursively, skip macOS metadata)
    const files = await listFilesRecursive(extractDir);

    if (files.length === 0) {
      console.log(`${LOG}   ZIP empty: ${fileName}`);
      return [];
    }

    console.log(
      `${LOG}   ZIP "${fileName}" → ${files.length} file(s): ${files.map((f) => f.split("/").pop()).join(", ")}`
    );

    // Process each extracted file through the normal pipeline
    const results = await processFilesIntake({
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

// ============================================================================
// Unsupported File — store metadata only
// ============================================================================

async function processUnsupported(
  filePath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResultType> {
  const fileName = filePath.split("/").pop() ?? filePath;

  const row = (await insertUnsupported.get(
    filePath,
    fileName,
    emailMeta.originalFrom || null,
    emailMeta.originalSubject || null,
    emailMeta.forwarderEmail || null
  )) as { id: number } | null;

  console.log(`${LOG}   Stored unsupported file #${row?.id}: ${fileName}`);

  return {
    documentId: row?.id ?? null,
    fileName,
    documentType: "unsupported",
    pageCount: 0,
    processingTimeMs: 0,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function processFilesIntake(
  payload: ContractsEmailIntakePayloadType
): Promise<ParseIntakeResultType[]> {
  const { attachmentPaths, originalSubject, originalFrom, forwarderEmail } =
    payload;

  // Categorize files
  const pdfs: string[] = [];
  const images: string[] = [];
  const office: string[] = [];
  const texts: string[] = [];
  const zips: string[] = [];
  const others: string[] = [];

  for (const path of attachmentPaths) {
    switch (getFileCategory(path)) {
      case "pdf":
        pdfs.push(path);
        break;
      case "image":
        images.push(path);
        break;
      case "office":
        office.push(path);
        break;
      case "text":
        texts.push(path);
        break;
      case "zip":
        zips.push(path);
        break;
      default:
        others.push(path);
    }
  }

  console.log(
    `${LOG} Processing ${attachmentPaths.length} file(s) from "${originalSubject}" (${originalFrom}): ${pdfs.length} PDF, ${images.length} image, ${office.length} office, ${texts.length} text, ${zips.length} zip, ${others.length} other`
  );

  const emailMeta: EmailMeta = {
    originalFrom: originalFrom ?? "",
    originalSubject: originalSubject ?? "",
    forwarderEmail: forwarderEmail ?? "",
  };

  const results: ParseIntakeResultType[] = [];

  // Process PDFs: try fast Kreuzberg extraction first, fall back to OCR pipeline
  const slowPdfs: string[] = [];
  for (const pdfPath of pdfs) {
    const fastResult = await processPdfFast(pdfPath, emailMeta);
    if (fastResult) {
      results.push(fastResult);
    } else {
      slowPdfs.push(pdfPath); // scanned PDF — needs OCR
    }
  }
  if (slowPdfs.length > 0) {
    console.log(
      `${LOG}   ${slowPdfs.length} scanned PDF(s) falling back to OCR pipeline`
    );
    const pdfResults = await processContractsEmailIntake({
      ...payload,
      attachmentPaths: slowPdfs,
    });
    results.push(...pdfResults);
  }

  // Process images via OCR
  for (const imagePath of images) {
    results.push(await processImage(imagePath, emailMeta));
  }

  // Process office documents via Kreuzberg
  for (const officePath of office) {
    results.push(await processOfficeDocument(officePath, emailMeta));
  }

  // Extract and process ZIP archives
  for (const zipPath of zips) {
    const zipResults = await processZipFile(zipPath, emailMeta, payload);
    results.push(...zipResults);
  }

  // Process text files
  for (const textPath of texts) {
    results.push(await processTextFile(textPath, emailMeta));
  }

  // Store unsupported files
  for (const otherPath of others) {
    results.push(await processUnsupported(otherPath, emailMeta));
  }

  const succeeded = results.filter((r) => !r.error).length;
  console.log(
    `${LOG} Done: ${succeeded}/${results.length} processed successfully`
  );

  return results;
}
