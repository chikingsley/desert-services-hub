/**
 * Billing Extractor (EXTR-02)
 * Extracts billing/payment information: retention, platform, contacts, certified payroll.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import { type BillingInfo, BillingSchema } from "../schemas/billing";

const SYSTEM_PROMPT = `You are a contract analysis expert specializing in construction subcontracts. Extract billing and payment information from the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
5. Do not invent or assume information not present in the document

RETENTION:
- Retention is typically stated as a percentage (5%, 10%)
- Extract just the number without the % symbol
- Look for terms like "retainage", "retention", or "holdback"

BILLING PLATFORM:
- Common platforms: Textura, Procore, GCPay, Premier
- If contract mentions submitting via email or mail, use "Email"
- If a different platform is specified, use "Other"
- If billing method is not specified, use "Unknown"

CERTIFIED PAYROLL:
- Look for "prevailing wage", "Davis-Bacon", "certified payroll" requirements
- Davis-Bacon applies to federal projects over $2,000
- HUD applies to HUD-funded housing projects
- State Prevailing Wage applies to state-funded public works
- If certified payroll is required but type not specified, determine from project funding source

BILLING CONTACTS:
- May be in signature blocks, "Notices" sections, or contact information sections
- Look for AP (Accounts Payable), billing department, or payment contact info`;

export async function extractBilling(
  fullText: string,
  mistral: Mistral
): Promise<BillingInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: BillingSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = BillingSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `Billing extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
