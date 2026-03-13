/**
 * Shared Portal Utilities
 *
 * Helper functions for ADF portal interactions:
 * - Timing utilities (sleep, waitForElement)
 * - Form interaction helpers (fillText, fillTextSafe, fillTextWithSelectors, clickRadio, setCheckbox)
 * - Navigation (navigateToMyDustApps, navigateToDustSearch)
 * - Popup/frame utilities (waitForPopup, findFrameWithSelector)
 * - Application utilities (isDustApplicationId, clickDustApplicationLink*)
 *
 * TIMING STRATEGY:
 * - Use Playwright's native auto-wait for all actions (click, fill, etc.)
 * - Use locator.waitFor() for explicit element visibility waits
 * - Use context.waitForEvent('page') for popup detection
 * - Use SETTLE_MS only after ADF partial page updates that don't trigger navigation
 */

import type { BrowserContext, Frame, Page } from "playwright";
import type { ApplicationLinkInfo } from "@/portal/types";
import { portal } from "./selectors";

export type { ApplicationLinkInfo } from "@/portal/types";

/** Time in milliseconds to let ADF stabilize after form interactions. */
export const SETTLE_MS = 1000;

/** Shorter settle time for incremental scroll during lazy load (1000ms) */
export const LAZY_LOAD_SCROLL_MS = 1000;

/** Regex pattern for valid dust application IDs (e.g., D0063581) */
export const DUST_APPLICATION_ID_REGEX = /^D\d{7}$/;

/** Regex pattern for parsing step number from title (e.g., "1. Applicant Info") */
const STEP_NUMBER_REGEX = /^(\d)\./;

/** US State abbreviation to full name map for dropdown selection */
const STATE_ABBREVIATIONS: Record<string, string> = {
  AK: "Alaska",
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DC: "District of Columbia",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
};

// ============================================================================
// Basic Utilities
// ============================================================================

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for an element to appear on the page.
 */
