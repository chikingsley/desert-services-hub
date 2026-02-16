/**
 * Delete Flow Utilities
 *
 * Handles deleting draft dust permit applications from the Maricopa County
 * dust permit portal. Provides functions to find, open, and delete drafts.
 *
 * Uses pure Playwright without Stagehand dependencies.
 *
 * @module src/portal/delete
 *
 * @example
 * // Delete a specific draft by ID
 * const deleted = await deleteByApplicationId(page, context, "D0063581");
 *
 * @example
 * // Delete the first draft in the list
 * const deleted = await deleteSingleDraft(page, context);
 */

import type { BrowserContext, Page } from "playwright";
import {
  clickApplicationWithRetry,
  clickDustApplicationLinkByIndex,
  clickInFrames,
  listApplicationIds,
  navigateToMyDustApps,
  SETTLE_MS,
  sleep,
  triggerLazyLoad,
  waitForDustApplicationDetailPage,
  waitForElement,
  waitForPopup,
} from "./utils/helpers";
import { portal } from "./utils/selectors";

/**
 * State information about the current page view.
 * Used to determine if we're on the detail page or still on the list.
 */
export interface DetailState {
  hasDeleteBtn: boolean;
  hasDetailForm: boolean;
  stillOnList: boolean;
}

/**
 * Check DOM markers to determine the current page state.
 *
 * Checks for the presence of delete button, detail form, and
 * draft table to determine if we're on detail or list view.
 *
 * @param page - Playwright Page instance
 * @returns DetailState object with boolean flags for each marker
 */
export async function getDetailState(page: Page): Promise<DetailState> {
  return await page.evaluate(
    (sels) => {
      const hasDeleteBtn = document.querySelector(sels.deleteBtn) !== null;
      const hasDetailForm =
        document.querySelector(sels.detailForm) !== null ||
        document.querySelector(sels.detailFormAlt) !== null;
      const stillOnList =
        document.querySelector(sels.draftTable) !== null ||
        document.body?.textContent?.includes("Draft Dust Applications");
      return { hasDeleteBtn, hasDetailForm, stillOnList };
    },
    {
      deleteBtn: portal.applicationDetail.deleteBtn,
      detailForm: portal.applicationDetail.detailForm,
      detailFormAlt: portal.applicationDetail.detailFormAlt,
      draftTable: portal.dustApps.draftTable,
    }
  );
}

/**
 * Count how many draft application links exist on the current page view.
 *
 * Scans the draft table for links matching the dust application ID pattern
 * (D followed by 7 digits, e.g., D0063072).
 *
 * NOTE: The draft table is paginated (max 25 items visible per page).
 * This counts only visible items - use to check if drafts exist, not for totals.
 *
 * @param page - Playwright Page instance
 * @returns Number of draft application links found on current page
 */
export async function countDraftApps(page: Page): Promise<number> {
  // Wait for page to be stable before counting (avoid "execution context destroyed" errors)
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait for page to be stable
      await page
        .waitForLoadState("domcontentloaded", { timeout: 5000 })
        .catch(() => {
          /* ignore timeout */
        });
      await sleep(SETTLE_MS);

      // Try to count apps
      const apps = await listApplicationIds(page, portal.dustApps.draftTable);
      return apps.length;
    } catch (error) {
      if (attempt < maxRetries) {
        // If execution context was destroyed, wait and retry
        await sleep(SETTLE_MS * 2);
        continue;
      }
      // Last attempt failed, return 0
      console.log(
        `  ⚠ countDraftApps failed after ${maxRetries} attempts: ${error}`
      );
      return 0;
    }
  }
  return 0;
}

/**
 * Find the first draft application link in the draft table.
 *
 * Scans up to 250 links looking for the first one matching the
 * dust application ID pattern (D followed by 7 digits).
 *
 * @param page - Playwright Page instance
 * @returns Object with appNum and linkIndex, or null if not found
 *
 * @example
 * const found = await findFirstDraftAppLink(page);
 * if (found) {
 *   console.log(`Found: ${found.appNum} at index ${found.linkIndex}`);
 * }
 */
export async function findFirstDraftAppLink(
  page: Page
): Promise<{ appNum: string; linkIndex: number } | null> {
  const apps = await listApplicationIds(page);
  const firstApp = apps[0];
  if (!firstApp) {
    return null;
  }
  return { appNum: firstApp.id, linkIndex: firstApp.index };
}

/**
 * Click a draft application link at the specified index.
 *
 * Scrolls to top and waits for stability before clicking.
 * Uses the improved helper with fallback to evaluate click.
 *
 * @param page - Playwright Page instance
 * @param linkIndex - Zero-based index of the link in the draft table
 * @returns True if click succeeded, false otherwise
 */
