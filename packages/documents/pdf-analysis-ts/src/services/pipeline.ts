import { extractPdfText } from "@pdf-analysis/services/kreuzberg";
import type {
  OcrProvider,
  ParsePipelineOptions,
  ParsePipelineResult,
  TextExtractionResult,
} from "@pdf-analysis/types";

const DEFAULT_MIN_TEXT_LENGTH = 400;

export async function parseWithFallback(
  filePath: string,
  ocrProvider: OcrProvider,
  options?: ParsePipelineOptions,
  textExtractor: (
    path: string
  ) => Promise<TextExtractionResult> = extractPdfText
): Promise<ParsePipelineResult> {
  const minTextLength =
    options?.minTextLength ??
    (Number.parseInt(process.env.PDF_ANALYSIS_MIN_TEXT_LENGTH || "", 10) ||
      DEFAULT_MIN_TEXT_LENGTH);

  const steps: string[] = [];
  steps.push("1. Extract text layer with kreuzberg");

  const textResult = await textExtractor(filePath);

  if (textResult.content.trim().length >= minTextLength) {
    steps.push(
      `2. Use text layer (length=${textResult.content.length}, threshold=${minTextLength})`
    );
    return {
      content: textResult.content,
      method: "text-layer",
      pageCount: textResult.pageCount,
      steps,
    };
  }

  steps.push(
    `2. Text layer below threshold (length=${textResult.content.length}, threshold=${minTextLength})`
  );

  if (!(await ocrProvider.isAvailable())) {
    steps.push("3. OCR provider unavailable, return text layer as fallback");
    return {
      content: textResult.content,
      method: "text-layer",
      pageCount: textResult.pageCount,
      steps,
    };
  }

  steps.push(`3. Run OCR fallback via ${ocrProvider.name}`);
  const ocrResult = await ocrProvider.ocrPdf(filePath);

  const content =
    ocrResult.content.length > textResult.content.length
      ? ocrResult.content
      : textResult.content;
  const method = content === ocrResult.content ? "ocr-fallback" : "text-layer";
  steps.push(
    `4. Final content selected from ${method === "ocr-fallback" ? "OCR" : "text layer"}`
  );

  return {
    content,
    method,
    pageCount: Math.max(textResult.pageCount, ocrResult.pageCount),
    steps,
  };
}
