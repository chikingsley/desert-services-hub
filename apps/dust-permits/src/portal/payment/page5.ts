/**
 * Page 5 - Expedited Processing Checkbox
 *
 * Sets the "Accelerated Processing" checkbox on the ADF Page 5.
 * Uses setCheckboxWithSelectors for fallback handling.
 */

import type { Page } from "playwright";
import {
  getCurrentPage,
  setCheckboxWithSelectors,
} from "@/portal/utils/helpers";
import { page5 } from "@/portal/utils/selectors/page5";

/**
 * Set the expedited (accelerated) processing checkbox on Page 5.
 *
 * @param page - Playwright Page instance (must already be on Page 5)
 * @param enabled - true to check, false to uncheck
 * @returns true if the checkbox was set successfully
 */
export async function checkExpedited(
  page: Page,
  enabled: boolean
): Promise<boolean> {
  console.log(
    `[PAGE 5] Setting expedited processing: ${enabled ? "Yes" : "No"}`
  );

  // Verify we're on Page 5
  const currentPage = await getCurrentPage(page);
  if (currentPage !== 5) {
    console.log(`  ✗ Not on Page 5 (currently on page ${currentPage})`);
    return false;
  }

  const selector = page5.acceleratedProcessing.yes;
  if (!selector) {
    console.log("  ✗ No selector defined for accelerated processing");
    return false;
  }

  const result = await setCheckboxWithSelectors(
    page,
    [selector],
    enabled,
    "Accelerated Processing"
  );

  return result.success;
}