export async function clickDraftLinkAtIndex(
  page: Page,
  linkIndex: number
): Promise<boolean> {
  // Scroll to top before finding links (matches scrape.ts pattern)
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(SETTLE_MS);

  const result = await clickDustApplicationLinkByIndex(
    page,
    linkIndex,
    portal.dustApps.draftTable
  );

  return result.success;
}

/**
 * Click a draft link by matching its text content via DOM evaluation.
 *
 * Used as a fallback when clicking by index fails. Searches all
 * anchor elements for one matching the exact application number.
 *
 * @param page - Playwright Page instance
 * @param appNum - Application number to find and click (e.g., "D0063072")
 * @returns True if link was found and clicked
 */
async function _clickDraftLinkByTextViaDom(
  page: Page,
  appNum: string
): Promise<boolean> {
  return await page.evaluate((targetApp) => {
    const links = [...document.querySelectorAll("a")];
    const link = links.find((a) => (a.textContent || "").trim() === targetApp);
    if (link) {
      (link as HTMLElement).click();
    }
    return Boolean(link);
  }, appNum);
}

/**
 * Find and open the first draft application from the list.
 *
 * Scrolls to top, finds the first draft link, clicks it, and waits
 * for the detail page to load. Includes retry logic if still on list.
 *
 * @param page - Playwright Page instance
 * @returns The application number that was opened, or null on failure
 */
export async function clickFirstDraftApp(page: Page): Promise<string | null> {
  console.log("  Looking for draft applications...");

  await triggerLazyLoad(page);

  const found = await findFirstDraftAppLink(page);
  if (!found) {
    console.log("    ✗ No draft applications found");
    return null;
  }

  console.log(`    Found: ${found.appNum}`);

  const clicked = await clickDraftLinkAtIndex(page, found.linkIndex);
  if (!clicked) {
    console.log("    ✗ Click failed");
    return null;
  }
  console.log(`    ✓ Clicked ${found.appNum}`);

  // Wait for navigation to settle before checking state
  await sleep(SETTLE_MS);

  // Quick retry if still on list
  const quickState = await getDetailState(page).catch(() => ({
    hasDeleteBtn: false,
    hasDetailForm: false,
    stillOnList: true,
  }));
  if (
    quickState.stillOnList &&
    !quickState.hasDeleteBtn &&
    !quickState.hasDetailForm
  ) {
    console.log("    Retrying click (still on list)...");
    await clickDraftLinkAtIndex(page, found.linkIndex);
  }

  // Wait for detail page
  console.log("    Waiting for detail page...");
  const ok = await waitForDustApplicationDetailPage(page);

  if (ok) {
    console.log("    ✓ Detail page loaded");
    return found.appNum;
  }

  console.log("    ✗ Timeout waiting for detail page");
  return null;
}

/**
 * Delete the currently open application.
 *
 * Must be on the application detail page. Clicks the delete button,
 * waits for the confirmation popup, clicks confirm, and handles cleanup.
 *
 * @param page - Playwright Page instance (on the application detail page)
 * @param context - Browser context for popup handling
 * @returns True if application was deleted successfully
 */
export async function deleteApplication(
  page: Page,
  context: BrowserContext
): Promise<boolean> {
  console.log("  Deleting application...");

  // Close any other open popups first
  const allPages = context.pages();
  if (allPages.length > 1) {
    console.log("    Closing other popups...");
    for (let i = allPages.length - 1; i > 0; i--) {
      const popup = allPages[i];
      if (popup && popup !== page) {
        try {
          await popup.close();
        } catch {
          // Ignore
        }
      }
    }
    await sleep(SETTLE_MS);
  }

  await sleep(SETTLE_MS);
  const pagesBefore = context.pages().length;

  // Click delete button
  console.log("    Clicking Delete button...");
  const clicked = await page
    .locator(portal.applicationDetail.deleteBtn)
    .first()
    .click()
    .then(() => true)
    .catch(() => false);

  if (!clicked) {
    console.log("    ✗ Delete button not found");
    return false;
  }
  console.log("    ✓ Clicked Delete");

  // Wait for delete confirmation popup
  console.log("    Waiting for confirmation popup...");
  const deletePopup = await waitForPopup(context, pagesBefore);
  if (!deletePopup) {
    console.log("    ✗ Popup did not open");
    return false;
  }

  await deletePopup.waitForLoadState("domcontentloaded");
  console.log("    ✓ Popup opened");

  // Wait longer for popup content to fully load (ADF is slow)
  await sleep(SETTLE_MS);

  // Click confirm delete
  console.log("    Confirming delete...");
  const confirmClicked = await clickInFrames(
    deletePopup,
    portal.deletePopup.confirmDeleteBtn
  );

  if (!confirmClicked) {
    console.log("    ✗ Could not confirm delete");
    return false;
  }

  // Wait for popup to process
  await sleep(SETTLE_MS);

  // If popup still open, click cancel to close
  const pagesAfter = context.pages();
  if (pagesAfter.length > 1) {
    console.log("    Clicking Cancel to close popup...");
    await clickInFrames(deletePopup, portal.deletePopup.cancelBtn);
  }

  await sleep(SETTLE_MS);
  console.log("  ✓ Application deleted");
  return true;
}

