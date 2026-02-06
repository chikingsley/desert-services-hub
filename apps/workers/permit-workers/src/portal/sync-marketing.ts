/**
 * Marketing Permits Sync Service
 *
 * Handles the automated download of marketing-related permits (Active and Submitted status)
 * from the Maricopa County portal search page.
 *
 * @module src/portal/sync-marketing
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  navigateToDustSearch,
  navigateToMyDustApps,
  SETTLE_MS,
  sleep,
  waitForElement,
} from "./utils/helpers";
import { portal } from "./utils/selectors";

/**
 * Downloads the marketing permits export from the search page.
 * Navigates to My Dust Apps -> Search, selects ALL status filters, and triggers download.
 *
 * @param page Playwright Page object (must be logged in)
 * @returns Path to the downloaded .xls file
 */
export async function downloadMarketingPermits(page: Page): Promise<string> {
  console.log("\n[MARKETING PERMITS SYNC]");

  // Set a generous timeout for portal interactions
  page.setDefaultTimeout(60_000);

  // First navigate to My Dust Control Applications
  console.log("  Navigating to My Dust Control Applications...");
  const navToApps = await navigateToMyDustApps(page);
  if (!navToApps) {
    console.log("    ✗ Failed to navigate to My Dust Control Applications");
    throw new Error(
      `Failed to navigate to My Dust Control Applications. Current URL: ${page.url()}`
    );
  }
  console.log("    ✓ At My Dust Control Applications");

  // Then navigate to search
  console.log("  Navigating to Search page...");
  const navigated = await navigateToDustSearch(page);
  if (!navigated) {
    console.log("    ✗ Failed to navigate to Search page");
    throw new Error(
      `Failed to navigate to Search page. Current URL: ${page.url()}`
    );
  }
  console.log("    ✓ At Search page");

  // Wait for search criteria to be visible
  console.log("  Waiting for status dropdown...");
  await page
    .locator(portal.dustSearch.statusDropdown)
    .waitFor({ state: "visible", timeout: 20_000 });

  // Select ALL status options using page.evaluate (like scrape.ts)
  // Values: 0=Active, 1=Closed, 2=Rejected, 3=Submitted, 4=Superseded
  console.log("  Selecting all status filters...");
  const allStatusValues = ["0", "1", "2", "3", "4"];
  const selected = await page.evaluate(
    ({ values, statusSel }) => {
      const select = document.querySelector(
        statusSel
      ) as HTMLSelectElement | null;
      if (!select) {
        return { success: false, reason: "select not found" };
      }

      for (const option of Array.from(select.options)) {
        option.selected = values.includes(option.value);
      }

      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true, reason: "" };
    },
    { values: allStatusValues, statusSel: portal.dustSearch.statusDropdown }
  );

  if (!selected.success) {
    console.log(`    ✗ ${selected.reason}`);
    throw new Error(`Failed to select status filters: ${selected.reason}`);
  }
  console.log(
    "    ✓ Selected: Active, Closed, Rejected, Submitted, Superseded"
  );
  await sleep(SETTLE_MS);

  // Trigger search
  console.log("  Clicking Submit...");
  await page.locator(portal.dustSearch.submitLink).first().click();
  await sleep(SETTLE_MS);

  // Wait for results table using waitForElement (like scrape.ts)
  console.log("  Waiting for results table...");
  const tableSelector = '[id*="dcpSearchTable"]';
  const tableVisible = await waitForElement(page, tableSelector, 60_000);
  if (!tableVisible) {
    console.log("    ✗ Search results table did not appear");

    // Save native diagnostics
    const timestamp = Date.now();
    const screenshotPath = join(
      tmpdir(),
      `marketing-sync-fail-${timestamp}.png`
    );
    const htmlPath = join(tmpdir(), `marketing-sync-fail-${timestamp}.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await writeFile(htmlPath, await page.content());

    console.error(`📸 Screenshot saved: ${screenshotPath}`);
    console.error(`📄 HTML content saved: ${htmlPath}`);

    throw new Error("Search results table did not appear");
  }
  console.log("    ✓ Results loaded");
  await sleep(SETTLE_MS);

  // Set up download listener
  console.log("  Triggering Export to Excel...");
  const downloadPromise = page.waitForEvent("download");

  // Click the export button in the results table
  await page.click(portal.dustSearch.exportToExcelBtn);

  const download = await downloadPromise;

  // Save to a temporary location
  const tempPath = join(tmpdir(), `marketing-permits-${Date.now()}.xls`);
  await download.saveAs(tempPath);

  console.log(`\n=== ✓ DOWNLOADED: ${tempPath} ===\n`);

  return tempPath;
}
