import { runLocalLlmJsonPrompt } from "@background-jobs/lib/llm";
import { LOG } from "../files-intake-db";

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
  const textSnippet = text.slice(0, 4000);
  const hintLine = columnHint
    ? `\nThe source system suggests this is likely a "${columnHint}" document. Use this as a strong hint but override if the content clearly indicates otherwise.`
    : "";

  const prompt = `Classify this construction industry document. Respond with JSON only.

File name: "${fileName}"${hintLine}

Document types (pick one):
- estimate: bid estimate, quote, proposal with line items and pricing
- contract: subcontract, agreement, purchase order, work order
- noi: notice of intent, dust permit application, SWPPP notice
- permit: dust permit, building permit, grading permit (issued document)
- plan: construction plans, drawings, blueprints, site plans
- invoice: invoice, billing, payment request, AIA pay application
- insurance: certificate of insurance, COI, bond
- lien_waiver: lien waiver, release of lien
- change_order: change order, modification, amendment
- submittal: product submittal, shop drawing, material data
- rfi: request for information
- meeting_minutes: meeting minutes, meeting notes
- safety: safety plan, SWPPP narrative, BMP plan, safety data sheet
- photo: site photo, inspection photo, progress photo
- logo: company logo, letterhead image
- signature: signature block, signed page
- unknown: cannot determine

First 4000 chars of extracted text:
"""
${textSnippet}
"""

Respond with: {"document_type": "...", "confidence": 0.0-1.0}`;

  try {
    const result = await runLocalLlmJsonPrompt(prompt);
    if (result?.document_type && typeof result.document_type === "string") {
      const docType = result.document_type.toLowerCase();
      if (VALID_DOCUMENT_TYPES.has(docType)) {
        return {
          document_type: docType,
          confidence:
            typeof result.confidence === "number" ? result.confidence : 0.5,
        };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG}   classify failed (fallback to unknown): ${msg}`);
  }

  return { document_type: "unknown", confidence: 0 };
}
