/**
 * Browser Lifecycle Management
 *
 * Create and close Playwright browser instances.
 * Singleton session management delegates to shared BrowserSessionManager.
 * One-off operations (create, scrape via CLI) use withBrowser() with ephemeral browsers.
 */

import { existsSync } from "node:fs";
import type {
  AbortOperationResult,
  BrowserInstance,
  BrowserSession,
  KeepAliveResult,
  SessionStatus,
} from "@lib/browser-session";
import { BrowserSessionManager } from "@lib/browser-session";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { config, getHeadlessSetting } from "./config";
import { login } from "./login";
import { portal } from "./selectors";

// Re-export shared types under names consumers already use
export type { BrowserInstance, BrowserSession } from "@lib/browser-session";

/**
 * Options for the withBrowser wrapper
 */
export interface BrowserOptions {
  headless?: boolean;
  keepOpen?: boolean;
  keepOpenTimeoutMs?: number;
  operation: keyof typeof config.scripts;
}

export interface BrowserClipboardWriteResult {
  inserted: boolean;
  reason?: string;
  success: boolean;
}

export interface BrowserClipboardReadResult {
  reason?: string;
  success: boolean;
  text: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_KEEP_OPEN_TIMEOUT_MS = 15 * 60 * 1000;
const MIN_KEEP_OPEN_TIMEOUT_MS = 30_000;
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_KEEP_ALIVE_INTERVAL_MS = 60_000;
const KEEPALIVE_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 1024;
const VIEWPORT_PATTERN_RE = /^(\d+)\s*[xX]\s*(\d+)$/;

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getKeepOpenTimeoutMs(timeoutMs?: number): number {
  if (!(timeoutMs && Number.isFinite(timeoutMs))) {
    return DEFAULT_KEEP_OPEN_TIMEOUT_MS;
  }
  return Math.max(MIN_KEEP_OPEN_TIMEOUT_MS, Math.trunc(timeoutMs));
}

function parseViewport(
  value: string | undefined
): { width: number; height: number } | null {
  if (!value) {
    return null;
  }
  const match = value.trim().match(VIEWPORT_PATTERN_RE);
  if (!match) {
    return null;
  }

  const width = Number.parseInt(match[1] ?? "", 10);
  const height = Number.parseInt(match[2] ?? "", 10);
  if (!(Number.isFinite(width) && Number.isFinite(height))) {
    return null;
  }
  if (width < 320 || height < 320) {
    return null;
  }
  return { height, width };
}

const KEEP_ALIVE_ENABLED =
  process.env.PERMIT_WORKER_KEEP_ALIVE_ENABLED !== "false";
const KEEP_ALIVE_INTERVAL_MS = Math.max(
  MIN_KEEP_ALIVE_INTERVAL_MS,
  parsePositiveInt(process.env.PERMIT_WORKER_KEEP_ALIVE_INTERVAL_MS) ??
    DEFAULT_KEEP_ALIVE_INTERVAL_MS
);
const RESOLVED_VIEWPORT = parseViewport(
  process.env.PERMIT_WORKER_BROWSER_VIEWPORT
) ??
  parseViewport(process.env.VNC_RESOLUTION) ?? {
    height: DEFAULT_VIEWPORT_HEIGHT,
    width: DEFAULT_VIEWPORT_WIDTH,
  };

const IS_DOCKER = Boolean(
  process.env.CONTAINER || process.env.DOCKER_CONTAINER
);

const AUTH_STATE_PATH =
  process.env.PERMIT_WORKER_AUTH_STATE_PATH?.trim() ||
  "/app/data/auth-state.json";

// ============================================================================
// Session Manager (Singleton for API Server)
// ============================================================================

const sessionManager = new BrowserSessionManager({
  name: "permit-worker",
  statePath: AUTH_STATE_PATH,
  headless: config.headless,
  launchArgs: ["--disable-popup-blocking"],
  viewport: RESOLVED_VIEWPORT,
  keepAliveEnabled: KEEP_ALIVE_ENABLED,
  keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,

  async checkLoggedIn(page: Page): Promise<boolean> {
    try {
      await page.goto(config.dustPermitUrl, {
        timeout: 60_000,
        waitUntil: "networkidle",
      });
      if (page.url().includes("disclaimer")) {
        const { handleDisclaimer } = await import("./login");
        await handleDisclaimer(page);
      }
      return await page
        .locator(portal.loggedIn.myDustApps)
        .isVisible()
        .catch(() => false);
    } catch {
      return false;
    }
  },

  async keepAliveCheck(session) {
    const response = await session.instance.context.request.get(
      config.dustPermitUrl,
      { failOnStatusCode: false, timeout: KEEPALIVE_REQUEST_TIMEOUT_MS }
    );
    const body = await response.text().catch(() => "");
    const lower = body.toLowerCase();
    const hasLoginMarkers =
      lower.includes("login") &&
      (lower.includes("username") ||
        lower.includes("password") ||
        lower.includes("userid"));

    if (response.ok() && !hasLoginMarkers) {
      return { alive: true };
    }
    return {
      alive: false,
      reason: hasLoginMarkers
        ? "Portal session expired"
        : `Portal keepalive HTTP ${response.status()}`,
    };
  },

  async relogin(session) {
    if (session.operationDepth > 0) {
      return false;
    }
    const loggedIn = await login(session.instance.page);
    return loggedIn;
  },
});

// ============================================================================
// Public Session API (delegates to sessionManager)
// ============================================================================

/**
 * Get existing browser session or create a new one.
 * Uses deduplication to prevent concurrent creation from orphaning Chromium processes.
 */
export function getOrCreateBrowserSession(): Promise<BrowserSession> {
  return sessionManager.getOrCreateSession();
}

/**
 * Ensure the singleton browser session is available and logged in.
 */
export async function ensureBrowserSessionReady(options?: {
  forceRelogin?: boolean;
}): Promise<BrowserSession> {
  const session = await sessionManager.getOrCreateSession();
  if (options?.forceRelogin || !session.isLoggedIn) {
    if (session.operationDepth > 0) {
      return session; // Don't relogin while another operation is using the page
    }
    const succeeded = await login(session.instance.page);
    if (succeeded) {
      session.isLoggedIn = true;
      session.portalReady = true;
      session.lastLoginAtMs = Date.now();
      session.lastError = null;
      await sessionManager.saveState("force-relogin");
    } else {
      session.isLoggedIn = false;
      session.portalReady = false;
      session.lastError = "Failed to login to portal";
    }
  }
  return session;
}

/**
 * Safely run an operation while marking the shared session as busy.
 */
export async function withBrowserSessionOperation<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const session = sessionManager.getSession();
  if (!session) {
    return await fn();
  }
  return sessionManager.withOperation(operation, () => fn());
}

