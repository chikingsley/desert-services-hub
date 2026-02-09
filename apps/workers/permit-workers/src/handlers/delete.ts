/**
 * Delete Permit Handler
 *
 * Core logic for deleting draft dust permit applications.
 */

import { z } from "zod";
import { deleteAllDraftPermitRecords } from "@/lib/permit-records";
import { deleteAllDrafts } from "@/portal/delete";
import { withBrowser } from "@/portal/utils/browser";

/**
 * Schema for delete operation (AI-tool compatible)
 */
export const deleteSchema = z.object({
  all: z
    .boolean()
    .optional()
    .describe("Delete all draft applications (required for safety)"),
  headless: z
    .boolean()
    .optional()
    .describe("Run browser in headless mode (default: config setting)"),
});

export type DeleteInput = z.infer<typeof deleteSchema>;

export interface DeleteResult {
  success: boolean;
  deletedAll?: boolean;
  deletedDbCount?: number;
  error?: string;
}

/**
 * Delete draft dust permit applications.
 *
 * @param input - Delete parameters
 * @returns Result indicating success or failure
 */
export async function deleteDrafts(input: DeleteInput): Promise<DeleteResult> {
  const { all, headless } = input;

  if (!all) {
    return {
      success: false,
      error: "Must specify --all flag to delete drafts (safety check)",
    };
  }

  return await withBrowser<DeleteResult>(
    { operation: "deleteAll", headless },
    async (instance) => {
      const { page, context } = instance;

      console.log("\n========================================");
      console.log("DELETE ALL DRAFTS");
      console.log("========================================\n");

      const success = await deleteAllDrafts(page, context);
      const deletedDbCount = await deleteAllDraftPermitRecords();

      if (success) {
        console.log("\n--- FINISHED: All drafts deleted successfully ---\n");
      } else {
        console.log(
          "\n--- FINISHED: Some drafts may not have been deleted ---\n"
        );
      }

      return {
        success,
        deletedAll: success,
        deletedDbCount,
      };
    }
  );
}
