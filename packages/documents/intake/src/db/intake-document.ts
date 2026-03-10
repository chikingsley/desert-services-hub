import { db } from "@lib/db/client";

export const INTAKE_LOG_PREFIX = "[files-intake]";

const insertFileRecordStmt = db.query(`
  INSERT INTO documents (
    document_type, file_path, file_name,
    summary, raw_extraction,
    extracted_text, clean_markdown,
    extraction_method, extraction_metadata, page_count,
    model, processing_time_ms,
    extraction_status,
    sharepoint_path, sharepoint_url,
    original_from, original_subject, forwarder_email
  ) VALUES (
    $1, $2, $3,
    $4, $5::jsonb,
    $6, $7,
    $8, $9::jsonb, $10, $11,
    $12, 'success',
    $13, $14,
    $15, $16, $17
  )
  RETURNING id::text AS id
`);

const insertFileErrorStmt = db.query(`
  INSERT INTO documents (
    file_path, file_name,
    extraction_status, extraction_error,
    sharepoint_path, sharepoint_url,
    original_from, original_subject, forwarder_email
  ) VALUES ($1, $2, 'failed', $3, $4, $5, $6, $7, $8)
  RETURNING id::text AS id
`);

const propagateDocumentProjectIdsStmt = db.query<{
  total_updated: number;
  via_email: number;
  via_estimate: number;
}>("SELECT * FROM public.propagate_document_project_ids()");

export interface InsertDocumentSuccessInput {
  cleanMarkdown: string | null;
  documentType: string;
  extractedText: string | null;
  extractionMetadataJson: string;
  extractionMethod: string | null;
  fileName: string;
  filePath: string;
  forwarderEmail: string | null;
  model: string;
  originalFrom: string | null;
  originalSubject: string | null;
  pageCount: number | null;
  processingTimeMs: number;
  rawExtractionJson: string;
  sharepointPath: string | null;
  sharepointUrl: string | null;
  summary: string;
}

export interface InsertDocumentFailureInput {
  error: string;
  fileName: string;
  filePath: string;
  forwarderEmail: string | null;
  originalFrom: string | null;
  originalSubject: string | null;
  sharepointPath: string | null;
  sharepointUrl: string | null;
}

export async function insertIntakeDocumentSuccess(
  input: InsertDocumentSuccessInput
): Promise<number | null> {
  const row = (await insertFileRecordStmt.get(
    input.documentType,
    input.filePath,
    input.fileName,
    input.summary,
    input.rawExtractionJson,
    input.extractedText,
    input.cleanMarkdown,
    input.extractionMethod,
    input.extractionMetadataJson,
    input.pageCount,
    input.model,
    input.processingTimeMs,
    input.sharepointPath,
    input.sharepointUrl,
    input.originalFrom,
    input.originalSubject,
    input.forwarderEmail
  )) as { id: string } | null;

  return row ? Number(row.id) : null;
}

export async function insertIntakeDocumentFailure(
  input: InsertDocumentFailureInput
): Promise<number | null> {
  const row = (await insertFileErrorStmt.get(
    input.filePath,
    input.fileName,
    input.error,
    input.sharepointPath,
    input.sharepointUrl,
    input.originalFrom,
    input.originalSubject,
    input.forwarderEmail
  )) as { id: string } | null;

  return row ? Number(row.id) : null;
}

export async function propagateMissingDocumentProjectIds(): Promise<number> {
  const row = await propagateDocumentProjectIdsStmt.get();
  return Number(row?.total_updated ?? 0);
}
