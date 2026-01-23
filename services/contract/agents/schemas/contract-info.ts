/**
 * Contract Info Schema (EXTR-01)
 * Extracts basic contract information: type, dates, value, project details.
 */
import { z } from "zod";

export const ContractInfoSchema = z.object({
  contractType: z
    .enum(["LOI", "Subcontract", "Work Order", "Amendment", "Unknown"])
    .describe("Type of contract document"),
  contractDate: z
    .string()
    .nullable()
    .describe(
      "Date contract was signed/dated, format: YYYY-MM-DD. Use null if not found."
    ),
  contractValue: z
    .number()
    .nullable()
    .describe(
      "Total contract value in USD, without currency symbols. Use null if not found."
    ),
  projectName: z.string().describe("Name of the project"),
  projectAddress: z
    .string()
    .nullable()
    .describe(
      "Full street address of the project site. Use null if not found."
    ),
  startDate: z
    .string()
    .nullable()
    .describe("Project start date, format: YYYY-MM-DD. Use null if not found."),
  endDate: z
    .string()
    .nullable()
    .describe(
      "Project completion/end date, format: YYYY-MM-DD. Use null if not found."
    ),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where this information was found (1-indexed)"),
});

export type ContractInfo = z.infer<typeof ContractInfoSchema>;
