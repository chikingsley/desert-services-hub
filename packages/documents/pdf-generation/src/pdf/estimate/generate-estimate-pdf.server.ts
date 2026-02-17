// Server-side PDF generation for Desert Services estimates
// Uses pdfmake Node.js API with shared font/logo infrastructure

import { validateAndNormalizeEditorEstimateForPdf } from "@estimates/estimating/estimate-payload-validation-pdf";
import type { EditorEstimate } from "@lib/db/types";
import { PDFDocument } from "pdf-lib";
import pdfmake from "pdfmake";
import { initFonts } from "../shared/fonts";
import { loadLogo } from "../shared/logo";
import type { EstimatePDFOptions } from "./build-estimate-doc-definition";
import {
  buildEstimateBackPageDocDefinition,
  buildEstimateDocDefinition,
} from "./build-estimate-doc-definition";

// Re-export types for external use
export type { EstimatePDFOptions } from "./build-estimate-doc-definition";

// Initialize fonts once at module level
initFonts();

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
function generateEstimateMainPDF(
  estimate: EditorEstimate,
  logoBase64: string,
  options?: EstimatePDFOptions
): Promise<Buffer> {
  const docDefinition = buildEstimateDocDefinition(
    estimate,
    logoBase64,
    options
  );
  return pdfmake.createPdf(docDefinition).getBuffer();
}

/**
 * Generate standalone back page PDF
 */
export async function generateEstimateBackPagePDF(): Promise<Buffer> {
  const logoBase64 = await loadLogo();
  const docDefinition = buildEstimateBackPageDocDefinition(logoBase64);
  return pdfmake.createPdf(docDefinition).getBuffer();
}

/**
 * Generate PDF as Uint8Array (for API response)
 * Returns Uint8Array for web compatibility (Buffer extends Uint8Array)
 */
export async function generateEstimatePDF(
  estimate: EditorEstimate,
  options?: EstimatePDFOptions
): Promise<Uint8Array> {
  const sanitizedEstimate = validateAndNormalizeEditorEstimateForPdf(estimate);
  const logoBase64 = await loadLogo();
  const estimatePDF = await generateEstimateMainPDF(
    sanitizedEstimate,
    logoBase64,
    options
  );

  if (options?.includeBackPage) {
    const backPagePDF = await generateEstimateBackPagePDF();
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
export function getEstimatePDFFilename(quote: EditorEstimate): string {
  const companySlug = slugify(quote.billTo.companyName);
  return `Estimate-${quote.estimateNumber}-${companySlug}.pdf`;
}

/**
 * Save PDF to file
 */
export async function saveEstimatePDF(
  estimate: EditorEstimate,
  outputPath?: string,
  options?: EstimatePDFOptions
): Promise<string> {
  const buffer = await generateEstimatePDF(estimate, options);
  const filename = outputPath ?? getEstimatePDFFilename(estimate);
  await Bun.write(filename, buffer);
  return filename;
}
