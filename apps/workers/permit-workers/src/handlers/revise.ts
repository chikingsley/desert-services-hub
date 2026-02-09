/**
 * Revise Permit Handler
 *
 * Thin wrapper that calls portal/create/flow.ts → revisePermitFull()
 *
 * Revisions edit the permit in-place and do NOT extend the expiration date.
 * Use renew for extending the permit.
 */

import { z } from "zod";
import type { DeepPartial, FormData } from "@/form-data";
import { persistDraftPermitRecord } from "@/lib/permit-records";
import { revisePermitFull } from "@/portal/create";
import { withBrowser } from "@/portal/utils/browser";

/**
 * Revision types for dust permits
 */
export const RevisionTypeSchema = z.enum([
  "boundary",
  "acreage",
  "contact",
  "schedule",
  "bmp",
  "other",
]);

export type RevisionType = z.infer<typeof RevisionTypeSchema>;

/**
 * Schema for revise permit operation (AI-tool compatible)
 */
export const reviseSchema = z.object({
  permitId: z.string().describe("Permit ID to revise (e.g., D0058823)"),
  revisionType: RevisionTypeSchema.describe(
    "Type of revision: boundary, acreage, contact, schedule, bmp, or other"
  ),
  notes: z
    .string()
    .optional()
    .describe("Additional notes about the revision (optional)"),
  formDataPath: z
    .string()
    .optional()
    .describe("Path to JSON file with FormData overrides"),
  headless: z
    .boolean()
    .optional()
    .describe("Run browser in headless mode (default: config setting)"),
  keepOpen: z
    .boolean()
    .optional()
    .describe("Keep browser open after completion for manual review"),
});

export type ReviseInput = z.infer<typeof reviseSchema>;

export interface ReviseResult {
  success: boolean;
  permitId: string;
  revisionType: RevisionType;
  newApplicationId?: string;
  error?: string;
}

/**
 * Map revision type to a human-readable purpose string for the portal.
 */
function getRevisionPurpose(
  revisionType: RevisionType,
  notes?: string
): string {
  const typeDescriptions: Record<RevisionType, string> = {
    boundary: "Boundary/Map Change - Update the disturbed area boundary",
    acreage: "Acreage Change - Modify total acreage amount",
    contact: "Contact Information - Update owner/operator contacts",
    schedule: "Project Schedule - Change start/end dates",
    bmp: "BMP Modifications - Update best management practices",
    other: "General revision",
  };

  const baseDescription = typeDescriptions[revisionType];
  return notes ? `${baseDescription}. ${notes}` : baseDescription;
}

/**
 * Revise an existing dust permit.
 *
 * @param input - Revision parameters
 * @returns Result with new revision application ID if successful
 */
export async function revisePermit(input: ReviseInput): Promise<ReviseResult> {
  const {
    permitId,
    revisionType,
    notes,
    formDataPath,
    headless,
    keepOpen = false,
  } = input;

  // Load FormData overrides from file if provided (raw, not merged with defaults)
  let formData: DeepPartial<FormData> | undefined;
  if (formDataPath) {
    const file = Bun.file(formDataPath);
    const text = await file.text();
    formData = JSON.parse(text) as DeepPartial<FormData>;
  }

  return await withBrowser<ReviseResult>(
    { operation: "revise", headless, keepOpen },
    async (instance) => {
      const { page, context } = instance;

      // Call portal function - all browser automation lives there
      const revisionPurpose = getRevisionPurpose(revisionType, notes);
      const result = await revisePermitFull(
        page,
        context,
        permitId,
        revisionPurpose,
        formData
      );

      if (result.success && result.applicationId) {
        await persistDraftPermitRecord({
          applicationId: result.applicationId,
          flow: "revise",
          sourcePermitId: permitId,
        });
      }

      return {
        success: result.success,
        permitId,
        revisionType,
        newApplicationId: result.applicationId,
        error: result.error,
      };
    }
  );
}
