/**
 * Renew Permit Handler
 *
 * Thin wrapper that calls portal/create/flow.ts → renewPermitFull()
 */

import { z } from "zod";
import { buildFormData, type DeepPartial, type FormData } from "@/form-data";
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
  permitId: z.string().describe("Permit ID to renew (e.g., D0058823)"),
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
        success: false,
        permitId,
        companyName,
        error: `Failed to parse FormData JSON from ${formDataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    const overridesValidation = validateFormDataOverrides(overridesInput);
    if (!overridesValidation.success) {
      return {
        success: false,
        permitId,
        companyName,
        error: overridesValidation.error,
      };
    }
    formDataOverrides = overridesValidation.data;

    // Hard gate: validate semantic consistency on a projected full form.
    // The renewal flow still uses partial overrides at runtime.
    const projectedFormData = buildFormData({ overrides: formDataOverrides });
    const projectedValidation = validateBuiltFormData(projectedFormData);
    if (!projectedValidation.success) {
      return {
        success: false,
        permitId,
        companyName,
        error: projectedValidation.error,
      };
    }
  }

  return await withBrowser<RenewResult>(
    { operation: "renew", headless, keepOpen },
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
            flow: "renew",
            sourcePermitId: permitId,
            formData: formDataOverrides,
            companyName,
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
        success: result.success,
        permitId,
        companyName,
        newApplicationId: result.applicationId,
        error: result.error,
      };
    }
  );
}
