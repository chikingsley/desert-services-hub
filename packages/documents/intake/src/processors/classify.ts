import { classifyText } from "@lib/pdf-analysis";
import { LOG } from "@documents-intake/files-intake-db";

const VALID_DOCUMENT_TYPES = new Set([
  "estimate",
  "contract",
  "noi",
  "permit",
  "plan",
  "invoice",
  "insurance",
  "lien_waiver",
  "change_order",
  "submittal",
  "rfi",
  "meeting_minutes",
  "safety",
  "photo",
  "logo",
  "signature",
  "unknown",
]);

export async function classifyDocument(
  text: string,
  fileName: string,
  columnHint?: string
): Promise<{ document_type: string; confidence: number }> {
  try {
    const result = await classifyText(text, fileName);
    const docType = result.document_type.toLowerCase();

    if (VALID_DOCUMENT_TYPES.has(docType)) {
      return {
        document_type: docType,
        confidence: result.confidence,
      };
    }

    const hintedType = (columnHint ?? "").toLowerCase();
    if (VALID_DOCUMENT_TYPES.has(hintedType)) {
      return { document_type: hintedType, confidence: 0.4 };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG}   classify failed (fallback to unknown): ${msg}`);
  }

  return { document_type: "unknown", confidence: 0 };
}
