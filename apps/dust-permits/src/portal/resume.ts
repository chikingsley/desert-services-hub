/**
 * Resume Flow - Navigate to existing application, read data, update Page 4, reach Page 5
 *
 * This module handles resuming draft applications:
 * 1. Navigate to My Dust Control Applications
 * 2. Find and click on the draft application
 * 3. Navigate to Page 2, read disturbed acres
 * 4. Navigate to Page 4, fill with correct settings
 * 5. Click Next to reach Page 5
 */

import type { Page } from "playwright";
import type { DeepPartial, FormData } from "@/form-data";
import { buildFormData, DEFAULTS } from "@/form-data";
import { fillPage4 as fillPage4Module } from "./create";
import {
  clickNext,
  clickRadioWithSelectors,
  getCurrentPage,
  navigateToMyDustApps,
  SETTLE_MS,
  sleep,
  waitForElement,
} from "./utils/helpers";
import { portal } from "./utils/selectors";
import { coordinator, project } from "./utils/selectors/page3";

const NAVIGATION_TIMEOUT = 15_000;
const USER_ACTION_TIMEOUT = 300_000; // 5 minutes for manual steps

/**
 * Page 3 settings
 */
interface Page3Settings {
  coordinatorSameAsContact: boolean; // Default: Yes
  demolitionRenovation: boolean; // Default: No
}

const DEFAULT_PAGE3_SETTINGS: Page3Settings = {
  coordinatorSameAsContact: true,
  demolitionRenovation: false,
};

/**
 * Fill Page 3 - Answer the coordinator and demolition questions.
 *
 * Uses clickRadioWithSelectors for primary + fallback selector handling.
 * siTable indices vary by application type, so fallbacks cover known layouts.
 */
async function fillPage3(
  page: Page,
  settings: Partial<Page3Settings> = {}
): Promise<boolean> {
  console.log("[FILL PAGE 3] Answering Page 3 questions...");

  const opts = { ...DEFAULT_PAGE3_SETTINGS, ...settings };

  try {
    // Question 1: Is coordinator same as primary contact?
    const coordSelector = opts.coordinatorSameAsContact
      ? [coordinator.yes, ...coordinator.yesFallbacks]
      : [coordinator.no, ...coordinator.noFallbacks];
    await clickRadioWithSelectors(
      page,
      coordSelector,
      `Coordinator same as contact: ${opts.coordinatorSameAsContact ? "Yes" : "No"}`
    );

    // Question 2: Does project include demolition/renovation?
    const demoSelector = opts.demolitionRenovation
      ? [project.hasDemolition.yes, ...project.hasDemolition.yesFallbacks]
      : [project.hasDemolition.no, ...project.hasDemolition.noFallbacks];
    await clickRadioWithSelectors(
      page,
      demoSelector,
      `Demolition/renovation: ${opts.demolitionRenovation ? "Yes" : "No"}`
    );

    console.log("  Page 3 complete");
    return true;
  } catch (error) {
    console.error("  Failed to fill Page 3:", error);
    return false;
  }
}

/**
 * Wait for user to complete Page 2 and advance to Page 3
 * Polls every 3 seconds until Page 3 content is detected
 */
async function waitForPage3(page: Page): Promise<boolean> {
  console.log("\n========================================");
  console.log("[WAITING] Please complete Page 2 manually:");
  console.log("  1. Select the correct address on the map");
  console.log("  2. Click Next to proceed to Page 3");
  console.log("========================================\n");

  const pollInterval = 3000; // 3 seconds
  const maxAttempts = Math.floor(USER_ACTION_TIMEOUT / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const current = await getCurrentPage(page);
      if (current === 3) {
        console.log("[WAITING] Page 3 detected! Continuing automation...\n");
        return true;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (
        errorMsg.includes("Execution context was destroyed") ||
        errorMsg.includes("navigation")
      ) {
        console.log(
          "[WAITING] Navigation detected, waiting for page to settle..."
        );
        // Wait for page to stabilize after navigation
        await page.waitForLoadState("domcontentloaded").catch(() => null);
        await sleep(SETTLE_MS);
        continue;
      }
      throw error;
    }

    if (i > 0 && i % 10 === 0) {
      const elapsed = (i * pollInterval) / 1000;
      console.log(`[WAITING] Still waiting... (${elapsed}s elapsed)`);
    }

    await sleep(pollInterval);
  }

  console.error("[WAITING] Timed out waiting for Page 3");
  return false;
}

/**
 * Navigate to My Dust Control Applications page
 */
async function navigateToMyApps(page: Page): Promise<boolean> {
  console.log("[RESUME] Navigating to My Dust Control Applications...");
  return await navigateToMyDustApps(page);
}

/**
 * Find and open a draft application by permit number
 */
