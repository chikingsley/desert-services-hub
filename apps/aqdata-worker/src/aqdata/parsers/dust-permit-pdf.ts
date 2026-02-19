import {
  buildDustPermitPdfWarnings,
  extractDustPermitPdfEmails,
  extractDustPermitPdfLabelValues,
  normalizeDustPermitPdfText,
  parseDustPermitPdfText as parseDustPermitPdfTextImpl,
} from "./dust-permit-pdf-parse";
import { extractDustPermitPdfText } from "./dust-permit-pdf-text";
import type {
  DustPermitPdfExtraction,
  DustPermitPdfFields,
} from "./dust-permit-pdf-types";

export function parseDustPermitPdfText(text: string): DustPermitPdfFields {
  return parseDustPermitPdfTextImpl(text);
}

export async function extractDustPermitPdf(
  bytes: Uint8Array,
  contentType: string | null
): Promise<DustPermitPdfExtraction> {
  const extracted = await extractDustPermitPdfText(bytes);
  const normalizedText = normalizeDustPermitPdfText(extracted.text);
  const fields = parseDustPermitPdfText(normalizedText);

  return {
    bytes: bytes.byteLength,
    contentType,
    emails: extractDustPermitPdfEmails(normalizedText),
    extractionMethod: extracted.method,
    fields,
    labelValues: extractDustPermitPdfLabelValues(normalizedText),
    pageCount: extracted.pageCount,
    warnings: buildDustPermitPdfWarnings(fields),
  };
}
