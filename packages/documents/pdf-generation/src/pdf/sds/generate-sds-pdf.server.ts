import pdfmake from "pdfmake";
import { initFonts } from "../shared/fonts";
import { loadLogo } from "../shared/logo";
import { buildSdsDocDefinition } from "./build-sds-doc-definition";
import type { SdsListDocument } from "./types";

initFonts();

export async function generateSdsPDF(
  doc: SdsListDocument
): Promise<Uint8Array> {
  const logoBase64 = await loadLogo();
  const docDefinition = buildSdsDocDefinition(doc, logoBase64);
  const buffer: Buffer = await pdfmake.createPdf(docDefinition).getBuffer();
  return buffer;
}

export async function saveSdsPDF(
  doc: SdsListDocument,
  outputPath: string
): Promise<string> {
  const bytes = await generateSdsPDF(doc);
  await Bun.write(outputPath, bytes);
  return outputPath;
}