/**
 * Delete a single draft application from the list.
 *
 * Navigates to My Dust Applications, waits for the draft table,
 * opens the first draft, and deletes it.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @returns True if deleted (or no drafts exist), false on error
 *
 * @example
 * const deleted = await deleteSingleDraft(page, context);
 * if (deleted) {
 *   console.log("Draft deleted or no drafts exist");
 * }
 */
export async function deleteSingleDraft(
  page: Page,
  context: BrowserContext
): Promise<boolean> {
  // Navigate to Dust Apps
  if (!(await navigateToMyDustApps(page))) {
    return false;
  }

  // Wait for table to be ready (similar to deleteAllDrafts fix)
  await waitForElement(page, portal.dustApps.newApplicationBtn, 15_000);
  await waitForElement(page, portal.dustApps.draftTable, 15_000);

  // Give the table a moment to fully render
  await sleep(SETTLE_MS);

  // Count drafts
  const count = await countDraftApps(page);
  console.log(`  Found ${count} draft application(s)`);

  if (count === 0) {
    console.log("  No drafts to delete");
    return true; // Success - nothing to delete
  }

  // Open first draft
  const appNum = await clickFirstDraftApp(page);
  if (!appNum) {
    return false;
  }

  await sleep(SETTLE_MS);

  // Delete it
  return await deleteApplication(page, context);
}

/**
 * Delete all draft applications from the list.
 *
 * Navigates to My Dust Applications and deletes every draft one by one
 * until none remain.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @returns True if all drafts were deleted, false if an error occurred
 */
export async function deleteAllDrafts(
  page: Page,
  context: BrowserContext
): Promise<boolean> {
  console.log("\n[DELETE ALL DRAFTS]");

  // 1. Navigate to Dust Apps
  if (!(await navigateToMyDustApps(page))) {
    console.log("  ✗ Failed to navigate to My Dust Apps");
    return false;
  }

  // 2. Loop until no deletable drafts remain
  let deletedCount = 0;
  const failedIds = new Set<string>();

  while (true) {
    // Wait for page to stabilize (ADF does background updates)
    await page.waitForLoadState("domcontentloaded");
    await sleep(SETTLE_MS);

    // Check if we're on a "No drafts found" or empty state page
    const hasNoDrafts = await page.evaluate(
      () =>
        document.body?.innerText?.toLowerCase().includes("no draft") ||
        document.body?.innerText?.toLowerCase().includes("no applications") ||
        !document.querySelector("table")
    );

    if (hasNoDrafts) {
      console.log(`\n  ✓ All drafts deleted. Total: ${deletedCount}`);
      return true;
    }

    // Wait for table to be ready (but with shorter timeout to avoid hanging)
    await waitForElement(page, portal.dustApps.newApplicationBtn, 10_000);
    const tableExists = await waitForElement(
      page,
      portal.dustApps.draftTable,
      5000
    );

    if (!tableExists) {
      console.log(
        `\n  ✓ All drafts deleted (no table). Total: ${deletedCount}`
      );
      return true;
    }

    // Refresh draft list - ONLY from draft table container
    const allApps = await listApplicationIds(page, portal.dustApps.draftTable);
    const deletableApps = allApps.filter((app) => !failedIds.has(app.id));

    if (deletableApps.length === 0) {
      if (failedIds.size > 0) {
        console.log(
          `\n  ⚠ Finished. Deleted: ${deletedCount}. Non-deletable: ${failedIds.size} (${[...failedIds].join(", ")})`
        );
      } else {
        console.log(`\n  ✓ All drafts deleted. Total: ${deletedCount}`);
      }
      return true;
    }

    const targetApp = deletableApps[0];
    if (!targetApp) {
      continue; // Should not happen due to length check above
    }

    console.log(
      `\n  --- Deleting draft ${deletedCount + 1} (ID: ${targetApp.id}, index: ${targetApp.index}) ---`
    );

    // Click the draft using retry mechanism with multiple strategies
    console.log("  Clicking draft link (with retry)...");
    const clickResult = await clickApplicationWithRetry(
      page,
      targetApp.index,
      portal.dustApps.draftTable,
      true // Enable debug logging
    );

    if (!clickResult.success) {
      console.log(
        `  ✗ Failed to click draft ${targetApp.id} after ${clickResult.attempts} attempts. Skipping...`
      );
      failedIds.add(targetApp.id);
      continue;
    }
    console.log(
      `  ✓ Clicked with strategy: ${clickResult.strategy} (attempt ${clickResult.attempts})`
    );

    // Wait for detail page to fully load (clickApplicationWithRetry already verified navigation started)
    const detailOk = await waitForDustApplicationDetailPage(page, {
      midwayFallbackAppNum: targetApp.id,
      timeout: 15_000,
    });
    console.log(`  Detail page result: ${detailOk}`);

    if (!detailOk) {
      console.log(
        `  ✗ Detail page did not load for ${targetApp.id}. Skipping...`
      );
      failedIds.add(targetApp.id);
      await navigateToMyDustApps(page);
      continue;
    }

    const success = await deleteApplication(page, context);
    if (success) {
      deletedCount++;
    } else {
      console.log(`  ✗ Failed to delete draft ${targetApp.id}. Skipping...`);
      failedIds.add(targetApp.id);
    }

    // Navigate back to the list
    if (!(await navigateToMyDustApps(page))) {
      console.log("  ✗ Failed to return to My Dust Apps");
      return false;
    }

    // Wait for table to be ready after navigation (similar to scrape flow fix)
    await waitForElement(page, portal.dustApps.newApplicationBtn, 10_000);
    await waitForElement(page, portal.dustApps.draftTable, 5000);

    // Wait between deletes to let ADF stabilize
    await sleep(SETTLE_MS);
  }
}

