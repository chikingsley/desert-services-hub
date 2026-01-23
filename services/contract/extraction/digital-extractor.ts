import { readFile } from "node:fs/promises";
import type { ExtractedPage, ExtractionResult } from "./types";

/**
 * Extract text from a digital PDF using pdfjs-dist.
 * This is the fast path for PDFs with embedded text layers.
 */
export async function extractDigitalText(
  filePath: string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    // Dynamic import for server-side compatibility with Bun
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Read the PDF file
    const buffer = await readFile(filePath);
    const data = new Uint8Array(buffer);

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;

    const pages: ExtractedPage[] = [];

    // Extract text from each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Join all text items with spaces, preserving line breaks
      const text = textContent.items
        .map((item) => {
          if ("str" in item) {
            return item.str;
          }
          return "";
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      pages.push({
        pageIndex: i - 1, // 0-indexed
        text,
        source: "digital",
      });
    }

    return {
      pages,
      totalPages: pdf.numPages,
      extractionMethod: "digital",
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    // Return empty result on failure - caller can try OCR fallback
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Digital Extractor] Failed to extract text: ${message}`);

    return {
      pages: [],
      totalPages: 0,
      extractionMethod: "digital",
      processingTimeMs: Date.now() - startTime,
    };
  }
}
