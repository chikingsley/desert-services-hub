// Client-side PDF generation for Desert Services estimates
// Uses pdfmake browser build for live preview in iframe

import type { EditorEstimate } from "@lib/db/types";
import pdfMake from "pdfmake/build/pdfmake";
import timesFonts from "pdfmake/build/standard-fonts/Times";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { EstimatePDFOptions } from "./build-estimate-doc-definition";
import { buildEstimateDocDefinition } from "./build-estimate-doc-definition";

// Re-export types for external use
export type { EstimatePDFOptions } from "./build-estimate-doc-definition";

// pdfmake 0.3.x — must call addVirtualFileSystem/addFontContainer, setting .vfs does nothing
type PdfMakeInstance = typeof pdfMake & {
  addVirtualFileSystem(v: Record<string, unknown>): void;
  addFontContainer(fc: {
    vfs: Record<string, unknown>;
    fonts: Record<string, unknown>;
  }): void;
  fonts: Record<string, unknown>;
};
const pm = pdfMake as unknown as PdfMakeInstance;

// Register Roboto (embedded in vfs_fonts.js)
const vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: Record<string, string> } })
    .pdfMake?.vfs ??
  (pdfFonts as unknown as { vfs?: Record<string, string> }).vfs ??
  (pdfFonts as Record<string, string>);
pm.addVirtualFileSystem(vfs);

// Register Times (standard PDF font used for titles)
pm.addFontContainer(
  timesFonts as unknown as {
    vfs: Record<string, unknown>;
    fonts: Record<string, unknown>;
  }
);
pm.fonts = {
  ...pm.fonts,
  Times: {
    normal: "Times-Roman",
    bold: "Times-Bold",
    italics: "Times-Italic",
    bolditalics: "Times-BoldItalic",
  },
};

// Convert image to base64 for pdfMake (cached after first fetch)
let logoCache: string | null = null;

async function getLogoBase64(): Promise<string> {
  if (logoCache) {
    return logoCache;
  }
  const response = await fetch("/logo.png");
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  logoCache = base64;
  return base64;
}

/**
 * Generate PDF as Blob (for client-side preview in iframe)
 */
export async function generateEstimatePDFBlob(
  estimate: EditorEstimate,
  options?: EstimatePDFOptions
): Promise<Blob> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildEstimateDocDefinition(
    estimate,
    logoBase64,
    options
  );

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
export async function openEstimatePDF(
  estimate: EditorEstimate,
  options?: EstimatePDFOptions
): Promise<void> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildEstimateDocDefinition(
    estimate,
    logoBase64,
    options
  );
  await pdfMake.createPdf(docDefinition).open();
}
