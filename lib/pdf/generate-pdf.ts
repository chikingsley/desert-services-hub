// PDF generation for Desert Services estimates
// Server-side using pdfmake 0.3.x Node.js API

import { join } from "node:path";
import pdfmake from "pdfmake";
import type { EditorQuote } from "@/lib/types";
import type { GeneratePDFOptions } from "./pdf-builder";
import { buildDocDefinition } from "./pdf-builder";

// Re-export types for external use
export type { GeneratePDFOptions } from "./pdf-builder";

// Initialize pdfmake 0.3.x for Node.js
pdfmake.setFonts({
  Times: {
    normal: "Times-Roman",
    bold: "Times-Bold",
    italics: "Times-Italic",
    bolditalics: "Times-BoldItalic",
  },
});

// Logo path - in public directory for Next.js
const LOGO_PATH = join(process.cwd(), "public", "logo.png");

async function getLogoBase64(): Promise<string> {
  const file = Bun.file(LOGO_PATH);
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:image/png;base64,${base64}`;
}

/**
 * Generate PDF as Buffer (for API response)
 */
export async function generatePDF(
  quote: EditorQuote,
  options?: GeneratePDFOptions
): Promise<Buffer> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64, options);
  const doc = pdfmake.createPdf(docDefinition);
  return await doc.getBuffer();
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
