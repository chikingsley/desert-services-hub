/**
 * Insurance Extractor (EXTR-05)
 * Extracts insurance requirements: limits, COI, endorsements, bonding.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import { type InsuranceInfo, InsuranceSchema } from "../schemas/insurance";

const SYSTEM_PROMPT = `You are a contract analysis expert specializing in construction insurance requirements. Extract insurance information from the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
5. Do not invent or assume information not present in the document

GENERAL LIABILITY (GL):
- Look for "Commercial General Liability" or "CGL"
- Format: "$X per occurrence / $Y aggregate" (e.g., "$1M per occurrence / $2M aggregate")
- May also show "Each Occurrence" and "General Aggregate" separately

UMBRELLA/EXCESS LIABILITY:
- Additional coverage above primary GL limits
- May be called "Umbrella" or "Excess" liability
- Format similarly to GL limits

AUTO LIABILITY:
- "Commercial Auto" or "Business Auto" coverage
- May show "Combined Single Limit" (CSL) per accident

WORKERS COMPENSATION:
- May state specific limits or "statutory" (meaning state-mandated limits)
- Look for "Workers' Compensation" or "WC"
- If only "statutory" is mentioned, use that exact word

ENDORSEMENTS:
- Additional Insured (AI): Contractor adds GC/Owner to their policy
- Waiver of Subrogation (WOS): Insurer waives right to sue other parties
- Primary & Non-Contributory (P&NC): Contractor's policy pays first, not excess

CERTIFICATE OF INSURANCE (COI):
- Look for "certificate", "proof of insurance", or "evidence of coverage"
- If insurance requirements are listed, COI is typically required

BONDING:
- Performance bond: Guarantees work completion
- Payment bond: Guarantees payment to subs and suppliers
- May specify percentage of contract value (e.g., "100% performance and payment bonds")`;

export async function extractInsurance(
  fullText: string,
  mistral: Mistral
): Promise<InsuranceInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: InsuranceSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = InsuranceSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `Insurance extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
