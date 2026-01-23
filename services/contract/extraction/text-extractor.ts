import { extractDigitalText } from "./digital-extractor";
import { extractWithOcr } from "./ocr-extractor";
import type { ExtractedPage, ExtractionResult } from "./types";

/**
 * Extract text from a PDF using dual extraction with best-per-page selection:
 * 1. Run both digital (pdfjs-dist) and OCR (Mistral) extraction
 * 2. For each page, keep whichever text is longer
 *
 * This ensures scanned pages mixed with digital pages are handled correctly.
 *
 * @param filePath - Path to the PDF file
 * @returns ExtractionResult with per-page text and extraction metadata
 */
export async function extractText(filePath: string): Promise<ExtractionResult> {
  const startTime = Date.now();

  // Check if OCR is available
  const hasOcrKey = Boolean(process.env.MISTRAL_API_KEY);

  if (!hasOcrKey) {
    console.log(
      `[Text Extractor] MISTRAL_API_KEY not set, using digital-only extraction: ${filePath}`
    );
    return extractDigitalText(filePath);
  }

  // Run both extractions in parallel for speed
  console.log(`[Text Extractor] Running dual extraction: ${filePath}`);
  const [digitalResult, ocrResult] = await Promise.all([
    extractDigitalText(filePath),
    extractWithOcr(filePath, startTime),
  ]);

  // Build a map of OCR pages by index for quick lookup
  const ocrPageMap = new Map<number, ExtractedPage>();
  for (const page of ocrResult.pages) {
    ocrPageMap.set(page.pageIndex, page);
  }

  // For each page, keep the longer text
  let digitalWins = 0;
  let ocrWins = 0;

  const pages: ExtractedPage[] = digitalResult.pages.map((digitalPage) => {
    const ocrPage = ocrPageMap.get(digitalPage.pageIndex);

    // If no OCR page, use digital
    if (!ocrPage) {
      digitalWins++;
      return digitalPage;
    }

    // Compare lengths and keep the longer one
    if (digitalPage.text.length >= ocrPage.text.length) {
      digitalWins++;
      return digitalPage;
    }

    ocrWins++;
    return ocrPage;
  });

  // Determine extraction method based on which sources won
  let extractionMethod: "digital" | "ocr" | "hybrid";
  if (ocrWins === 0) {
    extractionMethod = "digital";
  } else if (digitalWins === 0) {
    extractionMethod = "ocr";
  } else {
    extractionMethod = "hybrid";
  }

  console.log(
    `[Text Extractor] Dual extraction complete - digital: ${digitalWins} pages, ocr: ${ocrWins} pages (${extractionMethod}): ${filePath}`
  );

  return {
    pages,
    totalPages: pages.length,
    extractionMethod,
    processingTimeMs: Date.now() - startTime,
  };
}
