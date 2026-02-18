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
 *
 * Two-stage LLM pipeline:
 *   Stage 1: classifyDocument() — local LLM (granite4) for fast, cheap classification
 *   Stage 2: runEstimateExtraction/runContractExtraction/runPermitExtraction
 *            — Gemini 2.5 flash-lite for structured extraction, writes to documents.raw_extraction
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  runGeminiJsonPrompt,
  runLocalLlmJsonPrompt,
} from "@background-jobs/lib/llm";
import { extractFile } from "@kreuzberg/node";
import { db } from "@lib/db/hub";
import {
  type ContractsEmailIntakePayload,
  type EmailMeta,
  extractWithKreuzberg,
  insertFileError,
  insertFileRecord,
  LOG,
  MIN_KREUZBERG_TEXT_LENGTH,
  type ParseIntakeResult,
} from "./files-intake-db";

export type {
  ContractsEmailIntakePayload,
  EmailMeta,
  KreuzbergExtraction,
  ParseIntakeResult,
} from "./files-intake-db";

// ============================================================================
// Stage 1: Document Classification (local LLM)
// ============================================================================

const VALID_DOCUMENT_TYPES = new Set([
  "estimate",
  "contract",
  "noi",
  "permit",
  "plan",
  "invoice",
  "insurance",
  "lien_waiver",
  "change_order",
  "submittal",
  "rfi",
  "meeting_minutes",
  "safety",
  "photo",
  "logo",
  "signature",
  "unknown",
]);

/**
 * Classify a document using local LLM. Falls back to "unknown" on any failure.
 * The columnHint (from Monday board column) biases toward the expected type.
 */
export async function classifyDocument(
  text: string,
  fileName: string,
  columnHint?: string
): Promise<{ document_type: string; confidence: number }> {
  const textSnippet = text.slice(0, 4000);
  const hintLine = columnHint
    ? `\nThe source system suggests this is likely a "${columnHint}" document. Use this as a strong hint but override if the content clearly indicates otherwise.`
    : "";

  const prompt = `Classify this construction industry document. Respond with JSON only.

File name: "${fileName}"${hintLine}

Document types (pick one):
- estimate: bid estimate, quote, proposal with line items and pricing
- contract: subcontract, agreement, purchase order, work order
- noi: notice of intent, dust permit application, SWPPP notice
- permit: dust permit, building permit, grading permit (issued document)
- plan: construction plans, drawings, blueprints, site plans
- invoice: invoice, billing, payment request, AIA pay application
- insurance: certificate of insurance, COI, bond
- lien_waiver: lien waiver, release of lien
- change_order: change order, modification, amendment
- submittal: product submittal, shop drawing, material data
- rfi: request for information
- meeting_minutes: meeting minutes, meeting notes
- safety: safety plan, SWPPP narrative, BMP plan, safety data sheet
- photo: site photo, inspection photo, progress photo
- logo: company logo, letterhead image
- signature: signature block, signed page
- unknown: cannot determine

First 4000 chars of extracted text:
"""
${textSnippet}
"""

Respond with: {"document_type": "...", "confidence": 0.0-1.0}`;

  try {
    const result = await runLocalLlmJsonPrompt(prompt);
    if (result?.document_type && typeof result.document_type === "string") {
      const docType = result.document_type.toLowerCase();
      if (VALID_DOCUMENT_TYPES.has(docType)) {
        return {
          document_type: docType,
          confidence:
            typeof result.confidence === "number" ? result.confidence : 0.5,
        };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG}   classify failed (fallback to unknown): ${msg}`);
  }

  return { document_type: "unknown", confidence: 0 };
}

// ============================================================================
// Stage 2: Structured Extraction (Gemini 2.5 flash-lite)
// ============================================================================

const GEMINI_MODEL = "gemini-2.5-flash-lite";

const updateRawExtraction = db.prepare(`
  UPDATE documents
  SET raw_extraction = $2::jsonb,
      extraction_status = 'success',
      updated_at = now()
  WHERE id = $1
`);

const updateEstimateFromExtraction = db.prepare(`
  UPDATE estimates
  SET extracted_grand_total = $2,
      extracted_job_name = $3,
      extraction_status = 'success',
      updated_at = now()
  WHERE id = $1
`);

export async function runEstimateExtraction(
  documentId: number,
  estimateId: number,
  text: string
): Promise<void> {
  const textSnippet = text.slice(0, 30_000);
  const prompt = `Extract structured data from this construction estimate/bid document. Respond with JSON only.

Text:
"""
${textSnippet}
"""

Extract:
{
  "job_name": "project/job name",
  "contractor": "general contractor or client name",
  "address": "job site address if found",
  "estimator": "person who prepared the estimate",
  "estimate_number": "estimate or quote number",
  "date": "estimate date (YYYY-MM-DD if possible)",
  "line_items": [
    {"item": "item code/name", "description": "description", "qty": 0, "unit": "unit", "unit_price": 0, "total": 0, "section": "section name or null"}
  ],
  "section_subtotals": [{"section": "name", "subtotal": 0}],
  "tax": {"rate": 0, "amount": 0},
  "grand_total": 0,
  "notes": "any special terms, conditions, or notes"
}`;

  try {
    const result = await runGeminiJsonPrompt(prompt, { model: GEMINI_MODEL });
    if (!result) {
      console.warn(
        `${LOG}   Stage 2 estimate extraction returned null for doc #${documentId}`
      );
      return;
    }

    await updateRawExtraction.run(documentId, JSON.stringify(result));

    const grandTotal =
      typeof result.grand_total === "number" ? result.grand_total : null;
    const jobName =
      typeof result.job_name === "string" ? result.job_name : null;
    if (grandTotal !== null || jobName) {
      await updateEstimateFromExtraction.run(estimateId, grandTotal, jobName);
    }

    console.log(
      `${LOG}   Stage 2 estimate OK: doc #${documentId}, estimate #${estimateId}, total=${grandTotal}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${LOG}   Stage 2 estimate failed doc #${documentId}: ${msg}`
    );
  }
}

