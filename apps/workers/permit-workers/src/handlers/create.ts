/**
 * Create Permit Handler
 *
 * Core logic for creating a new dust permit application.
 */

import { z } from "zod";
import { buildFormData, type DeepPartial, type FormData } from "@/form-data";
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
  flow: ApplicationFlowSchema.describe(
    "Application flow: new-company (first time applicant) or existing-company (returning)"
  ),
  companyName: z
    .string()
    .optional()
    .describe("Company name (required for existing-company flow)"),
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
      valid: false,
      error: "companyName is required for existing-company flow",
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
      valid: false,
      error: "applicant data is required for new-company flow",
    };
  }
  if (flow === "existing-company" && !formData.primaryContact?.firstName) {
    return {
      valid: false,
      error: "primaryContact is required for existing-company flow",
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
  if (!inputValidation.valid) {
    return { success: false, flow, error: inputValidation.error };
  }

  // Load FormData from file if provided
  let overrides = formDataOverrides;
  if (formDataPath && !overrides) {
    log(1, 5, `Loading FormData from ${formDataPath}...`);
    const file = Bun.file(formDataPath);
    const text = await file.text();
    overrides = JSON.parse(text) as DeepPartial<FormData>;
  }

  // Build FormData with overrides
  const formData = buildFormData({ overrides });

  // Validate form data matches flow
  const formValidation = validateFormData(flow, formData);
  if (!formValidation.valid) {
    return { success: false, flow, error: formValidation.error };
  }

  return await withBrowser<CreateResult>(
    { operation: "create", headless, keepOpen },
    async (instance) => {
      const { page, context } = instance;

      // Run the create flow
      log(3, 5, `Running ${flow} flow...`);
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
        return { success: false, flow, error: result.error ?? "Create failed" };
      }

      if (result.applicationId) {
        await persistDraftPermitRecord({
          applicationId: result.applicationId,
          flow,
          formData,
          companyName: companyName ?? null,
        });
      }

      log(4, 5, `Application created: ${result.applicationId}`);
      log(5, 5, result.reachedPage5 ? "Reached Page 5" : "Needs manual review");

      return {
        success: true,
        flow,
        applicationId: result.applicationId ?? undefined,
        reachedPage5: result.reachedPage5,
      };
    }
  );
}
