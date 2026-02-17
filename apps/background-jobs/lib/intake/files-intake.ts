/**
 * Files Intake — File-Type Router
 *
 * Routes files by type to the appropriate processing pipeline:
 *   - PDF → Kreuzberg extraction (optional Kreuzberg OCR if configured)
 *   - Images → Kreuzberg extraction (optional Kreuzberg OCR if configured)
 *   - Office → Kreuzberg native extraction (docx, xlsx, xls, doc, pptx, ppt)
 *   - Text → direct read + LLM classification
 *   - Other → metadata-only storage
 *
 * This module replaces processContractsEmailIntake as the main entry point
 * for the files_intake job type.
 */

import type { EmailMeta } from "./files-intake-processors";
import {
  processImage,
  processOfficeDocument,
  processPdf,
  processTextFile,
  processZipFile,
} from "./files-intake-processors";
import type {
  ContractsEmailIntakePayload as ContractsEmailIntakePayloadType,
  ParseIntakeResult as ParseIntakeResultType,
} from "./parse-intake";

// Re-export types so worker.ts can import from here
export type {
  ContractsEmailIntakePayload,
  ParseIntakeResult,
} from "./parse-intake";

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
// Unsupported File — store metadata only
// ============================================================================

import { db } from "@lib/db/hub";

const insertUnsupported = db.prepare(`
  INSERT INTO documents (
    document_type, file_path, file_name,
    extraction_status,
    original_from, original_subject, forwarder_email
  ) VALUES ('unsupported', $1, $2, 'unsupported', $3, $4, $5)
  RETURNING id
`);

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

const LOG = "[files-intake]";

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

  // Process PDFs via Kreuzberg
  for (const pdfPath of pdfs) {
    results.push(await processPdf(pdfPath, emailMeta));
  }

  // Process images via Kreuzberg
  for (const imagePath of images) {
    results.push(await processImage(imagePath, emailMeta));
  }

  // Process office documents via Kreuzberg
  for (const officePath of office) {
    results.push(await processOfficeDocument(officePath, emailMeta));
  }

  // Extract and process ZIP archives
  for (const zipPath of zips) {
    const zipResults = await processZipFile(
      zipPath,
      emailMeta,
      payload,
      processFilesIntake
    );
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
