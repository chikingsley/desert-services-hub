/**
 * Company Permits Sync Service
 *
 * Handles the automated download of the company's own permits
 * (Drafts, Submitted, etc.) from the "My Dust Control Applications" page.
 *
 * @module src/portal/sync-company
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { navigateToMyDustApps, SETTLE_MS, sleep } from "./utils/helpers";
import { portal } from "./utils/selectors";

/**
 * Downloads the "Export to Excel" file from the Maricopa portal.
 * Handles navigation to My Dust Control Applications page internally.
 *
 * @param page Playwright Page object (must be logged in)
 * @returns Path to the downloaded .xls file
 */
export async function downloadCompanyPermits(page: Page): Promise<string> {
  console.log("\n[COMPANY PERMITS SYNC]");

  // Navigate to My Dust Control Applications
  console.log("  Navigating to My Dust Control Applications...");
  const navSuccess = await navigateToMyDustApps(page);
  if (!navSuccess) {
    console.log("    ✗ Failed to navigate to My Dust Control Applications");
    throw new Error("Failed to navigate to My Dust Control Applications");
  }
  console.log("    ✓ At My Dust Control Applications");

  // Set up download listener
  console.log("  Triggering Export to Excel download...");
  const downloadPromise = page.waitForEvent("download");

  // Click the export button
  const exportBtn = page.locator(portal.dustApps.exportToExcelBtn);
  await exportBtn.click();
  await sleep(SETTLE_MS);

  const download = await downloadPromise;

  // Save to a temporary location
  const tempPath = join(tmpdir(), `dust-apps-${Date.now()}.xls`);
  await download.saveAs(tempPath);

  console.log(`\n=== ✓ DOWNLOADED: ${tempPath} ===\n`);

  return tempPath;
}
