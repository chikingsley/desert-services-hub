/**
 * Close Permit Flow Utilities
 *
 * Handles closing dust permit applications via the search interface.
 * Provides functions to search for permits, open the close dialog,
 * fill the form, and confirm or cancel the closure.
 *
 * Uses pure Playwright without Stagehand dependencies.
 *
 * @module src/portal/close
 *
 * @example
 * // Search and open a permit, then fill the close dialog (without confirming)
 * const found = await searchAndOpenPermit(page, "D0063581");
 * if (found) {
 *   const popup = await clickClosePermitButton(page, context);
 *   if (popup) {
 *     await fillClosePermitDialog(popup, "Project complete");
 *     await cancelClosePermit(popup); // Don't actually close
 *   }
 * }
 */

import type { BrowserContext, Page } from "playwright";
import {
  clickDustApplicationLinkById,
  clickInFrames,
  findFrameWithSelector,
  SETTLE_MS,
  setCheckbox,
  sleep,
  waitForDustApplicationDetailPage,
  waitForPopup,
} from "./utils/helpers";
import { portal } from "./utils/selectors";

export const DEFAULT_PERMIT_CLOSE_REASON = "Project has been completed.";

/**
 * Search for a permit by ID and open its detail page.
 *
 * Enters the permit ID in the search field, clicks submit,
 * finds the permit link in results, and waits for the detail page.
 *
 * @param page - Playwright Page instance (on the search page)
 * @param permitId - Permit ID to search for (e.g., "D0063581")
 * @returns True if permit was found and detail page loaded
 */
export async function searchAndOpenPermit(
  page: Page,
  permitId: string
): Promise<boolean> {
  console.log(`\n[SEARCH FOR ${permitId}]`);

  // Enter permit number
  console.log("  Entering permit number...");
  const input = page.locator(portal.dustSearch.permitNumberInput);
  await input.fill(permitId);
  await sleep(SETTLE_MS);

  // Click search/submit button
  console.log("  Clicking Submit...");
  const submitBtn = page.locator(portal.dustSearch.submitBtn);
  await submitBtn.click();

  // Wait for results
  console.log("  Waiting for results...");
  await sleep(SETTLE_MS);

  // Find the permit link and click it
  console.log(`  Looking for ${permitId} in results...`);
  const linkClicked = await clickDustApplicationLinkById(page, permitId);

  if (!linkClicked) {
    console.log(`  ✗ Permit ${permitId} not found in search results`);
    return false;
  }

  console.log(`  ✓ Clicked ${permitId}`);

  // Wait for detail page to load
  console.log("  Waiting for detail page...");

  const ok = await waitForDustApplicationDetailPage(page);
  if (ok) {
    console.log("  ✓ Detail page loaded");
    return true;
  }

  console.log("  ✗ Timeout waiting for detail page");
  return false;
}

/**
 * Click the "Close Permit" button on the detail page and wait for popup.
 *
 * Scrolls to the bottom of the page (where the button is), clicks it,
 * and waits for the close permit popup window to open.
 *
 * @param page - Playwright Page instance (on the permit detail page)
 * @param context - Browser context for detecting new windows
 * @returns The popup Page instance, or undefined if popup didn't open
 */
export async function clickClosePermitButton(
  page: Page,
  context: BrowserContext
): Promise<Page | undefined> {
  console.log("\n[CLICK CLOSE PERMIT]");

  // Count pages before clicking
  const pagesBefore = context.pages().length;
  console.log(`  Pages before click: ${pagesBefore}`);

  // Scroll incrementally through the page to trigger lazy loading
  // NOTE: We DON'T use triggerLazyLoad() here because it scrolls back to top,
  // which causes ADF to unload the bottom content. The Close Permit button is
  // at the very bottom of a 31k+ line page, so we must stay at the bottom.
  console.log("  Scrolling to load all content...");
  const scrollStep = 500;
  const maxScrollAttempts = 50; // More attempts for longer pages

  for (let i = 0; i < maxScrollAttempts; i++) {
    const scrollPos = i * scrollStep;
    await page.evaluate((pos) => window.scrollTo(0, pos), scrollPos);
    await sleep(500);

    // Check if we've reached the bottom
    const atBottom = await page.evaluate(
      (pos) => pos >= document.body.scrollHeight - window.innerHeight,
      scrollPos
    );
    if (atBottom) {
      break;
    }
  }

  // Final scroll to absolute bottom and wait
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(SETTLE_MS);
  console.log("  ✓ Scrolled to bottom");

  // Click Close Permit button (should now be visible at bottom)
  console.log("  Looking for Close Permit button...");
  const closeBtn = page.locator(portal.applicationDetail.closePermitBtn);

  const btnCount = await closeBtn.count();
  if (btnCount === 0) {
    console.log("  ✗ Close Permit button not found");
    return undefined;
  }

  try {
    await closeBtn.first().click();
    console.log("  ✓ Clicked Close Permit button");
  } catch {
    console.log("  ✗ Could not click Close Permit button");
    return undefined;
  }

  // Wait for popup window to open
  console.log("  Waiting for close permit popup...");
  const popupPage = await waitForPopup(context, pagesBefore, 20_000);

  if (!popupPage) {
    console.log("  ✗ Close permit popup did not open");
    console.log(`    Pages after: ${context.pages().length}`);
    return undefined;
  }

  // Wait for popup to load
  await popupPage.waitForLoadState("domcontentloaded");
  console.log(
    `  ✓ Close permit popup opened! (${context.pages().length} pages total)`
  );

  // Wait for content to load
  await sleep(SETTLE_MS);

  return popupPage;
}

