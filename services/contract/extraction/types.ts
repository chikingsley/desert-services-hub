/**
 * Represents a single extracted page from a contract PDF.
 */
export type ExtractedPage = {
  pageIndex: number;
  text: string;
  source: "digital" | "ocr";
};

/**
 * Result of text extraction from a PDF document.
 */
export type ExtractionResult = {
  pages: ExtractedPage[];
  totalPages: number;
  extractionMethod: "digital" | "ocr" | "hybrid";
  processingTimeMs: number;
};