async function openDraftApplication(
  page: Page,
  permitNumber: string
): Promise<boolean> {
  console.log(`[RESUME] Opening draft application: ${permitNumber}`);

  try {
    const linkSelector = `a:has-text("${permitNumber}")`;
    const link = page.locator(linkSelector).first();

    if ((await link.count()) === 0) {
      console.error(`  Application ${permitNumber} not found in drafts`);
      return false;
    }

    await link.click();
    // Wait for detail form to appear after navigation
    const ok = await waitForElement(
      page,
      portal.applicationDetail.detailForm,
      NAVIGATION_TIMEOUT
    );
    await sleep(SETTLE_MS);
    if (ok) {
      console.log(`  Opened application ${permitNumber}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`  Failed to open application ${permitNumber}:`, error);
    return false;
  }
}

/**
 * Navigate to a specific page using the step navigation sidebar
 */
async function navigateToPage(
  page: Page,
  pageNumber: 1 | 2 | 3 | 4 | 5
): Promise<boolean> {
  console.log(`[RESUME] Navigating to Page ${pageNumber}...`);

  try {
    const pageTexts: Record<number, string> = {
      1: "1. Applicant",
      2: "2. Project Location",
      3: "3. Project Details",
      4: "4. Dust Control",
      5: "5. Submit",
    };

    const targetText = pageTexts[pageNumber];
    const xpath = `//table[@id='ThePage:_idJsp19']//a[contains(., '${targetText}')]`;
    const link = page.locator(`xpath=${xpath}`);

    if ((await link.count()) === 0) {
      console.error(`  Step nav link not found for Page ${pageNumber}`);
      return false;
    }

    await link.click();
    // Wait for page content to load after navigation
    await page.waitForLoadState("domcontentloaded").catch(() => null);
    await sleep(SETTLE_MS);

    const current = await getCurrentPage(page);
    return current === pageNumber;
  } catch (error) {
    console.error(`  Failed to navigate to Page ${pageNumber}:`, error);
    return false;
  }
}

/**
 * Read the disturbed acres value from Page 2
 */
async function readDisturbedAcres(page: Page): Promise<number | null> {
  console.log("[RESUME] Reading disturbed acres from Page 2...");

  try {
    const navOk = await navigateToPage(page, 2);
    if (!navOk) {
      return null;
    }

    const acresSelector = portal.detailExtract.siteLocation.disturbedArea;
    await waitForElement(page, acresSelector, NAVIGATION_TIMEOUT);

    const acresText = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      if (element instanceof HTMLInputElement) {
        return element.value;
      }
      return element.textContent?.trim() || null;
    }, acresSelector);

    if (!acresText) {
      return null;
    }

    const acres = Number.parseFloat(acresText.replaceAll(/[^\d.]/g, ""));
    if (Number.isNaN(acres)) {
      return null;
    }

    console.log(`  Disturbed acres: ${acres}`);
    return acres;
  } catch (error) {
    console.error("  Failed to read disturbed acres:", error);
    return null;
  }
}

/**
 * Complete Page 2 by selecting first location and clicking Next
 */
async function completePage2(page: Page): Promise<boolean> {
  console.log("[RESUME] Completing Page 2...");

  try {
    // Select first location if available
    const firstLocationRadio = page.locator(portal.page2.selectFirstLocation);
    if ((await firstLocationRadio.count()) > 0) {
      await firstLocationRadio.click();
      await sleep(SETTLE_MS);
      console.log("  Selected first location");
    }

    // Click Next to proceed to Page 3
    console.log("  Clicking Next...");
    const nextOk = await clickNext(page);
    if (!nextOk) {
      console.error("  Failed to click Next on Page 2");
      return false;
    }

    const currentPage = await getCurrentPage(page);
    console.log(`  Now on Page ${currentPage}`);
    return currentPage === 3;
  } catch (error) {
    console.error("  Failed to complete Page 2:", error);
    return false;
  }
}

/**
 * Check if we're on Page 5 (Submit Application)
 */
async function isOnPage5(page: Page): Promise<boolean> {
  console.log("[RESUME] Checking if on Page 5...");
  const current = await getCurrentPage(page);
  return current === 5;
}

/**
 * Result of the resume flow
 */
export interface ResumeFlowResult {
  disturbedAcres: number | null;
  error?: string;
  permitNumber: string;
  reachedPage5: boolean;
  success: boolean;
}

/**
 * Main resume flow function
 */
