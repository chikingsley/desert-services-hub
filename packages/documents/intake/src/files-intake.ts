import type {
  ContractsEmailIntakePayload,
  EmailMeta,
  ParseIntakeResult,
} from "@documents-intake/types";
import {
  INTAKE_LOG_PREFIX,
  insertIntakeDocumentFailure,
  insertIntakeDocumentSuccess,
} from "@lib/db/repositories/intake-document";
import { nativeExtract, nativeExtractFromBuffer } from "@lib/pdf-analysis";

export async function processFilesIntake(
  payload: ContractsEmailIntakePayload
): Promise<ParseIntakeResult[]> {
  const {
    attachmentPaths,
    attachmentBuffers,
    originalSubject,
    originalFrom,
    forwarderEmail,
  } = payload;

  const emailMeta: EmailMeta = {
    originalFrom: originalFrom ?? "",
    originalSubject: originalSubject ?? "",
    forwarderEmail: forwarderEmail ?? "",
  };

  console.log(
    `${INTAKE_LOG_PREFIX} Processing ${attachmentPaths.length} file(s) via pdf-analysis service`
  );

  const results: ParseIntakeResult[] = [];

  for (let idx = 0; idx < attachmentPaths.length; idx++) {
    const filePath = attachmentPaths[idx];
    const buffer = attachmentBuffers?.[idx];
    const fileName = filePath.split("/").pop() ?? filePath;
    const started = performance.now();

    try {
      const ingestResult = buffer
        ? await nativeExtractFromBuffer(buffer, fileName)
        : await nativeExtract(filePath);

      const elapsed = Math.round(performance.now() - started);

      const documentId = await insertIntakeDocumentSuccess({
        documentType: ingestResult.document_type,
        filePath,
        fileName,
        summary: ingestResult.summary,
        rawExtractionJson: JSON.stringify(ingestResult.extracted),
        model: ingestResult.model,
        processingTimeMs: elapsed,
        originalFrom: emailMeta.originalFrom || null,
        originalSubject: emailMeta.originalSubject || null,
        forwarderEmail: emailMeta.forwarderEmail || null,
      });

      results.push({
        documentId,
        fileName,
        documentType: ingestResult.document_type,
        pageCount: ingestResult.page_count,
        processingTimeMs: elapsed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${INTAKE_LOG_PREFIX} Failed ${fileName}: ${msg}`);

      await insertIntakeDocumentFailure({
        filePath,
        fileName,
        error: msg.slice(0, 1000),
        originalFrom: emailMeta.originalFrom || null,
        originalSubject: emailMeta.originalSubject || null,
        forwarderEmail: emailMeta.forwarderEmail || null,
      });

      results.push({
        documentId: null,
        fileName,
        documentType: "error",
        pageCount: 0,
        processingTimeMs: 0,
        error: msg,
      });
    }
  }

  return results;
}
