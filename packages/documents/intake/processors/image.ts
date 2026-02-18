import {
  extractWithKreuzberg,
  insertFileError,
  insertFileRecord,
  LOG,
} from "../files-intake-db";
import type { EmailMeta, ParseIntakeResult } from "../types";

export async function processImage(
  imagePath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResult> {
  const fileName = imagePath.split("/").pop() ?? imagePath;
  const started = performance.now();

  try {
    const extracted = await extractWithKreuzberg(imagePath, {
      minTextLength: 1,
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
