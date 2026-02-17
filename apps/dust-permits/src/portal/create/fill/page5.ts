/**
 * Fill Page 5 - Submit
 *
 * Page 5 is the final review/submit step. Handles:
 * - Navigation from Page 4 to Page 5
 * - Setting the "Accelerated Processing" (expedited) checkbox
 * - Clicking "Submit Application" and detecting redirect to Point & Pay
 */

import type { Page } from "playwright";
import type { SubmitResult } from "@/portal/types";
import {
  clickFirstVisibleLocator,
  clickNext,
  getCurrentPage,
  SETTLE_MS,
  setCheckboxWithSelectors,
  sleep,
  waitForElement,
} from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { page5 as page5Selectors } from "@/portal/utils/selectors/page5";

export interface FillPage5Result {
  reachedPage5: boolean;
  currentPage: number | null;
  nextClicked: boolean;
}

/**
 * Move from Page 4 to Page 5 and verify the flow reached Submit.
 */
export async function fillPage5(page: Page): Promise<FillPage5Result> {
  console.log("\n[FILL PAGE 5 - Submit]");

  const nextClicked = await clickNext(page);
  if (!nextClicked) {
    console.log("  Warning: Could not click Next after Page 4");
  }

  await sleep(SETTLE_MS);
  let reachedPage5 = await page
    .isVisible(portal.pageMarkers.page5Submit)
    .catch(() => false);

  // ADF can be slow to swap page panels; give it one more settle window.
  if (!reachedPage5) {
    await sleep(SETTLE_MS);
    reachedPage5 = await page
      .isVisible(portal.pageMarkers.page5Submit)
      .catch(() => false);
  }

  // Fallback: step marker can indicate page 5 even when submit text is delayed.
  const currentPage = await getCurrentPage(page).catch(() => null);
  if (!reachedPage5 && currentPage === 5) {
    reachedPage5 = true;
  }

  return { currentPage, nextClicked, reachedPage5 };
}

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

  const currentPage = await getCurrentPage(page);
  if (currentPage !== 5) {
    console.log(`  ✗ Not on Page 5 (currently on page ${currentPage})`);
    return false;
  }

  const selector = page5Selectors.acceleratedProcessing.yes;
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

/**
 * Submit the application on Page 5.
 *
 * Clicks the submit button and detects whether the browser redirects
 * to Point & Pay (payment portal) or stays on ADF.
 *
 * @param page - Playwright Page instance (must already be on Page 5)
 * @param options.dryRun - If true, verify everything is ready but don't click submit (default: false)
 * @returns SubmitResult with what happened
 */
export async function submitApplication(
  page: Page,
  options?: { dryRun?: boolean }
): Promise<SubmitResult> {
  const dryRun = options?.dryRun ?? false;

  console.log(
    `[SUBMIT] ${dryRun ? "(DRY RUN) " : ""}Submitting application...`
  );

  const currentPage = await getCurrentPage(page);
  if (currentPage !== 5) {
    return {
      applicationId: null,
      error: `Not on Page 5 (currently on page ${currentPage})`,
      redirectedToPayment: false,
      success: false,
    };
  }

  // Read application ID from header
  const applicationId = await page
    .locator(portal.header.applicationId)
    .textContent()
    .then((t) => t?.trim() || null)
    .catch(() => null);

  console.log(`  Application ID: ${applicationId ?? "unknown"}`);

  // Verify submit button is visible
  const submitVisible = await waitForElement(
    page,
    portal.submit.submitApplicationBtn,
    5000
  );

  if (!submitVisible) {
    const textVisible = await waitForElement(
      page,
      portal.submit.submitApplicationText,
      3000
    );
    if (!textVisible) {
      return {
        applicationId,
        error: "Submit button not visible on Page 5",
        redirectedToPayment: false,
        success: false,
      };
    }
  }

  console.log("  Submit button visible");

  if (dryRun) {
    console.log("  [DRY RUN] Stopping before clicking submit");
    return {
      applicationId,
      finalUrl: page.url(),
      redirectedToPayment: false,
      success: true,
    };
  }

  // Click submit
  console.log("  Clicking Submit Application...");
  const urlBefore = page.url();

  const clicked = await clickFirstVisibleLocator(page, [
    portal.submit.submitApplicationLink,
    portal.submit.submitApplicationBtn,
    portal.submit.submitApplicationText,
  ]);

  if (!clicked) {
    return {
      applicationId,
      error: "Failed to click submit button",
      redirectedToPayment: false,
      success: false,
    };
  }

  // Wait for response — either redirect to Point & Pay or ADF state change
  console.log("  Waiting for response...");
  await sleep(3000);

  // Check if we redirected to Point & Pay
  const currentUrl = page.url();
  const redirectedToPayment = currentUrl.includes("pointandpay");

  if (redirectedToPayment) {
    console.log("  Redirected to Point & Pay payment portal");
    await page.waitForLoadState("networkidle").catch(() => null);
    await sleep(2000);
  } else if (currentUrl !== urlBefore) {
    console.log(`  Redirected to: ${currentUrl}`);
  } else {
    console.log("  No redirect — checking for ADF confirmation or error...");
    await sleep(SETTLE_MS);
  }

  return {
    applicationId,
    finalUrl: currentUrl,
    redirectedToPayment,
    success: true,
  };
}
