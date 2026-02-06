/**
 * Page 5 State Verification
 *
 * Checks the current state of Page 5 (Review & Submit) form fields.
 * Used exclusively in E2E tests for assertions and debugging.
 */

import type { Page } from "playwright";
import type { Page5State } from "@/portal/types";
import { getCurrentPage } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";

/**
 * Get verification state for Page 5 (Review & Submit).
 *
 * @returns Page5State with submit button visibility and page number
 */
export async function getPage5State(page: Page): Promise<Page5State> {
  const hasSubmitButton = await page
    .locator(portal.pageMarkers.page5Submit)
    .isVisible()
    .catch(() => false);
  const pageNumber = await getCurrentPage(page);

  return {
    hasSubmitButton,
    pageNumber: pageNumber ?? 0,
  };
}
