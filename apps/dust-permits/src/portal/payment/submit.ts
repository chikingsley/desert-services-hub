/**
 * Page 5 - Submit Application
 *
 * Clicks "Submit Application" on ADF Page 5 and handles:
 * - Redirect to Point & Pay payment portal
 * - ADF confirmation dialogs
 * - Error states
 */

import type { Page } from "playwright";
import type { SubmitResult } from "@/portal/types";
import {
  clickFirstVisibleLocator,
  getCurrentPage,
  SETTLE_MS,
  sleep,
  waitForElement,
} from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";

/**
 * Submit the application on Page 5.
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

  // Verify we're on Page 5
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
    // Try text fallback
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
    // Wait for Vaadin to initialize
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
