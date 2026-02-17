/**
 * Split a PDF to extract specific pages
 *
 * Usage:
 *   bun experiments/split-pdf.ts <input.pdf> <start-page> <end-page> [output.pdf]
 *
 * Example:
 *   bun experiments/split-pdf.ts "./large.pdf" 1 15
 */

import { PDFDocument } from "pdf-lib";

async function splitPdf(
  inputPath: string,
  startPage: number,
  endPage: number,
  outputPath?: string,
): Promise<void> {
  console.log(`Reading PDF: ${inputPath}`);

  const inputBytes = await Bun.file(inputPath).arrayBuffer();
  const inputDoc = await PDFDocument.load(inputBytes);
  const totalPages = inputDoc.getPageCount();

  console.log(`Total pages: ${totalPages}`);

  // Validate page range
  const start = Math.max(1, startPage);
  const end = Math.min(totalPages, endPage);

  if (start > end) {
    throw new Error(`Invalid page range: ${start}-${end}`);
  }

  console.log(`Extracting pages ${start}-${end}...`);

  const outputDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  const copiedPages = await outputDoc.copyPages(inputDoc, pageIndices);

  for (const page of copiedPages) {
    outputDoc.addPage(page);
  }

  const outputBytes = await outputDoc.save();
  const outPath = outputPath ?? inputPath.replace(".pdf", `-pages-${start}-${end}.pdf`);

  await Bun.write(outPath, outputBytes);

  const stats = await Bun.file(outPath).size;
  const sizeMB = (stats / 1024 / 1024).toFixed(2);

  console.log(`Output: ${outPath} (${sizeMB} MB, ${end - start + 1} pages)`);
}

// Main
const [inputPath, startStr, endStr, outputPath] = process.argv.slice(2);

if (!(inputPath && startStr && endStr)) {
  console.error("Usage: bun experiments/split-pdf.ts <input.pdf> <start> <end> [output.pdf]");
  process.exit(1);
}

splitPdf(inputPath, Number(startStr), Number(endStr), outputPath).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