/**
 * Keep the existing session alive and attempt re-login if needed.
 */
export function keepBrowserSessionAlive(_options?: {
  allowRelogin?: boolean;
  force?: boolean;
}): Promise<KeepAliveResult> {
  return sessionManager.keepAlive();
}

/**
 * Close the browser session and reset state.
 */
export function closeBrowserSession(): Promise<void> {
  return sessionManager.close();
}

/**
 * Emergency kill switch for in-flight operations.
 *
 * Force-closes the current browser session to interrupt any running operation.
 */
export function abortBrowserSessionOperation(
  reason?: string
): Promise<AbortOperationResult> {
  return sessionManager.abortCurrentOperation(reason ?? "Operation aborted");
}

/**
 * Get current session status (for API response).
 */
export function getSessionStatus(): SessionStatus {
  return sessionManager.getStatus();
}

/**
 * Get page and context from current session (if exists).
 * Returns null if no session is active.
 */
export function getSessionPageAndContext(): {
  page: Page;
  context: BrowserContext;
} | null {
  const session = sessionManager.getSession();
  if (!session) {
    return null;
  }
  return {
    context: session.instance.context,
    page: session.instance.page,
  };
}

/**
 * Paste provided text into the active element of the browser session.
 */
export async function pasteBrowserClipboardText(
  text: string
): Promise<BrowserClipboardWriteResult> {
  if (!text.length) {
    return {
      inserted: false,
      reason: "Clipboard text is empty",
      success: false,
    };
  }

  const session = await ensureBrowserSessionReady();
  return await withBrowserSessionOperation("clipboard-paste", async () => {
    try {
      await session.instance.page.keyboard.insertText(text);
      return {
        inserted: true,
        success: true,
      };
    } catch (error) {
      return {
        inserted: false,
        reason: error instanceof Error ? error.message : String(error),
        success: false,
      };
    }
  });
}

/**
 * Read selected text from the active element/window selection.
 */
