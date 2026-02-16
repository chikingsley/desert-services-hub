/**
 * Create Permit Handler
 *
 * Core logic for creating a new dust permit application.
 */

import { z } from "zod";
import type { DeepPartial, FormData } from "@/form-data";
import { buildFormData } from "@/form-data";
import {
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@/lib/form-data-validation";
import { persistDraftPermitRecord } from "@/lib/permit-records";
import { createApplicationFull } from "@/portal/create";
import { withBrowser } from "@/portal/utils/browser";

/**
 * Application flow types
 */
const ApplicationFlowSchema = z.enum(["new-company", "existing-company"]);

/**
 * Schema for create permit operation (AI-tool compatible)
 */
export const createSchema = z.object({
  companyName: z
    .string()
    .optional()
    .describe("Company name (required for existing-company flow)"),
  flow: ApplicationFlowSchema.describe(
    "Application flow: new-company (first time applicant) or existing-company (returning)"
  ),
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

export type CreateInput = z.infer<typeof createSchema>;

export interface CreateResult {
  success: boolean;
  flow: string;
  applicationId?: string;
  reachedPage5?: boolean;
  error?: string;
}

type ProgressCallback = (step: number, total: number, message: string) => void;

/**
 * Validate input parameters for permit creation.
 */
function validateInput(
  flow: string,
  companyName?: string
): { valid: true } | { valid: false; error: string } {
  if (flow === "existing-company" && !companyName) {
    return {
      error: "companyName is required for existing-company flow",
      valid: false,
    };
  }
  return { valid: true };
}

/**
 * Validate form data matches the flow requirements.
 */
function validateFormData(
  flow: string,
  formData: FormData
): { valid: true } | { valid: false; error: string } {
  if (flow === "new-company" && !formData.applicant?.companyName) {
    return {
      error: "applicant data is required for new-company flow",
      valid: false,
    };
  }
  if (flow === "existing-company" && !formData.primaryContact?.firstName) {
    return {
      error: "primaryContact is required for existing-company flow",
      valid: false,
    };
  }
  return { valid: true };
}

async function validateMapPreflight(
  formData: FormData
): Promise<{ valid: true } | { valid: false; error: string }> {
  const { latitude, longitude, acresDisturbed } = formData.site;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { valid: true };
  }

  try {
    const { buildPermitMapDataFromSiteCoordinates } = await import(
      "@/lib/site-drawing"
    );
    await buildPermitMapDataFromSiteCoordinates(
      {
        acresDisturbed,
        latitude,
        longitude,
      },
      { includeAccessPoint: false }
    );
  } catch (error) {
    return {
      error: `Map preflight failed for site ${latitude.toFixed(6)},${longitude.toFixed(6)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      valid: false,
    };
  }

  return { valid: true };
}

/**
 * Create a new dust permit application.
 *
 * @param input - Create parameters
 * @param formDataOverrides - Optional FormData overrides (passed directly, not from file)
 * @param onProgress - Optional progress callback
 * @returns Result with application ID if successful
 */
export async function createPermit(
  input: CreateInput,
  formDataOverrides?: DeepPartial<FormData>,
  onProgress?: ProgressCallback
): Promise<CreateResult> {
  const { flow, companyName, formDataPath, headless, keepOpen = false } = input;
  const log =
    onProgress ??
    ((step, total, msg) => console.log(`[${step}/${total}] ${msg}`));

  // Validate input parameters
  const inputValidation = validateInput(flow, companyName);
  if (inputValidation.valid === false) {
    return { error: inputValidation.error, flow, success: false };
  }

  // Load FormData from file if provided
  let overridesInput: unknown = formDataOverrides;
  if (formDataPath && !overridesInput) {
    log(1, 6, `Loading FormData from ${formDataPath}...`);
    const file = Bun.file(formDataPath);
    try {
      const text = await file.text();
      overridesInput = JSON.parse(text) as unknown;
    } catch (error) {
      return {
        error: `Failed to parse FormData JSON from ${formDataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        flow,
        success: false,
      };
    }
  }

  let overrides: DeepPartial<FormData> | undefined;
  if (overridesInput !== undefined) {
    log(2, 6, "Validating FormData overrides...");
    const overridesValidation = validateFormDataOverrides(overridesInput);
    if (!overridesValidation.success) {
      return { error: overridesValidation.error, flow, success: false };
    }
    overrides = overridesValidation.data;
  }

  // Build FormData with overrides
  const formData = buildFormData({ overrides });

  // Validate form data matches flow + schema/business rules
  const formValidation = validateFormData(flow, formData);
  if (formValidation.valid === false) {
    return { error: formValidation.error, flow, success: false };
  }
  log(2, 6, "Running FormData validation...");
  const builtValidation = validateBuiltFormData(formData);
  if (!builtValidation.success) {
    return { error: builtValidation.error, flow, success: false };
  }

  log(3, 6, "Running map preflight checks...");
  const mapValidation = await validateMapPreflight(formData);
  if (mapValidation.valid === false) {
    return { error: mapValidation.error, flow, success: false };
  }

  return await withBrowser<CreateResult>(
    { headless, keepOpen, operation: "create" },
    async (instance) => {
      const { page, context } = instance;

      // Run the create flow
      log(4, 6, `Running ${flow} flow...`);
      const result = await createApplicationFull(
        page,
        context,
        flow,
        formData,
        {
          companyName,
        }
      );

      if (!result.success) {
        return { error: result.error ?? "Create failed", flow, success: false };
      }

      if (result.applicationId) {
        try {
          await persistDraftPermitRecord({
            applicationId: result.applicationId,
            companyName: companyName ?? null,
            flow,
            formData,
          });
        } catch (error) {
          // Portal creation succeeded; DB sync should not make the CLI run fail.
          console.warn(
            `[create] Failed to persist draft permit record: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      log(5, 6, `Application created: ${result.applicationId}`);
      log(6, 6, result.reachedPage5 ? "Reached Page 5" : "Needs manual review");

      return {
        applicationId: result.applicationId ?? undefined,
        flow,
        reachedPage5: result.reachedPage5,
        success: true,
      };
    }
  );
}
