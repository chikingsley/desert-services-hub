/**
 * Browser Lifecycle Management
 *
 * Create and close Playwright browser instances.
 * Also provides singleton session management for API server.
 */

import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import type { BrowserInstance } from "@/portal/types";
import { config, getHeadlessSetting } from "./config";
import { login } from "./login";

export type { BrowserInstance } from "@/portal/types";

/**
 * Options for the withBrowser wrapper
 */
export interface BrowserOptions {
  headless?: boolean;
  operation: keyof typeof config.scripts;
  keepOpen?: boolean;
}

/**
 * Helper to wrap an operation with a browser lifecycle (create -> login -> fn -> close).
 * Ensures consistent error handling and browser cleanup.
 */
export async function withBrowser<
  T extends { success: boolean; error?: string },
>(
  options: BrowserOptions,
  fn: (instance: BrowserInstance) => Promise<T>
): Promise<T> {
  const { operation, headless, keepOpen = false } = options;
  let instance: BrowserInstance | null = null;

  try {
    // 1. Create browser
    instance = await createBrowser({
      headless: headless ?? getHeadlessSetting(operation),
    });

    // 2. Login
    const loggedIn = await login(instance.page);
    if (!loggedIn) {
      if (!keepOpen) {
        await closeBrowser(instance);
      }
      return {
        success: false,
        error: "Failed to login to portal",
      } as T;
    }

    // 3. Execute the operation
    const result = await fn(instance);

    // 4. Handle cleanup or keeping open
    if (keepOpen) {
      console.log(
        `\n[${operation.toUpperCase()}] Operation complete, keeping browser open for manual review...`
      );
      // biome-ignore lint/suspicious/noEmptyBlockStatements: Intentionally never resolves
      await new Promise(() => {});
    } else {
      await closeBrowser(instance);
    }

    return result;
  } catch (error) {
    if (instance && !keepOpen) {
      try {
        await closeBrowser(instance);
      } catch {
        // Ignore secondary errors during cleanup
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } as T;
  }
}

// ============================================================================
// Session Management (Singleton for API Server)
// ============================================================================

export interface BrowserSession {
  instance: BrowserInstance;
  isLoggedIn: boolean;
}

let globalSession: BrowserSession | null = null;

/**
 * Get existing browser session or create a new one.
 * Used by API routes to share a single browser instance.
 */
export async function getOrCreateBrowserSession(): Promise<BrowserSession> {
  if (globalSession) {
    return globalSession;
  }

  console.log("[Session] Creating new browser session...");
  const instance = await createBrowser({ headless: config.headless });

  // Attempt login
  const loggedIn = await login(instance.page);

  globalSession = {
    instance,
    isLoggedIn: loggedIn,
  };

  console.log(
    `[Session] Browser ready, logged in: ${globalSession.isLoggedIn}`
  );
  return globalSession;
}

/**
 * Get page and context from current session (if exists).
 * Returns null if no session is active.
 */
export function getSessionPageAndContext(): {
  page: Page;
  context: BrowserContext;
} | null {
  if (!globalSession) {
    return null;
  }
  return {
    page: globalSession.instance.page,
    context: globalSession.instance.context,
  };
}

/**
 * Close the browser session and reset state.
 */
export async function closeBrowserSession(): Promise<void> {
  if (!globalSession) {
    return;
  }

  console.log("[Session] Closing browser session...");
  await closeBrowser(globalSession.instance);
  globalSession = null;
  console.log("[Session] Browser closed");
}

/**
 * Get current session status (for API response).
 */
export function getSessionStatus(): { active: boolean; isLoggedIn: boolean } {
  return {
    active: globalSession !== null,
    isLoggedIn: globalSession?.isLoggedIn ?? false,
  };
}

// ============================================================================
// Low-Level Browser Creation
// ============================================================================

/**
 * Create a Playwright browser instance.
 *
 * Launches Chromium with settings optimized for the ADF portal:
 * - Popup blocking disabled (required for ADF popups)
 * - Automation detection disabled
 * - Docker-safe flags when headless
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
