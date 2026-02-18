import {
  extractWithKreuzberg,
  MIN_KREUZBERG_TEXT_LENGTH,
} from "@documents-intake/files-intake-db";
import { classifyDocument } from "@documents-intake/processors/classify";
import { db } from "@lib/db/hub";

function computeHash(buffer: Buffer): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(buffer);
  return hasher.digest("hex");
}

const checkContentHashDupe = db.query<{ id: number }, [string, number]>(`
  SELECT d2.id
  FROM documents d2
  WHERE d2.source = 'email_attachment'
    AND d2.content_hash = $1
    AND d2.extraction_status IN ('success', 'deduped')
    AND d2.id <> $2
  LIMIT 1
`);

const setContentHash = db.prepare(`
  UPDATE documents SET content_hash = $2, updated_at = now() WHERE id = $1
`);

const markDeduped = db.prepare(`
  UPDATE documents
  SET extraction_status = 'deduped',
      extracted_at = now(),
      extraction_attempts = extraction_attempts + 1,
      last_attempted_at = now(),
      updated_at = now()
  WHERE id = $1
`);

export interface MondayAssetProcessInput {
  documentId: number;
  filePath: string;
  fileName: string;
  columnHint?: string;
}

export type MondayAssetProcessOutcome =
  | { status: "deduped"; contentHash: string }
  | {
      status: "success";
      contentHash: string;
      documentType: string;
      summary: string;
    };

export async function processMondayAssetDocument(
  input: MondayAssetProcessInput
): Promise<MondayAssetProcessOutcome> {
  const fileBuffer = await Bun.file(input.filePath).arrayBuffer();
  const contentHash = computeHash(Buffer.from(fileBuffer));
  await setContentHash.run(input.documentId, contentHash);

  const hashDupe = await checkContentHashDupe.get(
    contentHash,
    input.documentId
  );
  if (hashDupe) {
    await markDeduped.run(input.documentId);
    return { status: "deduped", contentHash };
  }

  const extracted = await extractWithKreuzberg(input.filePath, {
    minTextLength: MIN_KREUZBERG_TEXT_LENGTH,
  });

  const finalContent = extracted.content;
  const classified = await classifyDocument(
    finalContent,
    input.fileName,
    input.columnHint
  );
  const documentType =
    classified.document_type !== "unknown"
      ? classified.document_type
      : (input.columnHint ?? "unknown");

  await db.run(
    `UPDATE documents
     SET document_type = $2,
         summary = $3,
         extraction_status = 'success',
         extraction_attempts = extraction_attempts + 1,
         last_attempted_at = now(),
         extracted_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [input.documentId, documentType, finalContent.slice(0, 10_000)]
  );

  return {
    status: "success",
    contentHash,
    documentType,
    summary: finalContent,
  };
}
