// PDF generation for Desert Services estimates
// Uses pdfmake Node.js API with standard PDF fonts

import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import pdfmake from "pdfmake";
import type { EditorQuote } from "@/lib/types";
import type { GeneratePDFOptions } from "./pdf-builder";
import { buildBackPageDocDefinition, buildDocDefinition } from "./pdf-builder";

// Re-export types for external use
export type { GeneratePDFOptions } from "./pdf-builder";

// Initialize pdfmake Node.js API with standard PDF fonts
// Using Times (Times New Roman) family
pdfmake.setFonts({
  Roboto: {
    normal: "Times-Roman",
    bold: "Times-Bold",
    italics: "Times-Italic",
    bolditalics: "Times-BoldItalic",
  },
});

// Logo path - in public directory for Next.js
const LOGO_PATH = join(process.cwd(), "public", "logo.png");

async function getLogoBase64(): Promise<string> {
  const bytes = await Bun.file(LOGO_PATH).bytes();
  // Buffer.from(Uint8Array) creates a view without copying
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${base64}`;
}

// Concatenate multiple PDFs into one
// Accepts Buffer or Uint8Array (pdf-lib supports both)
async function concatenatePDFs(
  pdfBuffers: (Buffer | Uint8Array)[]
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const doc = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  // pdf-lib's save() returns Uint8Array directly
  return merged.save();
}

// Generate estimate PDF (without back page)
async function generateEstimatePDF(
  quote: EditorQuote,
  logoBase64: string,
  options?: GeneratePDFOptions
): Promise<Buffer> {
  const docDefinition = buildDocDefinition(quote, logoBase64, options);
  const doc = pdfmake.createPdf(docDefinition);
  return await doc.getBuffer();
}

/**
 * Generate standalone back page PDF
 */
export async function generateBackPagePDF(): Promise<Buffer> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildBackPageDocDefinition(logoBase64);
  const doc = pdfmake.createPdf(docDefinition);
  return await doc.getBuffer();
}

/**
 * Generate PDF as Uint8Array (for API response)
 * Returns Uint8Array for web compatibility (Buffer extends Uint8Array)
 */
export async function generatePDF(
  quote: EditorQuote,
  options?: GeneratePDFOptions
): Promise<Uint8Array> {
  const logoBase64 = await getLogoBase64();
  const estimatePDF = await generateEstimatePDF(quote, logoBase64, options);

  if (options?.includeBackPage) {
    const backPagePDF = await generateBackPagePDF();
    return concatenatePDFs([estimatePDF, backPagePDF]);
  }

  // Buffer extends Uint8Array, so this is valid
  return estimatePDF;
}

// Convert string to URL-safe slug
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const MULTIPLE_DASHES_REGEX = /-+/g;
const LEADING_TRAILING_DASH_REGEX = /^-|-$/g;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, "-")
    .replace(MULTIPLE_DASHES_REGEX, "-")
    .replace(LEADING_TRAILING_DASH_REGEX, "");
}

/**
 * Generate PDF filename from quote data
 */
export function getPDFFilename(quote: EditorQuote): string {
  const companySlug = slugify(quote.billTo.companyName);
  return `Estimate-${quote.estimateNumber}-${companySlug}.pdf`;
}

/**
 * Save PDF to file
 */
export async function savePDF(
  quote: EditorQuote,
  outputPath?: string,
  options?: GeneratePDFOptions
): Promise<string> {
  const buffer = await generatePDF(quote, options);
  const filename = outputPath ?? getPDFFilename(quote);
  await Bun.write(filename, buffer);
  return filename;
}
