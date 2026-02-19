import { existsSync } from "node:fs";
import {
  INTAKE_LOG_PREFIX,
  insertIntakeDocumentFailure,
  insertIntakeDocumentSuccess,
} from "@lib/db/repositories/intake-document";
import { nativeExtract } from "@lib/pdf-analysis";
import type {
  ContractsEmailIntakePayload,
  EmailMeta,
  ParseIntakeResult,
} from "./types";

export type { ContractsEmailIntakePayload, ParseIntakeResult } from "./types";

function resolveAttachmentPath(filePath: string): string {
  if (existsSync(filePath)) {
    return filePath;
  }

  // Legacy bad path produced by older intake webhook code.
  const legacyPrefix = "/app/apps/data/";
  if (filePath.startsWith(legacyPrefix)) {
    const normalized = `/app/data/${filePath.slice(legacyPrefix.length)}`;
    if (existsSync(normalized)) {
      return normalized;
    }
  }

  return filePath;
}

export async function processFilesIntake(
  payload: ContractsEmailIntakePayload
): Promise<ParseIntakeResult[]> {
  const { attachmentPaths, originalSubject, originalFrom, forwarderEmail } =
    payload;

  const emailMeta: EmailMeta = {
    originalFrom: originalFrom ?? "",
    originalSubject: originalSubject ?? "",
    forwarderEmail: forwarderEmail ?? "",
  };

  console.log(
    `${INTAKE_LOG_PREFIX} Processing ${attachmentPaths.length} file(s) via pdf-analysis service`
  );

  const results: ParseIntakeResult[] = [];

  for (const rawPath of attachmentPaths) {
    const filePath = resolveAttachmentPath(rawPath);
    const fileName = filePath.split("/").pop() ?? filePath;
    const started = performance.now();

    try {
      const ingestResult = await nativeExtract(filePath);

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
