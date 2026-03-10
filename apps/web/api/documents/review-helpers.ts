// biome-ignore lint/nursery/noExcessiveLinesPerFile: shared query/preview/rerun helpers stay together for the review workspace
import { existsSync } from "node:fs";
import { db } from "@lib/db/client";
import {
  buildCleanMarkdownArtifact,
  buildExtractionMetadata,
  mergeStructuredOutput,
  parseExtractionArtifacts,
} from "@documents-intake/document-review-artifacts";
import { createGraphClient } from "@lib/graph/mail";
import {
  extractEstimateMultipart,
  extractNoiMultipart,
  extractTextMultipart,
  fullExtractMultipart,
  nativeExtractMultipart,
  ocrExtractMultipart,
} from "@documents-intake/pdf-analysis";
import {
  createSharePointClientFromEnv,
  parseDocumentLibraryPathFromSharePointUrl,
} from "@sharepoint/intake-upload";
import {
  buildTextOnlyBaseResult,
  type ReviewBaseExtractionResult,
} from "@/api/documents/review-rerun";

export type AnalysisProfile = "auto" | "estimate" | "noi";
export type DocumentSource = "email_attachment" | "monday_asset" | "parsed";
export type ExtractionMode = "full" | "native" | "ocr";
export type PreviewKind = "image" | "none" | "other" | "pdf";

