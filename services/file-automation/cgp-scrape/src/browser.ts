/**
 * Browser Lifecycle Management
 *
 * Create and close Playwright browser instances for CGP scraping.
 */

import { chromium } from "playwright";
import type { BrowserInstance } from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

const CGP_URL = "https://legacy.azdeq.gov/databases/azpdessearch_drupal.html";

// =============================================================================
// BROWSER MANAGEMENT
// =============================================================================

/**
 * Create a Playwright browser instance.
 *
 * Launches Chromium with settings optimized for the ADEQ legacy site:
 * - Reasonable viewport size
 * - Standard Chrome user agent
 * - Popup blocking disabled (just in case)
 */
export async function createBrowser(options?: {
  headless?: boolean;
}): Promise<BrowserInstance> {
  const headless = options?.headless ?? true;

  const launchArgs = [
    "--disable-popup-blocking",
    "--disable-blink-features=AutomationControlled",
  ];

  if (headless) {
    launchArgs.push("--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu");
  }

  const browser = await chromium.launch({
    headless,
    args: launchArgs,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  return { browser, context, page };
}

/**
 * Close browser and cleanup resources.
 */
export async function closeBrowser(instance: BrowserInstance): Promise<void> {
  try {
    if (instance.context) {
      await instance.context.close().catch(() => {
        // Context may already be closed
      });
    }
  } catch {
    // Ignore errors when closing context
  }

  try {
    if (instance.browser) {
      await instance.browser.close().catch(() => {
        // Browser may already be closed
      });
    }
  } catch {
    // Ignore errors when closing browser
  }
}

/**
 * Navigate to the CGP search page.
 */
export async function navigateToSearchPage(
  instance: BrowserInstance,
): Promise<boolean> {
  try {
    await instance.page.goto(CGP_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    return true;
  } catch (error) {
    console.error("[Browser] Failed to navigate to search page:", error);
    return false;
  }
}

export { CGP_URL };
