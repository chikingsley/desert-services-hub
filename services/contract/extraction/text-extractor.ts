import { extractDigitalText } from "./digital-extractor";
import { extractWithOcr } from "./ocr-extractor";
import type { ExtractionResult } from "./types";

/**
 * Minimum average characters per page to consider digital extraction successful.
 * PDFs with less than this are likely scanned images without embedded text.
 */
const MIN_CHARS_PER_PAGE = 100;

/**
 * Extract text from a PDF using a two-tier strategy:
 * 1. Try fast local extraction (pdfjs-dist) first
 * 2. Fall back to OCR if the text yield is too low (likely scanned)
 *
 * @param filePath - Path to the PDF file
 * @returns ExtractionResult with per-page text and extraction metadata
 */
export async function extractText(filePath: string): Promise<ExtractionResult> {
  const startTime = Date.now();

  // First, try digital extraction (fast, no API call)
  const digitalResult = await extractDigitalText(filePath);

  // If no pages extracted, something went wrong - try OCR as fallback
  if (digitalResult.pages.length === 0) {
    console.log(
      `[Text Extractor] Digital extraction failed, falling back to OCR: ${filePath}`
    );
    return extractWithOcr(filePath, startTime);
  }

  // Calculate average characters per page
  const totalChars = digitalResult.pages.reduce(
    (sum, page) => sum + page.text.length,
    0
  );
  const avgCharsPerPage = totalChars / digitalResult.pages.length;

  // If text yield is too low, this is likely a scanned PDF - use OCR
  if (avgCharsPerPage < MIN_CHARS_PER_PAGE) {
    console.log(
      `[Text Extractor] Low text yield (${Math.round(avgCharsPerPage)} chars/page), using OCR: ${filePath}`
    );
    return extractWithOcr(filePath, startTime);
  }

  // Digital extraction was successful
  console.log(
    `[Text Extractor] Digital extraction successful (${Math.round(avgCharsPerPage)} chars/page): ${filePath}`
  );

  // Update processing time to include any decision overhead
  return {
    ...digitalResult,
    processingTimeMs: Date.now() - startTime,
  };
}
