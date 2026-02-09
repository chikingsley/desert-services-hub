/**
 * Renew Permit Handler
 *
 * Thin wrapper that calls portal/create/flow.ts → renewPermitFull()
 */

import { SQL } from "bun";
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

  // Look up parcel BEFORE browser launches (avoids DB connection timeout)
  // Uses explicit SQL connection since Bun's global sql has connection issues
  const DB_URL =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let targetParcel: string | undefined;
  try {
    const sql = new SQL({ url: DB_URL });
    const rows =
      await sql`SELECT parcel, address FROM dust_permits_filed_by_desert_services WHERE id = ${permitId} LIMIT 1`;
    await sql.close();
    const row = rows[0] as
      | { parcel: string | null; address: string | null }
      | undefined;
    if (row?.parcel) {
      targetParcel = row.parcel;
      console.log(
        `[renew] Source parcel: ${targetParcel} (${row.address ?? "no address"})`
      );
    } else {
      console.log(`[renew] ⚠ No parcel found in hub.db for ${permitId}`);
    }
  } catch (e) {
    console.log(`[renew] ⚠ Could not look up parcel: ${e}`);
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
        formData,
        targetParcel
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