export async function waitForElement(
  page: Page | Frame,
  selector: string,
  timeoutMs = 15_000
): Promise<boolean> {
  try {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts known id-ish strings into a safe CSS selector.
 */
export function normalizeSelector(selectorOrId: string): string {
  const s = selectorOrId.trim();
  if (
    s.startsWith("[") ||
    s.startsWith("#") ||
    s.startsWith(".") ||
    s.startsWith("text=") ||
    s.startsWith("textarea") ||
    s.startsWith("input") ||
    s.startsWith("span") ||
    s.startsWith("table") ||
    s.includes(" ") ||
    s.includes(":has-text(") ||
    s.includes(">>") ||
    s.includes("img[") ||
    s.includes("input.") ||
    s.includes("textarea.") ||
    s.includes("select[")
  ) {
    return s;
  }
  return `[id="${s}"]`;
}

// ============================================================================
// Form Actions (Native Playwright Patterns)
// ============================================================================

/**
 * Fill a text field using native Playwright fill.
 */
export async function fillText(
  page: Page | Frame,
  selectorOrId: string,
  value: string
): Promise<void> {
  const selector = normalizeSelector(selectorOrId);
  const locator = page.locator(selector).first();
  await locator.fill(value);
  await sleep(SETTLE_MS);
}

/**
 * Fill a text field with timeout handling - returns success/failure instead of throwing.
 * Use this for conditional fields where indices may shift dynamically.
 *
 * @param page - Playwright Page or Frame
 * @param selectorOrId - CSS selector or element ID
 * @param value - Text value to fill
 * @param options - Optional config: timeout (default 10s), labelFallback (label text to try if ID fails)
 * @returns true if fill succeeded, false if timed out
 */
export async function fillTextSafe(
  page: Page | Frame,
  selectorOrId: string,
  value: string,
  options?: { timeout?: number; labelFallback?: string }
): Promise<boolean> {
  const timeout = options?.timeout ?? 10_000;

  // Try ID-based selector first
  try {
    const selector = normalizeSelector(selectorOrId);
    const locator = page.locator(selector).first();
    await locator.fill(value, { timeout });
    await sleep(SETTLE_MS);
    return true;
  } catch {
    // If label fallback provided, try that
    if (options?.labelFallback) {
      try {
        // getByLabel only works on Page, not Frame
        if ("getByLabel" in page) {
          const locator = (page as Page)
            .getByLabel(options.labelFallback, { exact: false })
            .first();
          await locator.fill(value, { timeout });
          await sleep(SETTLE_MS);
          console.log(
            `    ↳ Used label fallback for: ${options.labelFallback}`
          );
          return true;
        }
      } catch {
        // Both methods failed
      }
    }
    console.log(`    ✗ fillTextSafe timed out: ${selectorOrId}`);
    return false;
  }
}

/**
 * Click a radio button using native Playwright click.
 */
export async function clickRadio(
  page: Page | Frame,
  selectorOrId: string
): Promise<void> {
  const selector = normalizeSelector(selectorOrId);
  const locator = page.locator(selector).first();
  await locator.click();
  await sleep(SETTLE_MS);
}

/**
 * Set a checkbox state.
 * Uses click() instead of check()/uncheck() for ADF checkboxes
 * because ADF uses custom onclick handlers.
 */
export async function setCheckbox(
  page: Page | Frame,
  selectorOrId: string,
  checked: boolean
): Promise<void> {
  const selector = normalizeSelector(selectorOrId);
  const locator = page.locator(selector).first();
  const isCurrentlyChecked = await locator.isChecked();

  // Only click if we need to change the state
  if (checked !== isCurrentlyChecked) {
    await locator.click();
  }
  await sleep(SETTLE_MS);
}

/**
 * Select a dropdown option by label.
 * Automatically converts US state abbreviations (e.g., "TX") to full names (e.g., "Texas").
 */
export async function selectByLabel(
  page: Page | Frame,
  selectorOrId: string,
  label: string
): Promise<void> {
  const selector = normalizeSelector(selectorOrId);
  const locator = page.locator(selector).first();
  // Convert state abbreviations to full names for state dropdowns
  const actualLabel = STATE_ABBREVIATIONS[label.toUpperCase()] ?? label;
  await locator.selectOption({ label: actualLabel });
  await sleep(SETTLE_MS);
}

// ============================================================================
// Resilient Form Actions (with selector fallback)
// ============================================================================

/** Regex pattern for extracting sioTable index from selectors */
const SIO_TABLE_INDEX_REGEX = /sioTable:(\d+):/;

/**
 * Result from fillTextWithSelectors for tracking which selector worked.
 */
export interface SelectorResult {
  /** Human-readable field name for logging */
  fieldName: string;
  /** Index of the selector that worked (0 = primary, 1+ = fallback) */
  selectorIndex: number | null;
  success: boolean;
  /** The selector that worked (null if all failed) */
  usedSelector: string | null;
}

/**
 * Try multiple selectors in order until one works.
 * Always logs which selector succeeded for data collection/debugging.
 *
 * Use this for fields with known index drift (e.g., C.4 "Other:" textareas).
 *
 * @param page - Playwright Page or Frame
 * @param selectors - Array of selectors to try in order (first = primary, rest = fallbacks)
 * @param value - Text value to fill
 * @param fieldName - Human-readable field name for logging
 * @param options - Optional config: timeout per attempt (default 2s)
 * @returns SelectorResult with success status and which selector worked
 */
export async function fillTextWithSelectors(
  page: Page | Frame,
  selectorList: string | string[],
  value: string,
  fieldName: string,
  options?: { timeout?: number }
): Promise<SelectorResult> {
  const timeout = options?.timeout ?? 2000;

  // Normalize to array (supports both single selector and array)
  const selectorArray: string[] = Array.isArray(selectorList)
    ? selectorList
    : [selectorList];

  for (let i = 0; i < selectorArray.length; i++) {
    const selector = selectorArray[i];
    if (!selector) {
      continue;
    }

    try {
      const normalized = normalizeSelector(selector);
      await page.locator(normalized).first().fill(value, { timeout });
      await sleep(SETTLE_MS);

      // Extract sioTable index for cleaner logging
      const sioMatch = selector.match(SIO_TABLE_INDEX_REGEX);
      const sioIndex = sioMatch ? sioMatch[1] : "?";

      if (i === 0) {
        // Primary selector worked
        console.log(`    ✓ ${fieldName}: sioTable:${sioIndex} (primary)`);
      } else {
        // Fallback selector worked - important data point!
        console.log(
          `    ⚠ ${fieldName}: sioTable:${sioIndex} (fallback #${i})`
        );
      }

      return {
        fieldName,
        selectorIndex: i,
        success: true,
        usedSelector: selector,
      };
    } catch {
      // Continue to next selector
    }
  }

  console.log(
    `    ✗ ${fieldName}: all ${selectorArray.length} selectors failed`
  );
  return {
    fieldName,
    selectorIndex: null,
    success: false,
    usedSelector: null,
  };
}

/**
 * Set checkbox with fallback selector support.
 * Tries multiple selectors in order until one works.
 *
 * @param page - Playwright Page or Frame
 * @param selectorList - Single selector or array of fallback selectors
 * @param checked - Desired checkbox state
 * @param fieldName - Human-readable field name for logging
 * @param options - Optional config: timeout per attempt (default 2s)
 * @returns SelectorResult with success status and which selector worked
 */
export async function setCheckboxWithSelectors(
  page: Page | Frame,
  selectorList: string | string[],
  checked: boolean,
  fieldName: string,
  options?: { timeout?: number }
): Promise<SelectorResult> {
  const timeout = options?.timeout ?? 2000;

  const selectorArray: string[] = Array.isArray(selectorList)
    ? selectorList
    : [selectorList];

  for (let i = 0; i < selectorArray.length; i++) {
    const selector = selectorArray[i];
    if (!selector) {
      continue;
    }

    try {
      const normalized = normalizeSelector(selector);
      const locator = page.locator(normalized).first();

      // Wait for element to be visible
      await locator.waitFor({ state: "visible", timeout });

      const isCurrentlyChecked = await locator.isChecked();
      if (checked !== isCurrentlyChecked) {
        await locator.click();
      }
      await sleep(SETTLE_MS);

      // Extract sioTable index for cleaner logging
      const sioMatch = selector.match(SIO_TABLE_INDEX_REGEX);
      const sioIndex = sioMatch ? sioMatch[1] : "?";

      if (i === 0) {
        console.log(`    ✓ ${fieldName}: sioTable:${sioIndex} (primary)`);
      } else {
        console.log(
          `    ⚠ ${fieldName}: sioTable:${sioIndex} (fallback #${i})`
        );
      }

      return {
        fieldName,
        selectorIndex: i,
        success: true,
        usedSelector: selector,
      };
    } catch {
      // Continue to next selector
    }
  }

  console.log(
    `    ✗ ${fieldName}: all ${selectorArray.length} selectors failed`
  );
  return {
    fieldName,
    selectorIndex: null,
    success: false,
    usedSelector: null,
  };
}

/**
 * Click a radio button with fallback selector support.
 * Tries multiple selectors in order until one works.
 *
 * @param page - Playwright Page or Frame
 * @param selectorList - Single selector or array of fallback selectors
 * @param fieldName - Human-readable field name for logging
 * @param options - Optional config: timeout per attempt (default 2s)
 * @returns SelectorResult with success status and which selector worked
 */
export async function clickRadioWithSelectors(
  page: Page | Frame,
  selectorList: string | string[],
  fieldName: string,
  options?: { timeout?: number }
): Promise<SelectorResult> {
  const timeout = options?.timeout ?? 2000;

  const selectorArray: string[] = Array.isArray(selectorList)
    ? selectorList
    : [selectorList];

  for (let i = 0; i < selectorArray.length; i++) {
    const selector = selectorArray[i];
    if (!selector) {
      continue;
    }

    try {
      const normalized = normalizeSelector(selector);
      const locator = page.locator(normalized).first();

      await locator.click({ timeout });
      await sleep(SETTLE_MS);

      const sioMatch = selector.match(SIO_TABLE_INDEX_REGEX);
      const sioIndex = sioMatch ? sioMatch[1] : "?";

      if (i === 0) {
        console.log(`    ✓ ${fieldName}: sioTable:${sioIndex} (primary)`);
      } else {
        console.log(
          `    ⚠ ${fieldName}: sioTable:${sioIndex} (fallback #${i})`
        );
      }

      return {
        fieldName,
        selectorIndex: i,
        success: true,
        usedSelector: selector,
      };
    } catch {
      // Continue to next selector
    }
  }

  console.log(
    `    ✗ ${fieldName}: all ${selectorArray.length} selectors failed`
  );
  return {
    fieldName,
    selectorIndex: null,
    success: false,
    usedSelector: null,
  };
}

/**
 * Last-resort radio click: find a table row containing labelText, then click
 * the Nth radio input inside that row's siForm container.
 *
 * Works regardless of siTable/sioTable indices because it searches by visible
 * text content rather than ADF-generated IDs.
 *
 * @param radioIndex 0 = first radio (typically Yes), 1 = second (No)
 */
export async function clickRadioByLabelText(
  page: Page | Frame,
  labelText: string,
  radioIndex: number
): Promise<boolean> {
  try {
    // Find a table cell whose text contains the label (case-insensitive)
    const cells = page.locator("td");
    const count = await cells.count();

    for (let i = 0; i < count; i++) {
      const cell = cells.nth(i);
      const text = await cell.innerText().catch(() => "");
      if (!text.toLowerCase().includes(labelText.toLowerCase())) {
        continue;
      }

      // Found label cell - look for radio inputs in the parent row
      const row = cell.locator("xpath=ancestor::tr[1]");
      const radios = row.locator('input[type="radio"]');
      const radioCount = await radios.count();

      if (radioCount > radioIndex) {
        await radios.nth(radioIndex).click({ timeout: 2000 });
        await sleep(SETTLE_MS);
        console.log(
          `    ✓ ${labelText}: text-based discovery (radio ${radioIndex} in row with "${text.slice(0, 40).trim()}")`
        );
        return true;
      }
    }

    // Broader fallback: search all text containing the label anywhere on page
    const labelLoc = page.locator(`text=${labelText}`).first();
    const labelVisible = await labelLoc
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (labelVisible) {
      // Walk up to find the nearest container with radios
      const container = labelLoc.locator("xpath=ancestor::table[1]");
      const radios = container.locator('input[type="radio"]');
      const radioCount = await radios.count();

      if (radioCount > radioIndex) {
        await radios.nth(radioIndex).click({ timeout: 2000 });
        await sleep(SETTLE_MS);
        console.log(
          `    ✓ ${labelText}: broad text-based discovery (radio ${radioIndex})`
        );
        return true;
      }
    }

    console.log(
      `    ✗ ${labelText}: text-based discovery found no matching radios`
    );
    return false;
  } catch (error) {
    console.log(`    ✗ ${labelText}: text-based discovery error: ${error}`);
    return false;
  }
}

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to My Dust Control Applications page.
 *
 * Checks if already on the page before attempting navigation.
 * Includes retry logic for ADF page state issues.
 */
export async function navigateToMyDustApps(page: Page): Promise<boolean> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check if we're already on the dust apps page
      const draftSectionVisible = await page
        .locator(portal.dustApps.draftSection)
        .isVisible()
        .catch(() => false);

      if (draftSectionVisible) {
        await sleep(SETTLE_MS);
        return true;
      }

      // Click the nav link to navigate
      const navLink = page.locator(portal.nav.myDustControlApps).first();

      if (attempt === 1) {
        await navLink.click();
      } else if (attempt === 2) {
        // Force click on retry
        await navLink.click({ force: true });
      } else {
        // Evaluate click as last resort
        await navLink.evaluate((el) => (el as HTMLElement).click());
      }

      // Wait for draft section to appear
      await page
        .locator(portal.dustApps.draftSection)
        .waitFor({ state: "visible", timeout: 10_000 });

      // Also wait for the draft table to be ready (more reliable indicator)
      const tableSelector = portal.dustApps.draftTable;
      const tableVisible = await waitForElement(page, tableSelector, 15_000);
      if (tableVisible) {
        // Give the table a moment to fully render
        await sleep(SETTLE_MS);
      } else {
        // Table might not exist if there are no drafts, but that's okay
        // Just wait a bit for page to stabilize
        await sleep(SETTLE_MS);
      }

      return true;
    } catch {
      if (attempt < maxAttempts) {
        await sleep(SETTLE_MS);
      }
    }
  }

  return false;
}