/**
 * Find a specific draft application by its ID in the draft table.
 *
 * @param page - Playwright Page instance
 * @param appId - Application ID to find (e.g., "D0063072")
 * @returns Object with found flag and linkIndex (-1 if not found)
 */
export async function findDraftByAppId(
  page: Page,
  appId: string
): Promise<{ found: boolean; linkIndex: number }> {
  const apps = await listApplicationIds(page);
  const match = apps.find((a) => a.id === appId);

  if (match) {
    return { found: true, linkIndex: match.index };
  }

  return { found: false, linkIndex: -1 };
}

/**
 * Delete a specific draft application by its ID.
 *
 * Navigates to My Dust Applications, finds the specified draft,
 * opens it, and deletes it. Use this when you need to delete
 * a specific application rather than just the first one.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @param appId - Application ID to delete (e.g., "D0063581")
 * @returns True if deleted, false if not found or deletion failed
 *
 * @example
 * const deleted = await deleteByApplicationId(page, context, "D0063581");
 * if (!deleted) {
 *   console.log("Could not delete - application may not exist");
 * }
 */
export async function deleteByApplicationId(
  page: Page,
  context: BrowserContext,
  appId: string
): Promise<boolean> {
  console.log(`\n[DELETE BY ID: ${appId}]`);

  // Navigate to Dust Apps
  if (!(await navigateToMyDustApps(page))) {
    console.log("  ✗ Failed to navigate to Dust Apps");
    return false;
  }

  // Wait for table to be ready (similar to deleteAllDrafts fix)
  await waitForElement(page, portal.dustApps.newApplicationBtn, 10_000);
  await waitForElement(page, portal.dustApps.draftTable, 5000);

  // Give the table a moment to fully render
  await sleep(SETTLE_MS);

  // Find the specific draft
  console.log(`  Looking for ${appId}...`);
  const result = await findDraftByAppId(page, appId);

  if (!result.found) {
    console.log(`  ✗ Draft ${appId} not found`);
    return false;
  }

  console.log(`  ✓ Found at index ${result.linkIndex}`);

  // Click the draft using retry mechanism (more reliable)
  console.log("  Clicking draft link (with retry)...");
  const clickResult = await clickApplicationWithRetry(
    page,
    result.linkIndex,
    portal.dustApps.draftTable,
    false // Disable debug logging
  );

  if (!clickResult.success) {
    console.log(
      `  ✗ Failed to click draft after ${clickResult.attempts} attempts`
    );
    return false;
  }
  console.log(
    `  ✓ Clicked with strategy: ${clickResult.strategy} (attempt ${clickResult.attempts})`
  );

  // Wait for detail page to fully load
  const detailOk = await waitForDustApplicationDetailPage(page, {
    midwayFallbackAppNum: appId,
    timeout: 15_000,
  });

  if (!detailOk) {
    console.log("  ✗ Detail page did not load");
    return false;
  }

  console.log("  ✓ On detail page");

  await sleep(SETTLE_MS);

  // Delete it
  const deleted = await deleteApplication(page, context);

  if (deleted) {
    console.log(`  ✓ Deleted ${appId}`);
    // After deletion, give the page time to process and update
    await sleep(SETTLE_MS);
  } else {
    console.log(`  ✗ Failed to delete ${appId}`);
  }

  return deleted;
}