export interface DocumentBinaryMeta {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface ReviewDetailResponseItem
  extends Omit<ReviewDetailRow, "raw_extraction_json"> {
  can_preview: boolean;
  can_rerun: boolean;
  download_url: string | null;
  extraction_metadata_json: string | null;
  extraction_profile: string;
  preview_kind: PreviewKind;
  preview_url: string | null;
  structured_output_json: string | null;
  structured_output_key: string | null;
  structured_output_label: string;
}

export interface ReviewDetailRow {
  clean_markdown: string | null;
  content_type: string | null;
  created_at: string;
  document_type: string | null;
  email_id: number | null;
  email_subject: string | null;
  extracted_at: string | null;
  extracted_text: string | null;
  extraction_attempts: number | null;
  extraction_error: string | null;
  extraction_metadata_json: string | null;
  extraction_method: string | null;
  extraction_status: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  forwarder_email: string | null;
  from_email: string | null;
  id: number;
  local_path: string | null;
  mailbox_email: string | null;
  message_id: string | null;
  model: string | null;
  original_from: string | null;
  original_subject: string | null;
  outlook_attachment_id: string | null;
  page_count: number | null;
  processing_time_ms: number | null;
  project_id: number | null;
  project_name: string | null;
  qa_notes: string | null;
  qa_status: string | null;
  raw_extraction_json: string | null;
  reviewed_at: string | null;
  sharepoint_path: string | null;
  sharepoint_url: string | null;
  source: string | null;
  storage_path: string | null;
  summary: string | null;
  updated_at: string;
}

export interface ReviewListRow {
  clean_markdown_length: number;
  created_at: string;
  document_type: string | null;
  email_id: number | null;
  email_subject: string | null;
  extracted_at: string | null;
  extracted_text_length: number;
  extraction_error: string | null;
  extraction_status: string | null;
  file_name: string | null;
  from_email: string | null;
  has_clean_markdown: boolean;
  has_extracted_text: boolean;
  has_raw_extraction: boolean;
  id: number;
  model: string | null;
  processing_time_ms: number | null;
  project_id: number | null;
  project_name: string | null;
  qa_status: string | null;
  source: string | null;
  summary: string | null;
  updated_at: string;
}

export interface ReviewRerunRequest {
  analysisProfile?: AnalysisProfile;
  extractionMode?: ExtractionMode;
  ids?: number[];
}

export interface ReviewSaveRequest {
  qaNotes?: string | null;
  qaStatus?: "approved" | "needs_work" | "unreviewed";
}

export interface ReviewRerunResult {
  documentType: string | null;
  error?: string;
  id: number;
  status: "failed" | "success";
  summary: string | null;
}

export interface ReviewStatsRow {
  attachments_failed: number;
  attachments_pending: number;
  parsed_success: number;
  total_documents: number;
  with_clean_markdown: number;
  with_extracted_text: number;
  with_raw_extraction: number;
}

export function parsePositiveInt(
  raw: string | null,
  fallback: number,
  max: number
) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function parseOptionalQuery(raw: string | null): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function parseSource(raw: string | null): DocumentSource | null {
  if (
    raw === "parsed" ||
    raw === "email_attachment" ||
    raw === "monday_asset"
  ) {
    return raw;
  }
  return null;
}

export function buildListQuery(url: URL): {
  params: unknown[];
  sql: string;
} {
  const params: unknown[] = [];
  const where: string[] = [];
  const status = parseOptionalQuery(url.searchParams.get("status"));
  const source = parseSource(url.searchParams.get("source"));
  const docType = parseOptionalQuery(url.searchParams.get("docType"));
  const reviewStatus = parseOptionalQuery(url.searchParams.get("reviewStatus"));
  const query = parseOptionalQuery(url.searchParams.get("q"));
  const limit = parsePositiveInt(url.searchParams.get("limit"), 100, 200);

  if (status && status !== "all") {
    params.push(status);
    where.push(`d.extraction_status = $${params.length}`);
  }

  if (source) {
    params.push(source);
    where.push(`d.source = $${params.length}`);
  }

  if (docType && docType !== "all") {
    params.push(docType);
    where.push(`d.document_type = $${params.length}`);
  }

  if (
    reviewStatus &&
    reviewStatus !== "all" &&
    (reviewStatus === "approved" ||
      reviewStatus === "needs_work" ||
      reviewStatus === "unreviewed")
  ) {
    params.push(reviewStatus);
    where.push(`COALESCE(d.qa_status, 'unreviewed') = $${params.length}`);
  }

  if (query) {
    params.push(`%${query}%`);
    const idx = params.length;
    where.push(`(
      d.file_name ILIKE $${idx}
      OR COALESCE(d.summary, '') ILIKE $${idx}
      OR COALESCE(d.document_type, '') ILIKE $${idx}
      OR COALESCE(d.model, '') ILIKE $${idx}
      OR COALESCE(d.extraction_error, '') ILIKE $${idx}
      OR COALESCE(e.subject, '') ILIKE $${idx}
      OR COALESCE(e.from_email, '') ILIKE $${idx}
      OR COALESCE(p.name, '') ILIKE $${idx}
    )`);
  }

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return {
    params,
    sql: `
      SELECT
        d.id,
        d.source,
        d.file_name,
        d.document_type,
        d.summary,
        d.model,
        d.processing_time_ms,
        d.extraction_status,
        d.extraction_error,
        COALESCE(d.qa_status, 'unreviewed') AS qa_status,
        d.reviewed_at,
        d.extracted_at,
        d.created_at,
        d.updated_at,
        d.project_id,
        d.email_id,
        p.name AS project_name,
        e.subject AS email_subject,
        e.from_email,
        CASE
          WHEN d.raw_extraction IS NOT NULL AND d.raw_extraction::text <> '{}' THEN TRUE
          ELSE FALSE
        END AS has_raw_extraction,
        CASE
          WHEN d.extracted_text IS NOT NULL AND length(trim(d.extracted_text)) > 0 THEN TRUE
          ELSE FALSE
        END AS has_extracted_text,
        CASE
          WHEN d.clean_markdown IS NOT NULL AND length(trim(d.clean_markdown)) > 0 THEN TRUE
          ELSE FALSE
        END AS has_clean_markdown,
        COALESCE(length(d.extracted_text), 0)::int AS extracted_text_length,
        COALESCE(length(d.clean_markdown), 0)::int AS clean_markdown_length
      FROM documents d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN emails e ON e.id = d.email_id
      ${whereClause}
      ORDER BY COALESCE(d.extracted_at, d.updated_at, d.created_at) DESC, d.id DESC
      LIMIT ${limitPlaceholder}
    `,
  };
}

export function inferContentType(
  contentType: string | null,
  filename: string | null
): string {
  const normalized = contentType?.trim();
  if (normalized) {
    return normalized;
  }

  const lower = filename?.toLowerCase() ?? "";
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "application/octet-stream";
}

export function inferPreviewKind(
  contentType: string | null,
  filename: string | null
): PreviewKind {
  const normalized = inferContentType(contentType, filename).toLowerCase();
  if (normalized === "application/pdf") {
    return "pdf";
  }
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized === "application/octet-stream") {
    return "none";
  }
  return "other";
}

