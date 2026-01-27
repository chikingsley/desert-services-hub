/**
 * Schedule of Values Extractor (EXTR-04)
 * Extracts SOV line items and scope summary.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import {
  type ScheduleOfValuesInfo,
  ScheduleOfValuesSchema,
} from "../schemas/sov";

const SYSTEM_PROMPT = `You are a contract analysis expert specializing in construction contracts. Extract Schedule of Values (SOV) information from the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
5. Do not invent or assume information not present in the document

WHAT IS A SCHEDULE OF VALUES (SOV):
- A breakdown of the contract price into individual line items
- May also be called "Bid Schedule", "Cost Breakdown", "Payment Schedule", or "Exhibit B"
- Lists specific work items with their associated dollar amounts
- Used as basis for progress billing

EXTRACTING LINE ITEMS:
- Extract each line item exactly as written in the document
- itemNumber: The line item number or identifier (e.g., "1", "1.1", "A", "001")
- description: The full description of the work item
- amount: The dollar amount (as a number without $ or commas), or null if not specified
- If SOV shows "TBD" or placeholder amounts, set amount to null

SCOPE SUMMARY:
- High-level summary of work scope from SOV descriptions
- Also extract scope descriptions from scope of work sections
- Each string should be a distinct scope item or deliverable

SOV NOT FOUND:
- If no SOV is included, set sovIncluded to false
- Return empty lineItems array if no SOV found
- Still extract scopeSummary from scope of work sections if available`;

export async function extractSOV(
  fullText: string,
  mistral: Mistral
): Promise<ScheduleOfValuesInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: ScheduleOfValuesSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = ScheduleOfValuesSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `SOV extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