/**
 * State of the close permit form after filling.
 * Tracks which fields were successfully filled or checked.
 */
export interface ClosePermitFormState {
  acreChecked: boolean;
  buildingsChecked: boolean;
  gravelChecked: boolean;
  hasForm: boolean;
  reasonFilled: boolean;
}

/**
 * Fill the close permit dialog form with reason and checkboxes.
 *
 * Searches frames for the form, fills in the reason textarea,
 * and checks the three required checkboxes (gravel, buildings, acre).
 *
 * Does NOT submit the form - call confirmClosePermit for that.
 *
 * @param popupPage - The close permit popup Page instance
 * @param reason - Reason for closing the permit (default: "Project has been completed.")
 * @returns ClosePermitFormState indicating which fields were filled
 *
 * @example
 * const state = await fillClosePermitDialog(popup, "Project complete");
 * if (state.hasForm && state.reasonFilled) {
 *   console.log("Form ready for submission");
 * }
 */
export async function fillClosePermitDialog(
  popupPage: Page,
  reason = DEFAULT_PERMIT_CLOSE_REASON
): Promise<ClosePermitFormState> {
  console.log("\n[FILL CLOSE PERMIT DIALOG]");
  console.log(`  Popup URL: ${popupPage.url()}`);

  const result: ClosePermitFormState = {
    acreChecked: false,
    buildingsChecked: false,
    gravelChecked: false,
    hasForm: false,
    reasonFilled: false,
  };

  // Find the frame containing the form
  const formFrame = await findFrameWithSelector(
    popupPage,
    portal.closePermit.reasonTextarea
  );
  if (!formFrame) {
    console.log("  ✗ Could not find form in any frame");
    return result;
  }

  result.hasForm = true;

  // Fill reason textarea
  console.log(`  Entering reason: '${reason}'...`);
  try {
    const reasonTextarea = formFrame.locator(portal.closePermit.reasonTextarea);
    await reasonTextarea.fill(reason);
    result.reasonFilled = true;
    console.log("    ✓ Filled reason textarea");
  } catch (error) {
    console.log(`    ✗ Failed to fill reason: ${error}`);
    return result;
  }
  await sleep(SETTLE_MS);

  // Check the three required checkboxes
  console.log("  Checking gravel checkbox...");
  try {
    await setCheckbox(formFrame, portal.closePermit.gravelCheckbox, true);
    result.gravelChecked = true;
  } catch {
    result.gravelChecked = false;
  }
  console.log(`    ${result.gravelChecked ? "✓" : "✗"} Gravel checkbox`);

  console.log("  Checking buildings checkbox...");
  try {
    await setCheckbox(formFrame, portal.closePermit.buildingsCheckbox, true);
    result.buildingsChecked = true;
  } catch {
    result.buildingsChecked = false;
  }
  console.log(`    ${result.buildingsChecked ? "✓" : "✗"} Buildings checkbox`);

  console.log("  Checking less than 0.1 acre checkbox...");
  try {
    await setCheckbox(
      formFrame,
      portal.closePermit.lessThanPointOneAcreCheckbox,
      true
    );
    result.acreChecked = true;
  } catch {
    result.acreChecked = false;
  }
  console.log(
    `    ${result.acreChecked ? "✓" : "✗"} Less than 0.1 acre checkbox`
  );

  console.log("  ✓ Dialog filled");
  return result;
}

/**
 * Check if the close permit confirm button is available.
 *
 * Searches frames for the confirm button. Does NOT click it.
 * Use this to verify the form is ready for submission.
 *
 * @param popupPage - The close permit popup Page instance
 * @returns True if confirm button is found
 */
