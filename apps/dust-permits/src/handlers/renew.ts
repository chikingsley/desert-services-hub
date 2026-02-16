/**
 * Renew Permit Handler
 *
 * Thin wrapper that calls portal/create/flow.ts → renewPermitFull()
 */

import { z } from "zod";
import type { DeepPartial, FormData } from "@/form-data";
import { buildFormData } from "@/form-data";
import {
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@/lib/form-data-validation";
import { persistDraftPermitRecord } from "@/lib/permit-records";
import { renewPermitFull } from "@/portal/create";
import { withBrowser } from "@/portal/utils/browser";

/**
 * Schema for renew permit operation (AI-tool compatible)
 */
export const renewSchema = z.object({
  companyName: z.string().describe("Company name (exact match required)"),
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
  permitId: z.string().describe("Permit ID to renew (e.g., D0058823)"),
});

export type RenewInput = z.infer<typeof renewSchema>;

export interface RenewResult {
  success: boolean;
  permitId: string;
  companyName: string;
  newApplicationId?: string;
  error?: string;
}

/**
 * Renew a dust permit by creating a new application copying from existing.
 *
 * @param input - Renewal parameters
 * @returns Result with new application ID if successful
 */
export async function renewPermit(input: RenewInput): Promise<RenewResult> {
  const {
    permitId,
    companyName,
    formDataPath,
    headless,
    keepOpen = false,
  } = input;

  // Load partial overrides from file if provided.
  // Do NOT merge with defaults for renewals, otherwise default project dates
  // can overwrite copied values on page 3.
  let formDataOverrides: DeepPartial<FormData> | undefined;
  if (formDataPath) {
    const file = Bun.file(formDataPath);
    let overridesInput: unknown;
    try {
      const text = await file.text();
      overridesInput = JSON.parse(text) as unknown;
    } catch (error) {
      return {
        companyName,
        error: `Failed to parse FormData JSON from ${formDataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        permitId,
        success: false,
      };
    }

    const overridesValidation = validateFormDataOverrides(overridesInput);
    if (!overridesValidation.success) {
      return {
        companyName,
        error: overridesValidation.error,
        permitId,
        success: false,
      };
    }
    formDataOverrides = overridesValidation.data;

    // Hard gate: validate semantic consistency on a projected full form.
    // The renewal flow still uses partial overrides at runtime.
    const projectedFormData = buildFormData({ overrides: formDataOverrides });
    const projectedValidation = validateBuiltFormData(projectedFormData);
    if (!projectedValidation.success) {
      return {
        companyName,
        error: projectedValidation.error,
        permitId,
        success: false,
      };
    }
  }

  return await withBrowser<RenewResult>(
    { headless, keepOpen, operation: "renew" },
    async (instance) => {
      const { page, context } = instance;

      const result = await renewPermitFull(
        page,
        context,
        permitId,
        companyName,
        formDataOverrides
      );

      if (result.success && result.applicationId) {
        try {
          await persistDraftPermitRecord({
            applicationId: result.applicationId,
            companyName,
            flow: "renew",
            formData: formDataOverrides,
            sourcePermitId: permitId,
          });
        } catch (error) {
          console.warn(
            `[renew] Failed to persist draft permit record: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      return {
        companyName,
        error: result.error,
        newApplicationId: result.applicationId,
        permitId,
        success: result.success,
      };
    }
  );
}
