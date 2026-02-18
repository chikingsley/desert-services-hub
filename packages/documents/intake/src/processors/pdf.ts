import {
  extractWithKreuzberg,
  insertFileError,
  insertFileRecord,
  LOG,
  MIN_KREUZBERG_TEXT_LENGTH,
} from "@documents-intake/files-intake-db";
import { classifyDocument } from "@documents-intake/processors/classify";
import type { EmailMeta, ParseIntakeResult } from "@documents-intake/types";

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

    const classified = await classifyDocument(finalContent, fileName);
    const documentType =
      classified.document_type !== "unknown"
        ? classified.document_type
        : "pdf_document";

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