export async function resumeFlow(
  page: Page,
  permitNumber: string,
  customSettings?: DeepPartial<FormData>
): Promise<ResumeFlowResult> {
  console.log("\n========================================");
  console.log(`RESUME FLOW: ${permitNumber}`);
  console.log("========================================\n");

  const result: ResumeFlowResult = {
    disturbedAcres: null,
    permitNumber,
    reachedPage5: false,
    success: false,
  };

  try {
    const myAppsOk = await navigateToMyApps(page);
    if (!myAppsOk) {
      result.error = "Failed to navigate to My Dust Control Applications";
      return result;
    }

    const openOk = await openDraftApplication(page, permitNumber);
    if (!openOk) {
      result.error = `Failed to open application ${permitNumber}`;
      return result;
    }

    const acres = await readDisturbedAcres(page);
    result.disturbedAcres = acres;
    const disturbedAcres = acres ?? DEFAULTS.site.acresDisturbed;

    // Complete Page 2 (select location and click Next)
    const page2Ok = await completePage2(page);
    if (!page2Ok) {
      result.error = "Failed to complete Page 2";
      return result;
    }

    await fillPage3(page);

    const page4Ok = await navigateToPage(page, 4);
    if (!page4Ok) {
      result.error = "Failed to navigate to Page 4";
      return result;
    }
    // navigateToPage already waits, just settle for ADF form rendering
    await sleep(SETTLE_MS);

    const formData = buildFormData({
      overrides: {
        site: { acresDisturbed: disturbedAcres },

        ...customSettings,
      },
    });

    const fillOk = await fillPage4Module(page, formData);
    if (!fillOk) {
      result.error = "Failed to fill Page 4";
      return result;
    }

    const nextOk = await clickNext(page);
    if (!nextOk) {
      result.error = "Failed to advance to Page 5";
      return result;
    }

    result.reachedPage5 = await isOnPage5(page);
    result.success = result.reachedPage5;

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`Resume flow failed: ${result.error}`);
    return result;
  }
}

/**
 * Simple resume that just goes to Page 4 and fills it
 */
export async function resumeFromCurrentPage(
  page: Page,
  disturbedAcres = DEFAULTS.site.acresDisturbed,
  customSettings?: DeepPartial<FormData>
): Promise<boolean> {
  console.log(
    `\n[RESUME FROM CURRENT] Filling Page 4 with ${disturbedAcres} acres`
  );

  try {
    const page4Ok = await navigateToPage(page, 4);
    if (!page4Ok) {
      return false;
    }
    // navigateToPage already waits, just settle for ADF form rendering
    await sleep(SETTLE_MS);

    const formData = buildFormData({
      overrides: {
        site: { acresDisturbed: disturbedAcres },

        ...customSettings,
      },
    });

    const fillOk = await fillPage4Module(page, formData);
    if (!fillOk) {
      return false;
    }

    await clickNext(page);
    return await isOnPage5(page);
  } catch (error) {
    console.error("Resume from current page failed:", error);
    return false;
  }
}

/**
 * Hybrid resume flow - automates what it can, waits for manual Page 2 completion
 */
export async function resumeFlowHybrid(
  page: Page,
  permitNumber: string,
  customSettings?: DeepPartial<FormData>
): Promise<ResumeFlowResult> {
  console.log("\n========================================");
  console.log(`HYBRID RESUME FLOW: ${permitNumber}`);
  console.log("========================================\n");

  const result: ResumeFlowResult = {
    disturbedAcres: null,
    permitNumber,
    reachedPage5: false,
    success: false,
  };

  try {
    if (!(await navigateToMyApps(page))) {
      result.error = "Failed to navigate to My Dust Control Applications";
      return result;
    }

    if (!(await openDraftApplication(page, permitNumber))) {
      result.error = `Failed to open application ${permitNumber}`;
      return result;
    }

    if (!(await navigateToPage(page, 2))) {
      result.error = "Failed to navigate to Page 2";
      return result;
    }

    // Try to read acres while on P2
    const acresSelector = portal.detailExtract.siteLocation.disturbedArea;
    const acresText = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      if (element instanceof HTMLInputElement) {
        return element.value;
      }
      return element.textContent?.trim() || null;
    }, acresSelector);

    if (acresText) {
      const acres = Number.parseFloat(acresText.replaceAll(/[^\d.]/g, ""));
      if (!Number.isNaN(acres)) {
        result.disturbedAcres = acres;
        console.log(`[HYBRID] Disturbed acres: ${acres}`);
      }
    }

    if (!(await waitForPage3(page))) {
      result.error = "Timed out waiting for Page 3";
      return result;
    }

    await fillPage3(page);

    const disturbedAcres =
      result.disturbedAcres ?? DEFAULTS.site.acresDisturbed;

    if (!(await navigateToPage(page, 4))) {
      result.error = "Failed to navigate to Page 4";
      return result;
    }
    // navigateToPage already waits, just settle for ADF form rendering
    await sleep(SETTLE_MS);

    const formData = buildFormData({
      overrides: {
        site: { acresDisturbed: disturbedAcres },

        ...customSettings,
      },
    });

    if (!(await fillPage4Module(page, formData))) {
      result.error = "Failed to fill Page 4";
      return result;
    }

    await clickNext(page);
    result.reachedPage5 = await isOnPage5(page);
    result.success = result.reachedPage5;

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`Hybrid resume flow failed: ${result.error}`);
    return result;
  }
}

// Export helper functions for testing
export {
  navigateToMyApps,
  openDraftApplication,
  navigateToPage,
  readDisturbedAcres,
  completePage2,
  fillPage3,
  isOnPage5,
  waitForPage3,
};