export function safeFilename(name: string | null): string {
  return (name ?? "document").replace(/[\r\n\t]/g, " ").trim() || "document";
}

function normalizePreviewPath(path: string | null): string | null {
  const trimmed = path?.trim();
  if (!trimmed?.startsWith("/app/data/")) {
    return null;
  }
  return trimmed;
}

export function resolveLocalPath(row: ReviewDetailRow): string | null {
  const candidates = [
    normalizePreviewPath(row.local_path),
    normalizePreviewPath(row.storage_path),
    normalizePreviewPath(row.file_path),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveSharePointPath(row: ReviewDetailRow): string | null {
  return (
    row.sharepoint_path?.trim() ||
    parseDocumentLibraryPathFromSharePointUrl(row.sharepoint_url)
  );
}

export function buildPreviewUrl(row: ReviewDetailRow): {
  canPreview: boolean;
  downloadUrl: string | null;
  previewKind: PreviewKind;
  previewUrl: string | null;
} {
  const previewKind = inferPreviewKind(row.content_type, row.file_name);

  if (resolveSharePointPath(row) || resolveLocalPath(row)) {
    const base = `/api/documents/review/${row.id}/file`;
    return {
      canPreview: true,
      downloadUrl: base,
      previewKind,
      previewUrl: `${base}?inline=1`,
    };
  }

  if (row.email_id && row.outlook_attachment_id) {
    const ref = encodeURIComponent(`graph:${row.outlook_attachment_id}`);
    const base = `/api/emails/${row.email_id}/attachments/${ref}/download`;
    return {
      canPreview: true,
      downloadUrl: base,
      previewKind,
      previewUrl: `${base}?inline=1`,
    };
  }

  return {
    canPreview: false,
    downloadUrl: null,
    previewKind: "none",
    previewUrl: null,
  };
}

export async function getReviewDetailRow(
  documentId: number
): Promise<ReviewDetailRow | null> {
  return await db.transaction(async () => {
    return await db
      .query<ReviewDetailRow, [number]>(
        `SELECT
           d.id,
           d.source,
           d.file_name,
           d.file_path,
           d.local_path,
           d.storage_path,
           d.outlook_attachment_id,
           d.document_type,
           d.summary,
           d.model,
           d.processing_time_ms,
           d.extraction_status,
           d.extraction_error,
           d.extracted_text,
           d.clean_markdown,
           d.extraction_method,
           d.page_count,
           d.extraction_attempts,
           d.extracted_at,
           d.created_at,
           d.updated_at,
           d.project_id,
           d.email_id,
           d.content_type,
           d.file_size,
           d.original_from,
           d.original_subject,
           d.forwarder_email,
           d.extraction_metadata::text AS extraction_metadata_json,
           d.raw_extraction::text AS raw_extraction_json,
           d.qa_notes,
           COALESCE(d.qa_status, 'unreviewed') AS qa_status,
           d.reviewed_at,
           d.sharepoint_path,
           d.sharepoint_url,
           p.name AS project_name,
           e.subject AS email_subject,
           e.from_email,
           e.message_id,
           m.email AS mailbox_email
         FROM documents d
         LEFT JOIN projects p ON p.id = d.project_id
         LEFT JOIN emails e ON e.id = d.email_id
         LEFT JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE d.id = $1`
      )
      .get(documentId);
  });
}

export function mapDetailRowToResponse(
  row: ReviewDetailRow
): ReviewDetailResponseItem {
  const artifacts = parseExtractionArtifacts({
    cleanMarkdown: row.clean_markdown,
    extractionMetadata: row.extraction_metadata_json,
    pageCount: row.page_count,
    rawExtraction: row.raw_extraction_json,
  });
  const preview = buildPreviewUrl(row);

  return {
    ...row,
    can_preview: preview.canPreview,
    can_rerun: row.source === "parsed",
    download_url: preview.downloadUrl,
    extraction_metadata_json: JSON.stringify(artifacts.metadata, null, 2),
    extraction_profile: artifacts.extractionProfile,
    preview_kind: preview.previewKind,
    preview_url: preview.previewUrl,
    structured_output_json: artifacts.structuredOutput
      ? JSON.stringify(artifacts.structuredOutput, null, 2)
      : null,
    structured_output_key: artifacts.structuredOutputKey,
    structured_output_label: artifacts.structuredOutputLabel,
  };
}

export async function readDocumentBuffer(
  row: ReviewDetailRow
): Promise<DocumentBinaryMeta> {
  const filename = safeFilename(row.file_name);
  const contentType = inferContentType(row.content_type, row.file_name);
  const sharePointPath = resolveSharePointPath(row);

  if (sharePointPath) {
    const sharePointClient = createSharePointClientFromEnv();
    if (sharePointClient) {
      try {
        const buffer = await sharePointClient.download(sharePointPath);
        return { buffer, contentType, filename };
      } catch {
        // Fall through to local/Graph fallbacks for legacy rows and outages.
      }
    }
  }

  const localPath = resolveLocalPath(row);

  if (localPath) {
    const buffer = Buffer.from(await Bun.file(localPath).arrayBuffer());
    return { buffer, contentType, filename };
  }

  if (row.message_id && row.mailbox_email && row.outlook_attachment_id) {
    try {
      const client = createGraphClient();
      const buffer = await client.downloadAttachment(
        row.message_id,
        row.outlook_attachment_id,
        row.mailbox_email
      );
      return { buffer, contentType, filename };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Source file unavailable in Outlook/Graph and no SharePoint or local copy exists: ${message}`
      );
    }
  }

  throw new Error(
    "Document file is not available in SharePoint, local storage, or Outlook/Graph"
  );
}

export async function updateReviewedDocument(
  documentId: number,
  input: {
    cleanMarkdown: string | null;
    documentType: string;
    extractedText: string | null;
    extractionMetadataJson: string;
    extractionMethod: string | null;
    model: string;
    pageCount: number | null;
    processingTimeMs: number;
    rawExtractionJson: string;
    summary: string;
  }
): Promise<void> {
  await db.run(
    `UPDATE documents
     SET document_type = $1,
         summary = $2,
         raw_extraction = $3::jsonb,
         extracted_text = $4,
         clean_markdown = $5,
         extraction_method = $6,
         extraction_metadata = $7::jsonb,
         page_count = $8,
         model = $9,
         processing_time_ms = $10,
         extraction_status = 'success',
         extraction_error = NULL,
         qa_status = 'unreviewed',
         reviewed_at = NULL,
         extracted_at = now(),
         extraction_attempts = COALESCE(extraction_attempts, 0) + 1,
         last_attempted_at = now(),
         updated_at = now()
     WHERE id = $11`,
    [
      input.documentType,
      input.summary,
      input.rawExtractionJson,
      input.extractedText,
      input.cleanMarkdown,
      input.extractionMethod,
      input.extractionMetadataJson,
      input.pageCount,
      input.model,
      input.processingTimeMs,
      documentId,
    ]
  );
}

export async function saveDocumentReview(
  documentId: number,
  input: {
    qaNotes: string | null;
    qaStatus: "approved" | "needs_work" | "unreviewed";
  }
): Promise<void> {
  await db.run(
    `UPDATE documents
     SET qa_status = $1,
         qa_notes = $2,
         reviewed_at = CASE WHEN $1 = 'unreviewed' THEN NULL ELSE now() END,
         updated_at = now()
     WHERE id = $3`,
    [input.qaStatus, input.qaNotes, documentId]
  );
}

export async function rerunDocumentAnalysis(
  row: ReviewDetailRow,
  extractionMode: ExtractionMode,
  analysisProfile: AnalysisProfile
): Promise<ReviewRerunResult> {
  const { buffer, filename } = await readDocumentBuffer(row);

  const useTextOnlyBase =
    analysisProfile !== "auto" && extractionMode !== "full";

  let baseResult: ReviewBaseExtractionResult;
  if (useTextOnlyBase) {
    const textOnly = await extractTextMultipart(
      buffer,
      filename,
      extractionMode === "ocr" ? "ocr" : "native"
    );
    baseResult = buildTextOnlyBaseResult(analysisProfile, textOnly);
  } else {
    switch (extractionMode) {
      case "ocr":
        baseResult = await ocrExtractMultipart(buffer, filename, "auto");
        break;
      case "full":
        baseResult = await fullExtractMultipart(buffer, filename);
        break;
      default:
        baseResult = await nativeExtractMultipart(buffer, filename, "auto");
        break;
    }
  }

  let structuredOutputKey: string | null = null;
  let specialistOutput: Record<string, unknown> | null = null;

  if (analysisProfile === "estimate") {
    structuredOutputKey = "estimate_fields";
    specialistOutput = (await extractEstimateMultipart(
      buffer,
      filename
    )) as unknown as Record<string, unknown>;
  } else if (analysisProfile === "noi") {
    structuredOutputKey = "noi_fields";
    specialistOutput = (await extractNoiMultipart(
      buffer,
      filename
    )) as unknown as Record<string, unknown>;
  }

  let nextDocumentType = row.document_type ?? "unknown";
  if (baseResult.document_type !== "unknown") {
    nextDocumentType = baseResult.document_type;
  } else if (analysisProfile === "estimate") {
    nextDocumentType = "estimate";
  } else if (analysisProfile === "noi") {
    nextDocumentType = "noi_certificate";
  }

  const extractionProfile =
    analysisProfile === "auto" ? "generic" : analysisProfile;
  const rawExtraction = mergeStructuredOutput(
    baseResult.extracted,
    structuredOutputKey,
    specialistOutput
  );
  const extractionMetadataJson = JSON.stringify(
    buildExtractionMetadata({
      analysisProfile: extractionProfile,
      providerMetadata: baseResult.metadata,
      structuredOutputKey,
    })
  );
  const cleanMarkdown = buildCleanMarkdownArtifact({
    documentType: nextDocumentType,
    extractedText: baseResult.text,
    extractionMethod: baseResult.extraction_method,
    extractionProfile,
    fileName: filename,
    metadata: baseResult.metadata,
    model: baseResult.model,
    pageCount: baseResult.page_count,
    source: row.source,
    structuredOutput: rawExtraction,
    summary: baseResult.summary,
  });

  await updateReviewedDocument(row.id, {
    cleanMarkdown,
    documentType: nextDocumentType,
    extractedText: baseResult.text,
    extractionMetadataJson,
    extractionMethod: baseResult.extraction_method,
    model: baseResult.model,
    pageCount: baseResult.page_count,
    processingTimeMs: baseResult.processing_time_ms,
    rawExtractionJson: JSON.stringify(rawExtraction),
    summary: baseResult.summary,
  });

  return {
    documentType: nextDocumentType,
    id: row.id,
    status: "success",
    summary: baseResult.summary,
  };
}
