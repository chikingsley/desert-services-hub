/**
 * Red Flags Schema (EXTR-07)
 * Identifies potential issues: unusual terms, maintenance language, vague clauses, missing info.
 */
import { z } from "zod";

const UnusualTermSchema = z.object({
  term: z.string().describe("The unusual or concerning contract term"),
  concern: z.string().describe("Why this term is flagged as unusual"),
  pageRef: z.number().int().positive().describe("Page number where found"),
});

const LanguageFlagSchema = z.object({
  found: z.boolean().describe("Whether this type of language was found"),
  description: z
    .string()
    .nullable()
    .describe("Description of the language found. Use null if not found."),
  pageRef: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Page number where found. Use null if not found."),
});

const VaguePhraseSchema = z.object({
  phrase: z.string().describe("The vague or ambiguous phrase"),
  concern: z.string().describe("Why this phrase is concerning"),
  pageRef: z.number().int().positive().describe("Page number where found"),
});

export const RedFlagsSchema = z.object({
  unusualTerms: z
    .array(UnusualTermSchema)
    .describe(
      "Unusual or potentially unfavorable contract terms that warrant review"
    ),
  maintenanceLanguage: LanguageFlagSchema.describe(
    "Whether contract includes maintenance/warranty obligations beyond standard"
  ),
  tmLanguage: LanguageFlagSchema.describe(
    "Whether contract includes Time & Materials provisions"
  ),
  vagueLanguage: z
    .array(VaguePhraseSchema)
    .describe("Vague or ambiguous language that could be problematic"),
  missingInfo: z
    .array(z.string())
    .describe(
      "Standard contract elements that appear to be missing (e.g., 'No start date specified')"
    ),
  overallRiskLevel: z
    .enum(["low", "medium", "high"])
    .describe("Overall risk assessment based on red flags found"),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("All pages referenced in this analysis (1-indexed)"),
});

export type RedFlagsInfo = z.infer<typeof RedFlagsSchema>;
