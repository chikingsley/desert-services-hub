/**
 * Site Info Schema (EXTR-06)
 * Extracts site logistics: address, hours, access, safety requirements.
 */
import { z } from "zod";

export const SiteInfoSchema = z.object({
  siteAddress: z
    .string()
    .nullable()
    .describe("Full street address of the job site. Use null if not found."),
  siteHours: z
    .string()
    .nullable()
    .describe(
      "Work hours or site access hours (e.g., '7am-5pm M-F'). Use null if not specified."
    ),
  accessInstructions: z
    .string()
    .nullable()
    .describe(
      "Special access instructions (gate codes, check-in procedures, etc.). Use null if not found."
    ),
  safetyRequirements: z
    .array(z.string())
    .describe(
      "Safety requirements mentioned in the contract (PPE, certifications, orientations, etc.)"
    ),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where site information was found (1-indexed)"),
});

export type SiteInfo = z.infer<typeof SiteInfoSchema>;
