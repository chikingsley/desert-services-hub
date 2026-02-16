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
import { buildFormData } from "@/form-data";
import {
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@/lib/form-data-validation";
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
  notes: z
    .string()
    .optional()
    .describe("Additional notes about the revision (optional)"),
  permitId: z.string().describe("Permit ID to revise (e.g., D0058823)"),
  revisionType: RevisionTypeSchema.describe(
    "Type of revision: boundary, acreage, contact, schedule, bmp, or other"
  ),
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
    acreage: "Acreage Change - Modify total acreage amount",
    bmp: "BMP Modifications - Update best management practices",
    boundary: "Boundary/Map Change - Update the disturbed area boundary",
    contact: "Contact Information - Update owner/operator contacts",
    other: "General revision",
    schedule: "Project Schedule - Change start/end dates",
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
    let overridesInput: unknown;
    try {
      const text = await file.text();
      overridesInput = JSON.parse(text) as unknown;
    } catch (error) {
      return {
        error: `Failed to parse FormData JSON from ${formDataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        permitId,
        revisionType,
        success: false,
      };
    }

    const overridesValidation = validateFormDataOverrides(overridesInput);
    if (!overridesValidation.success) {
      return {
        error: overridesValidation.error,
        permitId,
        revisionType,
        success: false,
      };
    }
    formData = overridesValidation.data;

    // Hard gate: validate semantic consistency on a projected full form.
    // The revision flow still uses partial overrides at runtime.
    const projectedFormData = buildFormData({ overrides: formData });
    const projectedValidation = validateBuiltFormData(projectedFormData);
    if (!projectedValidation.success) {
      return {
        error: projectedValidation.error,
        permitId,
        revisionType,
        success: false,
      };
    }
  }

  return await withBrowser<ReviseResult>(
    { headless, keepOpen, operation: "revise" },
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
        try {
          await persistDraftPermitRecord({
            applicationId: result.applicationId,
            flow: "revise",
            sourcePermitId: permitId,
          });
        } catch (error) {
          console.warn(
            `[revise] Failed to persist draft permit record: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      return {
        error: result.error,
        newApplicationId: result.applicationId,
        permitId,
        revisionType,
        success: result.success,
      };
    }
  );
}
