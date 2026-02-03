/**
 * Red Flags Extractor (EXTR-07)
 * Identifies potential issues: unusual terms, maintenance language, vague clauses, missing info.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import { type RedFlagsInfo, RedFlagsSchema } from "../schemas/red-flags";

const SYSTEM_PROMPT = `You are a contract risk analysis expert specializing in construction subcontracts. Identify potential red flags and concerning terms in the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only flag issues explicitly present in the document
2. For pageReferences, cite the page number(s) where you found concerning items
3. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
4. Be specific about why each item is concerning

UNUSUAL TERMS TO FLAG:
- Liquidated damages (LD) clauses with high daily penalties
- Broad indemnification language (indemnify, hold harmless, defend)
- Warranty extensions beyond industry standard (typically 1 year)
- Pay-when-paid or pay-if-paid clauses
- Termination for convenience with limited notice
- Excessive insurance requirements
- Performance guarantees or penalties
- Unusual scope expansion language

MAINTENANCE LANGUAGE:
- Obligations beyond the construction phase
- Extended warranty periods (2+ years)
- Maintenance periods after substantial completion
- "Warranty work" that goes beyond defect correction
- Set found=true if any maintenance obligations are present

TIME & MATERIALS (T&M) LANGUAGE:
- T&M provisions can mean unlimited cost exposure
- Look for "time and materials", "cost-plus", "unit pricing"
- Change order provisions that allow T&M work
- Set found=true if T&M provisions are present

VAGUE LANGUAGE:
- "As directed by Owner/GC"
- "To Owner's satisfaction"
- "And other work as required"
- Undefined scope boundaries
- Subjective acceptance criteria
- "Reasonable" without definition

MISSING INFORMATION:
Standard elements that should be present:
- Contract value or pricing
- Start date / completion date
- Payment terms
- Insurance requirements
- Scope definition
- Change order process

RISK LEVEL ASSESSMENT:
- low: Standard terms, no significant concerns, complete information
- medium: Some unusual terms OR some vague language OR minor missing info
- high: Multiple concerning terms AND/OR significant missing info AND/OR broad indemnification`;

export async function extractRedFlags(
  fullText: string,
  mistral: Mistral
): Promise<RedFlagsInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: RedFlagsSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = RedFlagsSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `Red flags extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