export async function hasClosePermitConfirmButton(
  popupPage: Page
): Promise<boolean> {
  const frame = await findFrameWithSelector(
    popupPage,
    portal.closePermit.closePermitBtn
  );
  if (frame) {
    console.log("  ✓ Close Permit confirm button found");
    return true;
  }
  return false;
}

/**
 * Click the final "Close Permit" button to confirm closure.
 *
 * **WARNING**: This actually closes the permit permanently!
 * Only call this if you intend to close a real permit.
 * For tests, use hasClosePermitConfirmButton to verify the button exists
 * without actually clicking it.
 *
 * @param popupPage - The close permit popup Page instance
 * @param context - Browser context for popup detection
 * @returns True if button was clicked successfully
 */
export async function confirmClosePermit(
  popupPage: Page,
  context: BrowserContext
): Promise<boolean> {
  console.log("\n[CONFIRM CLOSE PERMIT]");
  console.log(`  Popup URL: ${popupPage.url()}`);

  const clicked = await clickInFrames(
    popupPage,
    portal.closePermit.closePermitBtn
  );

  if (!clicked) {
    console.log("  ✗ Could not find Close Permit button in any frame");
    return false;
  }

  // Wait for popup to process
  await sleep(SETTLE_MS);

  // If popup still open, click cancel to close
  const pagesAfter = context.pages();
  if (pagesAfter.length > 1) {
    console.log("    Clicking Cancel to close popup...");
    await clickInFrames(popupPage, portal.closePermit.cancelBtn);
  }

  await sleep(SETTLE_MS);
  console.log("  ✓ Close permit confirmed");
  return true;
}

/**
 * Close the popup without confirming the permit closure.
 *
 * First tries to click the Cancel button. If not found, falls back
 * to closing the popup window directly.
 *
 * Use this in tests to exit the close dialog without actually
 * closing the permit.
 *
 * @param popupPage - The close permit popup Page instance
 * @returns True if popup was closed (via Cancel or window close)
 */
export async function cancelClosePermit(popupPage: Page): Promise<boolean> {
  console.log("\n[CANCEL CLOSE PERMIT]");

  // Try to find and click Cancel button
  const clicked = await clickInFrames(popupPage, portal.closePermit.cancelBtn);

  if (clicked) {
    await sleep(SETTLE_MS);
    return true;
  }

  // Fallback: close the popup window
  console.log("  No Cancel button found, closing popup window...");
  try {
    await popupPage.close();
    console.log("  ✓ Popup closed");
    return true;
  } catch {
    console.log("  ✗ Could not close popup");
    return false;
  }
}

// ============================================================================
// High-Level Orchestration
// ============================================================================

/**
 * Close a permit by ID - complete flow.
 *
 * Navigates to search, finds the permit, opens the close dialog,
 * fills the form, and confirms the closure.
 *
 * **WARNING**: This actually closes the permit permanently!
 *
 * @param page - Playwright Page instance (logged in)
 * @param context - Browser context for popup detection
 * @param permitId - Permit ID to close (e.g., "D0063581")
 * @param reason - Reason for closing (default: "Project has been completed.")
 * @returns Result with success flag and optional error message
 */
export async function closePermit(
  page: Page,
  context: BrowserContext,
  permitId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`\n=== CLOSING PERMIT: ${permitId} ===\n`);

  // 1. Navigate to dust search
  console.log("[1/4] Navigating to dust search...");
  const { navigateToMyDustApps, navigateToDustSearch } = await import(
    "./utils/helpers"
  );

  await navigateToMyDustApps(page);
  const atSearch = await navigateToDustSearch(page);
  if (!atSearch) {
    return { error: "Failed to navigate to search", success: false };
  }
  console.log("  ✓ At search page\n");

  // 2. Search and open permit
  console.log("[2/4] Searching for permit...");
  const opened = await searchAndOpenPermit(page, permitId);
  if (!opened) {
    return { error: `Permit ${permitId} not found`, success: false };
  }
  console.log("  ✓ Permit detail page loaded\n");

  // 3. Click close button and get popup
  console.log("[3/4] Opening close permit dialog...");
  const popup = await clickClosePermitButton(page, context);
  if (!popup) {
    return { error: "Failed to open close dialog", success: false };
  }
  console.log("  ✓ Close dialog opened\n");

  // 4. Fill and confirm
  console.log("[4/4] Filling and confirming...");
  await fillClosePermitDialog(popup, reason || DEFAULT_PERMIT_CLOSE_REASON);
  const confirmed = await confirmClosePermit(popup, context);

  if (confirmed) {
    console.log(`\n=== ✓ PERMIT ${permitId} CLOSED ===\n`);
    return { success: true };
  }

  return { error: "Failed to confirm close", success: false };
}
