export interface ReviewBaseExtractionResult {
  document_type: string;
  extracted: Record<string, unknown>;
  extraction_method: string;
  filename: string;
  metadata: Record<string, unknown>;
  model: string;
  page_count: number;
  processing_time_ms: number;
  summary: string;
  text: string;
}

interface TextOnlyExtractionResult {
  extraction_method: string;
  filename: string;
  metadata: Record<string, unknown>;
  page_count: number;
  processing_time_ms: number;
  text: string;
}

export function buildTextOnlyBaseResult(
  analysisProfile: "estimate" | "noi",
  textOnly: TextOnlyExtractionResult
): ReviewBaseExtractionResult {
  return {
    document_type:
      analysisProfile === "estimate" ? "estimate" : "noi_certificate",
    extracted: {},
    extraction_method: textOnly.extraction_method,
    filename: textOnly.filename,
    metadata: textOnly.metadata,
    model: "text-only",
    page_count: textOnly.page_count,
    processing_time_ms: textOnly.processing_time_ms,
    summary:
      analysisProfile === "estimate"
        ? "Estimate text extracted for QA review"
        : "NOI certificate text extracted for QA review",
    text: textOnly.text,
  };
}
