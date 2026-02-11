import type { SsspDocument } from "@lib/pdf/sssp/types";
import { saveSsspPDF } from "@lib/pdf/sssp/generate-sssp-pdf.server";

export async function generatePdf(inputJsonPath: string, outputPdfPath: string) {
  const json = await Bun.file(inputJsonPath).text();
  const doc = JSON.parse(json) as SsspDocument;
  await saveSsspPDF(doc, outputPdfPath);
}

