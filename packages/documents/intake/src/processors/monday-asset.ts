import { nativeExtract, nativeExtractMultipart } from "@lib/pdf-analysis";

export interface MondayAssetProcessInput {
  /** Buffer content — when provided, sends via multipart upload to pdf-analysis
   *  instead of a local path. Use when the caller can't share its filesystem
   *  with the pdf-analysis service (e.g. Trigger.dev runner containers). */
  buffer?: Buffer;
  columnHint?: string;
  filePath: string;
}

export interface MondayAssetProcessOutcome {
  documentType: string;
  summary: string;
}

export async function processMondayAssetDocument(
  input: MondayAssetProcessInput
): Promise<MondayAssetProcessOutcome> {
  const fileName = input.filePath.split("/").pop() ?? input.filePath;
  const ingestResult = input.buffer
    ? await nativeExtractMultipart(input.buffer, fileName)
    : await nativeExtract(input.filePath);

  const documentType =
    ingestResult.document_type !== "unknown"
      ? ingestResult.document_type
      : (input.columnHint ?? "unknown");

  return {
    documentType,
    summary: ingestResult.summary,
  };
}
