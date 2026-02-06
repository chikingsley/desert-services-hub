/**
 * Renew Permit Handler
 *
 * Thin wrapper that calls portal/create/flow.ts → renewPermitFull()
 */

import { z } from "zod";
import { buildFormData, type FormData } from "@/form-data";
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

  // Load FormData from file if provided
  let formData: FormData | undefined;
  if (formDataPath) {
    const file = Bun.file(formDataPath);
    const text = await file.text();
    const overrides = JSON.parse(text);
    formData = buildFormData({ overrides });
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
        formData
      );

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
