import { nativeExtract } from "@lib/pdf-analysis";

export interface MondayAssetProcessInput {
  filePath: string;
  columnHint?: string;
}

export interface MondayAssetProcessOutcome {
  documentType: string;
  summary: string;
}

export async function processMondayAssetDocument(
  input: MondayAssetProcessInput
): Promise<MondayAssetProcessOutcome> {
  const ingestResult = await nativeExtract(input.filePath);

  const documentType =
    ingestResult.document_type !== "unknown"
      ? ingestResult.document_type
      : (input.columnHint ?? "unknown");

  return {
    documentType,
    summary: ingestResult.summary,
  };
}