export async function copyBrowserSelectionText(): Promise<BrowserClipboardReadResult> {
  const session = await ensureBrowserSessionReady();
  return await withBrowserSessionOperation("clipboard-copy", async () => {
    try {
      const text = await session.instance.page.evaluate(() => {
        const active = document.activeElement;

        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement
        ) {
          const start = active.selectionStart ?? 0;
          const end = active.selectionEnd ?? 0;
          if (end > start) {
            return active.value.slice(start, end);
          }
          return "";
        }

        return window.getSelection()?.toString() ?? "";
      });

      return {
        success: true,
        text: typeof text === "string" ? text : "",
      };
    } catch (error) {
      return {
        reason: error instanceof Error ? error.message : String(error),
        success: false,
        text: "",
      };
    }
  });
}

// ============================================================================
// One-Off Browser Operations (withBrowser)
// ============================================================================

function waitForManualClose(timeoutMs: number): Promise<"signal" | "timeout"> {
  return new Promise((resolve) => {
    const finish = (reason: "signal" | "timeout") => {
      clearTimeout(timer);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve(reason);
    };

    const onSignal = () => finish("signal");
    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function holdForManualReview(
  operation: string,
  timeoutMs: number,
  reason?: string
): Promise<void> {
  const timeoutMinutes = (timeoutMs / 60_000).toFixed(1);
  const prefix = `\n[${operation.toUpperCase()}]`;
  if (reason) {
    console.log(`${prefix} ${reason}`);
  }
  console.log(
    `${prefix} Keeping browser open for manual review (Ctrl+C to close, auto-close in ${timeoutMinutes} min).`
  );

  const closeReason = await waitForManualClose(timeoutMs);
  if (closeReason === "timeout") {
    console.log(`${prefix} Manual-review timeout reached, closing browser.`);
  } else {
    console.log(`${prefix} Close signal received, closing browser.`);
  }
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
  const { operation, headless, keepOpen = false, keepOpenTimeoutMs } = options;
  const manualReviewTimeoutMs = getKeepOpenTimeoutMs(keepOpenTimeoutMs);
  let instance: BrowserInstance | null = null;

  try {
    // 1. Create browser
    instance = await createBrowser({
      headless: headless ?? getHeadlessSetting(operation),
    });

    // 2. Login
    const loggedIn = await login(instance.page);
    if (loggedIn) {
      // Persist auth state for future session recovery
      try {
        await instance.context.storageState({ path: AUTH_STATE_PATH });
      } catch {
        // Non-fatal
      }
    }
    if (!loggedIn) {
      if (keepOpen) {
        await holdForManualReview(
          operation,
          manualReviewTimeoutMs,
          "Login failed."
        );
      }
      await closeBrowser(instance);
      instance = null;
      return {
        error: "Failed to login to portal",
        success: false,
      } as T;
    }

    // 3. Execute the operation
    const result = await fn(instance);

    // 4. Handle cleanup or keeping open
    if (keepOpen) {
      await holdForManualReview(operation, manualReviewTimeoutMs);
    }
    await closeBrowser(instance);
    instance = null;

    return result;
  } catch (error) {
    if (instance) {
      try {
        if (keepOpen) {
          await holdForManualReview(
            operation,
            manualReviewTimeoutMs,
            "Operation failed."
          );
        }
        await closeBrowser(instance);
      } catch {
        // Ignore secondary errors during cleanup
      }
    }
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    } as T;
  }
}

// ============================================================================
// Low-Level Browser Creation (used by withBrowser for one-off operations)
// ============================================================================

/**
 * Create a Playwright browser instance.
 *
 * Launches Chromium with settings optimized for the ADF portal:
 * - Popup blocking disabled (required for ADF popups)
 * - Automation detection disabled
 * - Docker-safe flags in container environments (both headed and headless)
 * - Loads storageState from disk when available for session recovery
 */
export async function createBrowser(options?: {
  headless?: boolean;
}): Promise<BrowserInstance> {
  const headless = options?.headless ?? true;

  const launchArgs = [
    "--disable-popup-blocking",
    "--disable-blink-features=AutomationControlled",
  ];

  // Docker-safe flags apply in ANY container mode (headed or headless).
  // The container always has ipc:host but these flags add defense-in-depth.
  if (headless || IS_DOCKER) {
    launchArgs.push("--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu");
  }

  const browser = await chromium.launch({
    args: launchArgs,
    headless,
  });

  const hasState = existsSync(AUTH_STATE_PATH);
  const context = await browser.newContext({
    storageState: hasState ? AUTH_STATE_PATH : undefined,
    viewport: {
      height: RESOLVED_VIEWPORT.height,
      width: RESOLVED_VIEWPORT.width,
    },
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