export async function runContractExtraction(
  documentId: number,
  text: string
): Promise<void> {
  const textSnippet = text.slice(0, 30_000);
  const prompt = `Extract structured data from this construction contract/agreement document. Respond with JSON only.

Text:
"""
${textSnippet}
"""

Extract:
{
  "parties": {"owner": "owner/client name", "contractor": "contractor name", "subcontractor": "subcontractor name if applicable"},
  "contract_number": "contract or PO number",
  "scope": "brief description of work scope",
  "value": 0,
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "project_name": "project name",
  "project_address": "project address",
  "retention_pct": 0,
  "insurance_required": true,
  "bond_required": false,
  "key_terms": ["notable terms or conditions"]
}`;

  try {
    const result = await runGeminiJsonPrompt(prompt, { model: GEMINI_MODEL });
    if (!result) {
      console.warn(
        `${LOG}   Stage 2 contract extraction returned null for doc #${documentId}`
      );
      return;
    }

    await updateRawExtraction.run(documentId, JSON.stringify(result));
    console.log(`${LOG}   Stage 2 contract OK: doc #${documentId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${LOG}   Stage 2 contract failed doc #${documentId}: ${msg}`
    );
  }
}

export async function runPermitExtraction(
  documentId: number,
  text: string
): Promise<void> {
  const textSnippet = text.slice(0, 30_000);
  const prompt = `Extract structured data from this construction permit or Notice of Intent (NOI) document. Respond with JSON only.

Text:
"""
${textSnippet}
"""

Extract:
{
  "permit_number": "permit number or LTF number",
  "permit_type": "dust permit, building permit, grading permit, NOI, etc.",
  "site_name": "project or site name",
  "site_address": "site address",
  "acreage": 0,
  "applicant": {"name": "applicant name", "company": "company", "phone": "phone", "email": "email"},
  "operator": {"name": "operator name", "company": "company"},
  "swppp_contact": {"name": "SWPPP contact name", "phone": "phone", "email": "email"},
  "issue_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "status": "active, expired, pending, etc.",
  "conditions": ["special conditions or notes"]
}`;

  try {
    const result = await runGeminiJsonPrompt(prompt, { model: GEMINI_MODEL });
    if (!result) {
      console.warn(
        `${LOG}   Stage 2 permit extraction returned null for doc #${documentId}`
      );
      return;
    }

    await updateRawExtraction.run(documentId, JSON.stringify(result));
    console.log(`${LOG}   Stage 2 permit OK: doc #${documentId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Stage 2 permit failed doc #${documentId}: ${msg}`);
  }
}

// ============================================================================
// PDF Processing — Kreuzberg
// ============================================================================

export async function processPdf(
  pdfPath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResult> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;
  const started = performance.now();

  try {
    const extracted = await extractWithKreuzberg(pdfPath, {
      minTextLength: MIN_KREUZBERG_TEXT_LENGTH,
    });

    const finalContent = extracted.content;
    const finalExtractor = extracted.extractor;

    const elapsed = Math.round(performance.now() - started);

    // Stage 1: Classify via local LLM
    const classified = await classifyDocument(finalContent, fileName);
    const documentType =
      classified.document_type !== "unknown"
        ? classified.document_type
        : "pdf_document";
    console.log(
      `${LOG}   Classified "${fileName}" as ${documentType} (${(classified.confidence * 100).toFixed(0)}%)`
    );

    const rawExtraction = {
      text_content: finalContent,
      table_count: extracted.tables.length,
      tables: extracted.tables,
      metadata: extracted.metadata,
      extractor: finalExtractor,
      char_count: finalContent.length,
      ocr_attempted: extracted.ocrAttempted,
      ocr_error: extracted.ocrError ?? null,
    };

    const row = (await insertFileRecord.get(
      documentType,
      pdfPath,
      fileName,
      finalContent.slice(0, 10_000),
      JSON.stringify(rawExtraction),
      finalExtractor,
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    console.log(
      `${LOG}   Stored PDF #${row?.id} [${documentType}]: ${finalContent.length} chars in ${elapsed}ms (${finalExtractor})`
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
): Promise<ParseIntakeResult> {
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
): Promise<ParseIntakeResult> {
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
): Promise<ParseIntakeResult> {
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
  payload: ContractsEmailIntakePayload,
  processFiles: (p: ContractsEmailIntakePayload) => Promise<ParseIntakeResult[]>
): Promise<ParseIntakeResult[]> {
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
