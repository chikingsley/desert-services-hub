import { existsSync } from "node:fs";
import type {
  ContractsEmailIntakePayload,
  EmailMeta,
  ParseIntakeResult,
  SourcePersistenceRef,
} from "@documents-intake/types";
import {
  INTAKE_LOG_PREFIX,
  insertIntakeDocumentFailure,
  insertIntakeDocumentSuccess,
} from "@documents-intake/db/intake-document";
import {
  buildCleanMarkdownArtifact,
  buildExtractionMetadata,
} from "@documents-intake/document-review-artifacts";
import {
  resolveSenderPolicy,
  shouldPersistSourceToSharePointByPolicy,
} from "@email/sender-policy";
import {
  nativeExtract,
  nativeExtractMultipart,
} from "@documents-intake/pdf-analysis";
import {
  createSharePointClientFromEnv,
  uploadBufferToUncategorized,
} from "@sharepoint/intake-upload";

async function persistSourceToSharePoint(
  sharePointClient: ReturnType<typeof createSharePointClientFromEnv>,
  fileName: string,
  filePath: string,
  buffer: Buffer | undefined
): Promise<SourcePersistenceRef | null> {
  if (!sharePointClient) {
    return null;
  }

  let sourceBuffer = buffer;
  if (!sourceBuffer) {
    if (!existsSync(filePath)) {
      return null;
    }
    sourceBuffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
  }

  try {
    return await uploadBufferToUncategorized(sharePointClient, {
      buffer: sourceBuffer,
      originalFileName: fileName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `${INTAKE_LOG_PREFIX} SharePoint source persistence failed for ${fileName}: ${message}`
    );
    return null;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: intake now includes source persistence alongside extraction
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
  const sharePointClient = createSharePointClientFromEnv();
  const senderPolicy = await resolveSenderPolicy({
    fromEmail: emailMeta.originalFrom,
    subject: emailMeta.originalSubject,
  });
  const allowSharePointPersistence = shouldPersistSourceToSharePointByPolicy({
    classification: senderPolicy.classification,
    isExcluded: senderPolicy.isExcluded,
  });

  for (let idx = 0; idx < attachmentPaths.length; idx++) {
    const filePath = attachmentPaths[idx];
    const buffer = attachmentBuffers?.[idx];
    const fileName = filePath.split("/").pop() ?? filePath;
    const started = performance.now();
    const sourcePersistence = allowSharePointPersistence
      ? await persistSourceToSharePoint(
          sharePointClient,
          fileName,
          filePath,
          buffer
        )
      : null;

    if (!allowSharePointPersistence) {
      console.log(
        `${INTAKE_LOG_PREFIX} Skipping SharePoint source persistence for ${fileName} due to sender policy classification=${senderPolicy.classification ?? "none"} excluded=${senderPolicy.isExcluded ? "1" : "0"}`
      );
    }

    try {
      const ingestResult = buffer
        ? await nativeExtractMultipart(buffer, fileName)
        : await nativeExtract(filePath);

      const elapsed = Math.round(performance.now() - started);

      const documentId = await insertIntakeDocumentSuccess({
        cleanMarkdown: buildCleanMarkdownArtifact({
          documentType: ingestResult.document_type,
          extractedText: ingestResult.text,
          extractionMethod: ingestResult.extraction_method,
          fileName,
          metadata: ingestResult.metadata,
          model: ingestResult.model,
          pageCount: ingestResult.page_count,
          source: "parsed",
          structuredOutput: ingestResult.extracted,
          summary: ingestResult.summary,
        }),
        documentType: ingestResult.document_type,
        extractedText: ingestResult.text,
        extractionMetadataJson: JSON.stringify(
          buildExtractionMetadata({
            analysisProfile: "generic",
            providerMetadata: ingestResult.metadata,
          })
        ),
        extractionMethod: ingestResult.extraction_method,
        filePath,
        fileName,
        summary: ingestResult.summary,
        rawExtractionJson: JSON.stringify(ingestResult.extracted),
        model: ingestResult.model,
        pageCount: ingestResult.page_count,
        processingTimeMs: elapsed,
        originalFrom: emailMeta.originalFrom || null,
        originalSubject: emailMeta.originalSubject || null,
        forwarderEmail: emailMeta.forwarderEmail || null,
        sharepointPath: sourcePersistence?.sharepointPath ?? null,
        sharepointUrl: sourcePersistence?.sharepointUrl ?? null,
      });

      results.push({
        documentId,
        fileName,
        documentType: ingestResult.document_type,
        pageCount: ingestResult.page_count,
        processingTimeMs: elapsed,
        sourcePersistence,
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
        sharepointPath: sourcePersistence?.sharepointPath ?? null,
        sharepointUrl: sourcePersistence?.sharepointUrl ?? null,
      });

      results.push({
        documentId: null,
        fileName,
        documentType: "error",
        pageCount: 0,
        processingTimeMs: 0,
        error: msg,
        sourcePersistence,
      });
    }
  }

  return results;
}
