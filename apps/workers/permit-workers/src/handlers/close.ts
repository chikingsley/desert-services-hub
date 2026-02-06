/**
 * Close Permit Handler
 *
 * Core logic for closing a dust permit.
 */

import { z } from "zod";
import {
  cancelClosePermit,
  clickClosePermitButton,
  confirmClosePermit,
  fillClosePermitDialog,
  searchAndOpenPermit,
} from "@/portal/close";
import { withBrowser } from "@/portal/utils/browser";
import {
  navigateToDustSearch,
  navigateToMyDustApps,
} from "@/portal/utils/helpers";

/**
 * Schema for close permit operation (AI-tool compatible)
 */
export const closeSchema = z.object({
  permitId: z.string().describe("Permit ID to close (e.g., D0056240)"),
  reason: z
    .string()
    .optional()
    .describe(
      "Reason for closing the permit (default: 'Project complete - closing permit')"
    ),
  headless: z
    .boolean()
    .optional()
    .describe("Run browser in headless mode (default: config setting)"),
});

export type CloseInput = z.infer<typeof closeSchema>;

export interface CloseResult {
  success: boolean;
  permitId: string;
  error?: string;
}

type ProgressCallback = (step: number, total: number, message: string) => void;

const DEFAULT_CLOSE_REASON = "Project complete - closing permit";

/**
 * Close a dust permit.
 *
 * @param input - Close parameters
 * @param onProgress - Optional progress callback
 * @returns Result indicating success or failure
 */
export async function closePermit(
  input: CloseInput,
  onProgress?: ProgressCallback
): Promise<CloseResult> {
  const { permitId, reason = DEFAULT_CLOSE_REASON, headless } = input;
  const log =
    onProgress ??
    ((step, total, msg) => console.log(`[${step}/${total}] ${msg}`));

  return await withBrowser<CloseResult>(
    { operation: "close", headless },
    async (instance) => {
      const { page, context } = instance;

      // 2. Navigate to search
      log(2, 6, "Navigating to dust search...");
      await navigateToMyDustApps(page);
      const atSearch = await navigateToDustSearch(page);
      if (!atSearch) {
        return {
          success: false,
          permitId,
          error: "Failed to navigate to search",
        };
      }

      // 3. Search and open permit
      log(3, 6, `Searching for permit ${permitId}...`);
      const opened = await searchAndOpenPermit(page, permitId);
      if (!opened) {
        return {
          success: false,
          permitId,
          error: `Permit ${permitId} not found or could not open detail page`,
        };
      }

      // 4. Click Close Permit button
      log(4, 6, "Opening close permit dialog...");
      const popup = await clickClosePermitButton(page, context);
      if (!popup) {
        return {
          success: false,
          permitId,
          error: "Could not open close permit popup",
        };
      }

      // 5. Fill the dialog
      log(5, 6, "Filling close permit form...");
      const formState = await fillClosePermitDialog(popup, reason);
      if (!(formState.hasForm && formState.reasonFilled)) {
        await cancelClosePermit(popup);
        return {
          success: false,
          permitId,
          error: "Could not fill close permit form",
        };
      }

      // 6. Confirm closure
      log(6, 6, "Confirming permit closure...");
      const confirmed = await confirmClosePermit(popup, context);
      if (!confirmed) {
        return {
          success: false,
          permitId,
          error: "Could not confirm permit closure",
        };
      }

      return {
        success: true,
        permitId,
      };
    }
  );
}
