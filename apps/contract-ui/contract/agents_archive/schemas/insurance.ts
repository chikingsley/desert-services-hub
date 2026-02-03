/**
 * Insurance Schema (EXTR-05)
 * Extracts insurance requirements: limits, COI, endorsements, bonding.
 */
import { z } from "zod";

export const InsuranceSchema = z.object({
  glLimits: z
    .string()
    .nullable()
    .describe(
      "General Liability limits (e.g., '$1M per occurrence / $2M aggregate'). Use null if not specified."
    ),
  umbrellaLimits: z
    .string()
    .nullable()
    .describe("Umbrella/Excess liability limits. Use null if not specified."),
  autoLimits: z
    .string()
    .nullable()
    .describe("Auto liability limits. Use null if not specified."),
  workersCompLimits: z
    .string()
    .nullable()
    .describe(
      "Workers compensation limits or 'statutory'. Use null if not specified."
    ),
  coiRequired: z
    .boolean()
    .describe("Whether Certificate of Insurance is required"),
  additionalInsured: z
    .boolean()
    .describe("Whether contractor must be named as Additional Insured"),
  waiverOfSubrogation: z
    .boolean()
    .describe("Whether Waiver of Subrogation endorsement is required"),
  primaryNonContributory: z
    .boolean()
    .describe("Whether Primary & Non-Contributory endorsement is required"),
  bondingRequirements: z
    .string()
    .nullable()
    .describe(
      "Performance/payment bond requirements if any. Use null if not specified."
    ),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where insurance information was found (1-indexed)"),
});

export type InsuranceInfo = z.infer<typeof InsuranceSchema>;
