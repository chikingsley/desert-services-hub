// Client-side PDF generation for Desert Services estimates
// Uses pdfmake browser build for live preview in iframe

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { EditorQuote } from "@/lib/types";
import type { GeneratePDFOptions } from "./pdf-builder";
import { buildDocDefinition } from "./pdf-builder";

// Re-export types for external use
export type { GeneratePDFOptions } from "./pdf-builder";

// Initialize pdfmake with fonts
// Handle different pdfFonts structures (some versions use .vfs, some use .pdfMake.vfs, some have fonts directly)
const vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ??
  (pdfFonts as unknown as { vfs?: unknown }).vfs ??
  pdfFonts;
pdfMake.vfs = vfs as typeof pdfMake.vfs;

// Convert image to base64 for pdfMake
async function getLogoBase64(): Promise<string> {
  const response = await fetch("/logo.png");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate PDF as Blob (for client-side preview in iframe)
 */
export async function generatePDFBlob(
  quote: EditorQuote,
  options?: GeneratePDFOptions
): Promise<Blob> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64, options);

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      const maybePromise: unknown = pdfDoc.getBlob((blob: Blob) => {
        resolve(blob);
      });

      if (
        maybePromise &&
        typeof (maybePromise as Promise<Blob>).then === "function"
      ) {
        (maybePromise as Promise<Blob>).then(resolve).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Open PDF in new tab
 */
export async function openPDF(
  quote: EditorQuote,
  options?: GeneratePDFOptions
): Promise<void> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64, options);
  await pdfMake.createPdf(docDefinition).open();
}
