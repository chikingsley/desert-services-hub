import pdfmake from "pdfmake";
import { initFonts } from "../shared/fonts";
import { loadLogo } from "../shared/logo";
import { buildInternalContactSheetDocDefinition } from "./build-internal-contact-sheet-doc-definition";
import type { InternalContactSheetDocument } from "./types";

initFonts();

export async function generateInternalContactSheetPDF(
  doc: InternalContactSheetDocument
): Promise<Uint8Array> {
  const logoBase64 = await loadLogo();
  const docDefinition = buildInternalContactSheetDocDefinition(doc, logoBase64);
  const buffer: Buffer = await pdfmake.createPdf(docDefinition).getBuffer();
  return buffer;
}

export async function saveInternalContactSheetPDF(
  doc: InternalContactSheetDocument,
  outputPath: string
): Promise<string> {
  const bytes = await generateInternalContactSheetPDF(doc);
  await Bun.write(outputPath, bytes);
  return outputPath;
}
