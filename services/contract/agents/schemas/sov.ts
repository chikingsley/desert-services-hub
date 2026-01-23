/**
 * Schedule of Values Schema (EXTR-04)
 * Extracts SOV line items and scope summary.
 */
import { z } from "zod";

const SOVLineItemSchema = z.object({
  itemNumber: z
    .string()
    .describe("Line item number or identifier (e.g., '1', '1.1', 'A')"),
  description: z.string().describe("Description of the work item"),
  amount: z
    .number()
    .nullable()
    .describe("Dollar amount for this line item. Use null if not specified."),
});

export const ScheduleOfValuesSchema = z.object({
  sovIncluded: z
    .boolean()
    .describe("Whether a Schedule of Values is included in the contract"),
  lineItems: z
    .array(SOVLineItemSchema)
    .describe(
      "Individual line items from the SOV. Empty array if no SOV or items not found."
    ),
  scopeSummary: z
    .array(z.string())
    .describe(
      "High-level summary of work scope from SOV descriptions or contract scope section"
    ),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where SOV information was found (1-indexed)"),
});

export type ScheduleOfValuesInfo = z.infer<typeof ScheduleOfValuesSchema>;
