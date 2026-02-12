import { saveSsspPDF } from "@lib/pdf/sssp/generate-sssp-pdf.server";
import type { SsspDocument } from "@lib/pdf/sssp/types";

export async function generatePdf(
  inputJsonPath: string,
  outputPdfPath: string
): Promise<void> {
  const json = await Bun.file(inputJsonPath).text();
  const doc = JSON.parse(json) as SsspDocument;
  await saveSsspPDF(doc, outputPdfPath);
}
