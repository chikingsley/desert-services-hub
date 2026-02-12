// Server-side PDF generation for Site-Specific Safety Plan (SSSP)
// Uses pdfmake with shared Desert Services font/logo/header/footer infrastructure.

import pdfmake from "pdfmake";
import { initFonts } from "../shared/fonts";
import { loadLogo } from "../shared/logo";
import { buildSsspDocDefinition } from "./build-sssp-doc-definition";
import type { SsspDocument } from "./types";

initFonts();

export async function generateSsspPDF(doc: SsspDocument): Promise<Uint8Array> {
  const logoBase64 = await loadLogo();
  const docDefinition = buildSsspDocDefinition(doc, logoBase64);
  const buffer: Buffer = await pdfmake.createPdf(docDefinition).getBuffer();
  return buffer;
}

export async function saveSsspPDF(
  doc: SsspDocument,
  outputPath: string
): Promise<string> {
  const bytes = await generateSsspPDF(doc);
  await Bun.write(outputPath, bytes);
  return outputPath;
}
