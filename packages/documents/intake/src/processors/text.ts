import { insertFileError, insertFileRecord, LOG } from "../files-intake-db";
import type { EmailMeta, ParseIntakeResult } from "../types";

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
