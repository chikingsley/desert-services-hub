/**
 * Contract Info Extractor (EXTR-01)
 * Extracts basic contract identification information: type, dates, value, project details.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import {
  type ContractInfo,
  ContractInfoSchema,
} from "../schemas/contract-info";

const SYSTEM_PROMPT = `You are a contract analysis expert. Extract contract identification information from the provided document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
5. Do not invent or assume information not present in the document

CONTRACT TYPE CLASSIFICATION:
- LOI = Letter of Intent (preliminary agreement before full contract)
- Subcontract = Full subcontract agreement between GC and subcontractor
- Work Order = Task order, work authorization, or purchase order
- Amendment = Change order, contract modification, or addendum
- Unknown = Cannot determine from document content

DATE FORMATS:
- All dates should be in YYYY-MM-DD format
- If only month and year are given, use the 1st of the month (e.g., "January 2024" -> "2024-01-01")

CONTRACT VALUE:
- Extract the total contract value as a number in USD
- Do not include currency symbols, commas, or decimal points for cents
- If a range is given, use the higher number
- If "NTE" (Not To Exceed) is specified, use that value`;

export async function extractContractInfo(
  fullText: string,
  mistral: Mistral
): Promise<ContractInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: ContractInfoSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = ContractInfoSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `Contract info extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
