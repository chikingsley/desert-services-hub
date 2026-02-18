import { extractFile } from "@kreuzberg/node";
import { db } from "@lib/db/hub";
import type { KreuzbergExtraction } from "./types";

export const LOG = "[files-intake]";
export const MIN_KREUZBERG_TEXT_LENGTH = 100;

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

export async function extractWithKreuzberg(
  filePath: string,
  _options?: { minTextLength?: number }
): Promise<KreuzbergExtraction> {
  const pass = await extractFile(filePath);

  return {
    content: pass.content ?? "",
    tables: pass.tables?.map((table) => table.markdown) ?? [],
    metadata: (pass.metadata as Record<string, unknown> | undefined) ?? {},
    extractor: "kreuzberg",
    ocrAttempted: false,
    ocrError: undefined,
  };
}