/**
 * Navigate to the Dust Application Search page.
 */
export async function navigateToDustSearch(page: Page): Promise<boolean> {
  try {
    await page.locator('a:has-text("Dust Application Search")').first().click();
    await page
      .locator(portal.dustSearch.permitNumberInput)
      .waitFor({ state: "visible" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to click the first visible element from a list of portal.
 */
export async function clickFirstVisibleLocator(
  ctx: Page | Frame,
  selectorList: string[]
): Promise<boolean> {
  for (const sel of selectorList) {
    const part = normalizeSelector(sel);
    const btn = ctx.locator(part).first();
    if ((await btn.count().catch(() => 0)) > 0) {
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        await btn.click().catch(() => null);
        return true;
      }
    }
  }
  return false;
}

/**
 * Click the Next button to advance to the next page.
 */
export async function clickNext(page: Page | Frame): Promise<boolean> {
  try {
    const loc = page.locator(portal.pageNav.nextButton).first();
    await loc.click();
    await sleep(SETTLE_MS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Click an element searching through all frames.
 */
export async function clickInFrames(
  page: Page,
  selector: string
): Promise<boolean> {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const loc = frame.locator(selector).first();
      if ((await loc.count()) > 0) {
        await loc.click();
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Wait for the dust application detail page to load by polling DOM markers.
 */
export async function waitForDustApplicationDetailPage(
  page: Page,
  opts?: { timeout?: number; midwayFallbackAppNum?: string }
): Promise<boolean> {
  const timeoutMs = opts?.timeout ?? 20_000;
  const pollMs = 500;
  const maxAttempts = Math.ceil(timeoutMs / pollMs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollMs);

    const state = await page
      .evaluate(
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
      )
      .catch(() => ({
        hasDeleteBtn: false,
        hasDetailForm: false,
        stillOnList: true,
      }));

    if (state.hasDeleteBtn || state.hasDetailForm) {
      return true;
    }

    // Midway fallback: if stuck on list, try clicking the link by text
    if (
      opts?.midwayFallbackAppNum &&
      attempt === Math.floor(maxAttempts / 3) &&
      state.stillOnList
    ) {
      await page.evaluate((targetApp) => {
        const links = [...document.querySelectorAll("a")];
        const link = links.find(
          (a) => (a.textContent || "").trim() === targetApp
        );
        if (link) {
          (link as HTMLElement).click();
        }
      }, opts.midwayFallbackAppNum);
    }
  }

  return false;
}

// ============================================================================
// Popup & Frame Utilities
// ============================================================================

/**
 * Wait for a popup window to open.
 */
export async function waitForPopup(
  context: BrowserContext,
  _pagesBefore?: number,
  timeoutMs = 20_000
): Promise<Page | undefined> {
  try {
    const popup = await context.waitForEvent("page", { timeout: timeoutMs });
    return popup;
  } catch {
    return undefined;
  }
}

/**
 * Find a frame containing a specific selector.
 */
export async function findFrameWithSelector(
  page: Page,
  selector: string
): Promise<Frame | null> {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      if ((await frame.locator(selector).count()) > 0) {
        return frame;
      }
    } catch {
      // ignore detached frames
    }
  }
  return null;
}

/**
 * Wait for an element within any frame of a page (useful for ADF popups with iframes).
 */
export async function waitForFrameElement(
  page: Page,
  selector: string,
  timeout = 15_000
): Promise<void> {
  const frame = await findFrameWithSelector(page, selector);
  if (frame) {
    // Use .first() to avoid strict mode errors when multiple elements match
    await frame
      .locator(selector)
      .first()
      .waitFor({ state: "visible", timeout });
  }
  await sleep(SETTLE_MS);
}

// Application Utilities
// ============================================================================

/**
 * Check if a string is a valid dust application ID.
 */
export function isDustApplicationId(value: string): boolean {
  return DUST_APPLICATION_ID_REGEX.test(value.trim());
}

/**
 * Click a dust application link by its application ID.
 */
export async function clickDustApplicationLinkById(
  page: Page,
  appId: string
): Promise<boolean> {
  const locator = page.locator(`a:has-text("${appId}")`).first();
  if ((await locator.count()) > 0) {
    await locator.click();
    return true;
  }
  return false;
}

/**
 * Click a dust application link by its index in the list.
 */
export async function clickDustApplicationLinkByIndex(
  page: Page | Frame,
  index: number,
  containerSelector?: string
): Promise<{ success: boolean; appId: string }> {
  const root = containerSelector ? page.locator(containerSelector) : page;
  const links = root
    .locator("a")
    .filter({ hasText: DUST_APPLICATION_ID_REGEX });

  const count = await links.count();
  if (index >= count) {
    return { appId: "", success: false };
  }

  const link = links.nth(index);
  const appId = (await link.textContent())?.trim() || "";

  // Try standard click first
  try {
    await link.click({ timeout: 5000 });
  } catch (error) {
    // Fallback to evaluate click for ADF reliability
    try {
      await link.evaluate((el) => (el as HTMLElement).click());
    } catch {
      console.error(`Failed to click application link: ${error}`);
      return { appId, success: false };
    }
  }

  return { appId, success: true };
}

/** Click strategy names for logging */
type ClickStrategy =
  | "standard"
  | "force"
  | "evaluate"
  | "dispatchEvent"
  | "mousedown";

/** Result from clickApplicationWithRetry */
export interface ClickRetryResult {
  appId: string;
  attempts: number;
  strategy: ClickStrategy | null;
  success: boolean;
}

/**
 * Click a dust application link with multiple retry strategies.
 *
 * Oracle ADF uses submitForm() for navigation, which can be unreliable.
 * This function tries multiple click strategies and verifies navigation
 * occurred before returning success.
 *
 * Strategies (in order):
 * 1. Force click (skip actionability checks - most reliable)
 * 2. Standard Playwright click
 * 3. Evaluate click (direct DOM click)
 * 4. DispatchEvent click (synthetic event)
 * 5. Mousedown + mouseup events
 *
 * @param page - Playwright Page instance
 * @param index - Zero-based index of the link in the draft table
 * @param containerSelector - Optional CSS selector to scope the search
 * @param debug - Enable verbose logging
 * @returns Result with success flag, appId, strategy used, and attempt count
 */
export async function clickApplicationWithRetry(
  page: Page,
  index: number,
  containerSelector?: string,
  debug = false
): Promise<ClickRetryResult> {
  const log = (msg: string) => {
    if (debug) {
      console.log(`[click-retry] ${msg}`);
    }
  };

  const root = containerSelector ? page.locator(containerSelector) : page;
  const links = root
    .locator("a")
    .filter({ hasText: DUST_APPLICATION_ID_REGEX });

  const count = await links.count();
  log(`Found ${count} application links`);

  if (index >= count) {
    log(`Index ${index} out of bounds`);
    return { appId: "", attempts: 0, strategy: null, success: false };
  }

  const link = links.nth(index);
  const appId = (await link.textContent())?.trim() || "";
  log(`Target: ${appId} at index ${index}`);

  // Selectors to check if we left the list page
  const draftTableSelector = portal.dustApps.draftTable;
  const detailBtnSelector = portal.applicationDetail.deleteBtn;
  const detailFormSelector = portal.applicationDetail.detailForm;

  // Helper to check if we navigated away from the list
  const hasNavigated = async (): Promise<boolean> => {
    const state = await page
      .evaluate(
        (sels) => {
          const hasDeleteBtn = document.querySelector(sels.deleteBtn) !== null;
          const hasDetailForm =
            document.querySelector(sels.detailForm) !== null ||
            document.querySelector(sels.detailFormAlt) !== null;
          const stillOnList =
            document.querySelector(sels.draftTable) !== null &&
            document.body?.textContent?.includes("Draft Dust Applications");
          return { hasDeleteBtn, hasDetailForm, stillOnList };
        },
        {
          deleteBtn: detailBtnSelector,
          detailForm: detailFormSelector,
          detailFormAlt: portal.applicationDetail.detailFormAlt,
          draftTable: draftTableSelector,
        }
      )
      .catch(() => ({
        hasDeleteBtn: false,
        hasDetailForm: false,
        stillOnList: true,
      }));

    // We've navigated if we see detail page markers OR we're no longer on the list
    return state.hasDeleteBtn || state.hasDetailForm || !state.stillOnList;
  };

  // Strategies to try
  const strategies: {
    name: ClickStrategy;
    settleMs: number;
    execute: () => Promise<void>;
  }[] = [
    {
      execute: async () => {
        await link.click({ force: true, timeout: 5000 });
      },
      name: "force",
      settleMs: 1500,
    },
    {
      execute: async () => {
        await link.click({ timeout: 5000 });
      },
      name: "standard",
      settleMs: 1500,
    },
    {
      execute: async () => {
        await link.evaluate((el) => (el as HTMLElement).click());
      },
      name: "evaluate",
      settleMs: 2000,
    },
    {
      execute: async () => {
        await link.dispatchEvent("click");
      },
      name: "dispatchEvent",
      settleMs: 2000,
    },
    {
      execute: async () => {
        // Simulate full mouse click sequence
        await link.dispatchEvent("mousedown");
        await sleep(50);
        await link.dispatchEvent("mouseup");
        await sleep(50);
        await link.dispatchEvent("click");
      },
      name: "mousedown",
      settleMs: 2000,
    },
  ];

  let attempts = 0;

  for (const strategy of strategies) {
    attempts++;
    log(`Attempt ${attempts}: ${strategy.name}`);

    try {
      // Re-locate element before each attempt (DOM may have changed)
      const freshLinks = root
        .locator("a")
        .filter({ hasText: DUST_APPLICATION_ID_REGEX });

      if ((await freshLinks.count()) <= index) {
        log(`Link at index ${index} no longer exists`);
        continue;
      }

      const freshLink = freshLinks.nth(index);
      const isVisible = await freshLink.isVisible().catch(() => false);
      log(`Link visible: ${isVisible}`);

      if (!isVisible) {
        // Scroll into view
        await freshLink.scrollIntoViewIfNeeded().catch(() => {
          // Element may not be scrollable, ignore
        });
        await sleep(300);
      }

      // Execute the click strategy
      await strategy.execute();

      // Wait for settle
      await sleep(strategy.settleMs);

      // Check if navigation occurred
      const navigated = await hasNavigated();
      log(`Navigated: ${navigated}`);

      if (navigated) {
        log(`Success with strategy: ${strategy.name}`);
        return { appId, attempts, strategy: strategy.name, success: true };
      }
    } catch (error) {
      log(`Strategy ${strategy.name} threw: ${error}`);
    }
  }

  log(`All strategies failed after ${attempts} attempts`);
  return { appId, attempts, strategy: null, success: false };
}

/**
 * Detect the current page number in the application form (1-5).
 */
export async function getCurrentPage(page: Page): Promise<number | null> {
  const isVisible = async (selector: string): Promise<boolean> =>
    await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);

  // 1. Try active step indicator in the sidebar (most reliable)
  const activeImg = page.locator('img[title*="Active step"]').first();
  if ((await activeImg.count()) > 0) {
    const title = await activeImg.getAttribute("title");
    const match = title?.match(STEP_NUMBER_REGEX);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  // 2. Page-specific element markers (Fallbacks)

  // Page 1: Applicant info table (look for email field in siTable:1)
  if (await isVisible('[id="ThePage:siTable:1:sioTable:0:siForm:text"]')) {
    return 1;
  }

  // Page 2: site drawing actions
  if (
    (await isVisible(portal.page2.addSiteDrawingBtn)) ||
    (await isVisible(portal.page2.editSiteDrawingBtn))
  ) {
    return 2;
  }

  // Page 3: Primary contact section (look for first name field in siTable:8)
  if (await isVisible('[id="ThePage:siTable:8:sioTable:1:siForm:text"]')) {
    return 3;
  }

  // Page 4: Dust control plan section (look for Category A header or siTable:18)
  if (
    (await isVisible("text=Category A")) ||
    (await isVisible('[id*="siTable:18:sioTable"]')) ||
    (await isVisible('[id*="siTable:35:sioTable"]'))
  ) {
    return 4;
  }

  // Page 5: Submit application (not in sidebar)
  const submitText = page.locator('text="Submit Application"');
  if ((await submitText.count()) > 0) {
    // Filter out sidebar links which are usually in a table with a specific ID
    const visibleSubmit = await page.evaluate(() => {
      const el = [...document.querySelectorAll("*")].find(
        (e) =>
          e.textContent?.includes("Submit Application") &&
          !e.closest("#ThePage\\:_idJsp19") && // Sidebar table
          (e as HTMLElement).offsetParent !== null
      );
      return !!el;
    });
    if (visibleSubmit) {
      return 5;
    }
  }

  return null;
}

/**
 * Navigate from current page to page 5 by clicking Next repeatedly.
 *
 * @param page - Playwright Page instance
 * @param log - Optional logging callback for progress updates
 * @returns Object with final page number and whether page 5 was reached
 */
export async function navigateToPage5(
  page: Page,
  log?: (message: string) => void
): Promise<{ currentPage: number | null; atPage5: boolean }> {
  const logFn =
    log ??
    ((_msg: string) => {
      /* noop */
    });

  await sleep(SETTLE_MS);
  let currentPage = await getCurrentPage(page);

  // Navigate through pages 1→2→3→4→5
  for (const targetPage of [2, 3, 4, 5]) {
    if (currentPage !== null && currentPage < targetPage) {
      logFn(`Page ${currentPage} → Page ${targetPage}...`);
      await clickNext(page);
      await sleep(SETTLE_MS);
      currentPage = await getCurrentPage(page);
    }
  }

  // Verify we reached page 5
  const atPage5 = await page.isVisible(portal.pageMarkers.page5Submit);

  return { atPage5, currentPage };
}

/**
 * Trigger lazy-loaded content on ADF pages by scrolling through the page.
 *
 * ADF pages load content on-demand as sections come into view.
 * This function scrolls incrementally through the page and waits for
 * key elements to appear.
 *
 * @param page - Playwright Page instance
 */
export async function triggerLazyLoad(page: Page): Promise<void> {
  // First, wait a moment for initial page load
  await sleep(SETTLE_MS);

  // Get page height and scroll incrementally
  const scrollStep = 500; // pixels per step
  const maxScrollAttempts = 20;

  for (let i = 0; i < maxScrollAttempts; i++) {
    const scrollPos = i * scrollStep;

    await page.evaluate((pos) => {
      window.scrollTo(0, pos);
    }, scrollPos);

    await sleep(LAZY_LOAD_SCROLL_MS);

    // Check if we've reached the bottom
    const atBottom = await page.evaluate(
      (pos) => pos >= document.body.scrollHeight - window.innerHeight,
      scrollPos
    );

    if (atBottom) {
      break;
    }
  }

  // Scroll all the way to the bottom once more
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await sleep(SETTLE_MS);

  // Scroll back to top
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await sleep(SETTLE_MS);
}

/**
 * Get a list of all application links from the current page view.
 *
 * Scans the page for links matching the dust application ID pattern
 * and extracts basic info from the table rows.
 *
 * @param page - Playwright Page or Frame instance
 * @param containerSelector - Optional CSS selector to scope the search (e.g. for draft table only)
 * @returns Array of ApplicationLinkInfo objects
 */
export async function listApplicationIds(
  page: Page | Frame,
  containerSelector?: string
): Promise<ApplicationLinkInfo[]> {
  return await page.evaluate(
    ({ regexStr, containerSel }) => {
      const regex = new RegExp(regexStr);
      const root = containerSel
        ? document.querySelector(containerSel)
        : document;
      if (!root) {
        return [];
      }

      const links = [...root.querySelectorAll("a")].filter((a) =>
        regex.test(a.textContent?.trim() || "")
      );

      return links.map((link, index) => {
        const id = link.textContent?.trim() || "";
        const row = link.closest("tr");
        const cells = row?.querySelectorAll("td");
        // Note: Column mapping depends on the specific table (Search vs Drafts)
        // but we extract project/company if they appear to be in typical positions
        const projectName = cells?.[1]?.textContent?.trim() || "";
        const companyName = cells?.[3]?.textContent?.trim() || "";

        return { companyName, id, index, projectName };
      });
    },
    {
      containerSel: containerSelector,
      regexStr: DUST_APPLICATION_ID_REGEX.source,
    }
  );
}

// ============================================================================
// Polling / Operator Wait
// ============================================================================

/** How long to wait for operator to signal "go" (5 minutes) */
const OPERATOR_TIMEOUT_MS = 300_000;
/** How often to poll for operator signal */
const OPERATOR_POLL_MS = 3000;

/**
 * Wait for an external condition by polling.
 *
 * Generalizes the polling pattern used across the codebase (e.g., waiting
 * for page navigation, operator "go" signal, invoice readiness).
 *
 * Handles navigation context destruction gracefully (ADF page transitions).
 *
 * @param page - Playwright Page instance
 * @param message - Message to display while waiting
 * @param checkFn - Function that returns true when the condition is met
 * @param options - Optional timeout/interval overrides
 * @returns true if the condition was met within the timeout
 */
export async function waitForCondition(
  page: Page,
  message: string,
  checkFn: () => Promise<boolean>,
  options?: { timeoutMs?: number; pollMs?: number }
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? OPERATOR_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? OPERATOR_POLL_MS;
  const maxAttempts = Math.floor(timeoutMs / pollMs);

  console.log("\n========================================");
  console.log(`[WAITING] ${message}`);
  console.log("========================================\n");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const ready = await checkFn();
      if (ready) {
        console.log("[WAITING] Condition met, continuing...\n");
        return true;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("Execution context was destroyed") ||
        msg.includes("navigation")
      ) {
        console.log(
          "[WAITING] Navigation detected, waiting for page to settle..."
        );
        await page.waitForLoadState("domcontentloaded").catch(() => null);
        await sleep(SETTLE_MS);
        continue;
      }
    }

    if (i > 0 && i % 10 === 0) {
      const elapsed = (i * pollMs) / 1000;
      console.log(`[WAITING] Still waiting... (${elapsed}s elapsed)`);
    }

    await sleep(pollMs);
  }

  console.error("[WAITING] Timed out");
  return false;
}

// ============================================================================
// Control Measure Selection
// ============================================================================

/**
 * Selectors for a control measure with Primary/Contingency/None options.
 * Keys match ControlMeasure type values for direct lookup.
 */
export interface ControlMeasureSelectors {
  Contingency?: string;
  None?: string;
  Primary?: string;
}

/**
 * Click the appropriate radio button for a control measure value.
 *
 * Handles the common pattern in dust control forms where a measure
 * can be "Primary", "Contingency", or "None".
 *
 * @param page - Playwright Page instance
 * @param value - The control measure value ("Primary" | "Contingency" | "None")
 * @param selectors - Object with Primary, Contingency, and None selector strings
 */
export async function selectControlMeasure(
  page: Page,
  value: "Primary" | "Contingency" | "None",
  sels: ControlMeasureSelectors
): Promise<void> {
  const selector = sels[value];
  if (selector) {
    await clickRadio(page, selector);
  }
}

// ============================================================================
// Vaadin-Compatible Helpers (Point & Pay payment portal)
// ============================================================================
//
// Point & Pay uses Vaadin web components. Text fields and checkboxes work
// with the standard helpers above (selectors target the inner native element).
// Combo-boxes need special handling (type-to-filter + overlay click).

/**
 * Select a value from a Vaadin combo-box.
 *
 * Unlike native <select> (use selectByLabel for those), Vaadin combo-boxes
 * require: click → type to filter → click overlay item or press Enter.
 *
 * @param page - Playwright Page
 * @param comboSelector - Selector for the <vaadin-combo-box> element (not the inner input)
 * @param value - Value to select
 * @param fieldName - Human-readable name for logging
 * @returns true if selection succeeded
 */
export async function selectCombo(
  page: Page,
  comboSelector: string,
  value: string,
  fieldName?: string
): Promise<boolean> {
  try {
    const combo = page.locator(comboSelector).first();
    await combo.waitFor({ state: "visible", timeout: 10_000 });

    const input = combo.locator('input[slot="input"]').first();
    await input.click();
    await sleep(SETTLE_MS);

    await input.fill("");
    await input.fill(value);
    await sleep(SETTLE_MS);

    // Click the matching overlay item if visible, otherwise press Enter
    const overlayItem = page
      .locator(`vaadin-combo-box-item:has-text("${value}")`)
      .first();
    const itemVisible = await overlayItem.isVisible().catch(() => false);

    if (itemVisible) {
      await overlayItem.click();
    } else {
      await input.press("Enter");
    }

    await sleep(SETTLE_MS);
    if (fieldName) {
      console.log(`    ✓ ${fieldName}: ${value}`);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ ${fieldName ?? comboSelector}: ${msg}`);
    return false;
  }
}

/**
 * Click a button and return success/failure.
 *
 * Works with any clickable element (Vaadin buttons, standard buttons, links).
 */
export async function clickButton(
  page: Page,
  selector: string,
  fieldName?: string
): Promise<boolean> {
  try {
    const button = page.locator(selector).first();
    await button.waitFor({ state: "visible", timeout: 10_000 });
    await button.click();
    await sleep(SETTLE_MS);
    if (fieldName) {
      console.log(`    ✓ Clicked: ${fieldName}`);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ Click ${fieldName ?? selector}: ${msg}`);
    return false;
  }
}

/**
 * Read text content or input value from an element. Returns null if not visible.
 */
export async function readText(
  page: Page,
  selector: string
): Promise<string | null> {
  try {
    const locator = page.locator(selector).first();
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      return null;
    }

    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "input" || tagName === "textarea") {
      return await locator.inputValue();
    }

    return await locator.textContent();
  } catch {
    return null;
  }
}
