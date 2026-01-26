/**
 * Contract Text Extractor
 *
 * Extracts text from contract PDFs using Mistral OCR and caches the result.
 * The actual chunking/analysis is done by the contract-chunker subagent.
 *
 * Pipeline:
 *   PDF → Mistral OCR (extraction/text-extractor.ts) → .txt file (cached)
 *   Then: subagent reads .txt and does chunking analysis
 */

import { extractText } from "./extraction/text-extractor";

/**
 * Get cached text path for a PDF
 */
function getCachePath(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, ".txt");
}

/**
 * Load cached extraction if available
 */
async function loadCachedExtraction(pdfPath: string): Promise<string | null> {
  const cachePath = getCachePath(pdfPath);
  const cacheFile = Bun.file(cachePath);

  if (await cacheFile.exists()) {
    console.log(`[Extractor] Using cached: ${cachePath}`);
    return cacheFile.text();
  }

  return null;
}

/**
 * Save extraction to cache
 */
async function saveExtraction(pdfPath: string, text: string): Promise<void> {
  const cachePath = getCachePath(pdfPath);
  await Bun.write(cachePath, text);
  console.log(`[Extractor] Saved to: ${cachePath}`);
}

/**
 * Extract text from PDF and cache result
 */
async function extractAndCache(pdfPath: string): Promise<string> {
  console.log(`[Extractor] Running Mistral OCR on: ${pdfPath}`);
  const extraction = await extractText(pdfPath);

  const fullText = extraction.pages
    .map((p) => p.text)
    .join("\n\n---PAGE BREAK---\n\n");

  console.log(
    `[Extractor] ${extraction.totalPages} pages (${extraction.extractionMethod}), ${fullText.length} chars`
  );

  await saveExtraction(pdfPath, fullText);

  return fullText;
}

/**
 * Extract text from PDF, using cache if available
 */
export async function extract(pdfPath: string, force = false): Promise<string> {
  if (!force) {
    const cached = await loadCachedExtraction(pdfPath);
    if (cached) {
      return cached;
    }
  }

  return extractAndCache(pdfPath);
}

// CLI
if (import.meta.main) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const pdfPath = args.find((a) => a !== "--force");

  if (!pdfPath) {
    console.log(`
Contract Text Extractor

Usage:
  bun services/contract/chunker.ts <path.pdf> [--force]

Extracts text from PDF using Mistral OCR and saves as .txt file.
Use the contract-chunker subagent for actual chunking analysis.

Options:
  --force   Re-extract even if cached .txt exists

Examples:
  bun services/contract/chunker.ts ./test-fixtures/greenway-embrey/contract.pdf
  bun services/contract/chunker.ts ./test-fixtures/greenway-embrey/contract.pdf --force
`);
    process.exit(0);
  }

  const text = await extract(pdfPath, force);
  console.log(`\nExtracted ${text.length} characters`);
  console.log(`Output: ${getCachePath(pdfPath)}`);
}
