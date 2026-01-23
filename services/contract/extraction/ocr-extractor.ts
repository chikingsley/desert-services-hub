import { readFile } from "node:fs/promises";
import { Mistral } from "@mistralai/mistralai";
import type { ExtractedPage, ExtractionResult } from "./types";

const MODEL = "mistral-ocr-latest";

/**
 * Extract text from a scanned PDF using Mistral OCR API.
 * This is the fallback path for PDFs without embedded text layers.
 */
export async function extractWithOcr(
  filePath: string,
  startTime?: number
): Promise<ExtractionResult> {
  const effectiveStartTime = startTime ?? Date.now();

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY environment variable is required for OCR extraction"
    );
  }

  const mistral = new Mistral({ apiKey });

  // Read the PDF file and convert to base64 data URL
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");
  const dataUrl = `data:application/pdf;base64,${base64}`;

  // Call Mistral OCR API
  const response = await mistral.ocr.process({
    model: MODEL,
    document: {
      type: "document_url",
      documentUrl: dataUrl,
    },
    includeImageBase64: false,
    tableFormat: "markdown",
  });

  // Map response pages to ExtractedPage format
  const pages: ExtractedPage[] = response.pages.map((page) => ({
    pageIndex: page.index,
    text: page.markdown,
    source: "ocr" as const,
  }));

  return {
    pages,
    totalPages: pages.length,
    extractionMethod: "ocr",
    processingTimeMs: Date.now() - effectiveStartTime,
  };
}
