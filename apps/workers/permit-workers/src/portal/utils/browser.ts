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
import { navigateToMyDustApps } from "./helpers";
import { login } from "./login";

export type { BrowserInstance } from "@/portal/types";

/**
 * Options for the withBrowser wrapper
 */
export interface BrowserOptions {
  headless?: boolean;
  operation: keyof typeof config.scripts;
  keepOpen?: boolean;
  keepOpenTimeoutMs?: number;
}

const DEFAULT_KEEP_OPEN_TIMEOUT_MS = 15 * 60 * 1000;
const MIN_KEEP_OPEN_TIMEOUT_MS = 30_000;
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_KEEP_ALIVE_INTERVAL_MS = 60_000;
const DEFAULT_PORTAL_HOME_PIN_INTERVAL_MS = 10 * 60 * 1000;
const MIN_PORTAL_HOME_PIN_INTERVAL_MS = 60_000;

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

const KEEP_ALIVE_ENABLED =
  process.env.PERMIT_WORKER_KEEP_ALIVE_ENABLED !== "false";
const KEEP_ALIVE_INTERVAL_MS = Math.max(
  MIN_KEEP_ALIVE_INTERVAL_MS,
  parsePositiveInt(process.env.PERMIT_WORKER_KEEP_ALIVE_INTERVAL_MS) ??
    DEFAULT_KEEP_ALIVE_INTERVAL_MS
);
const PORTAL_HOME_PIN_ENABLED =
  process.env.PERMIT_WORKER_PORTAL_HOME_PIN_ENABLED !== "false";
const PORTAL_HOME_PIN_INTERVAL_MS = Math.max(
  MIN_PORTAL_HOME_PIN_INTERVAL_MS,
  parsePositiveInt(process.env.PERMIT_WORKER_PORTAL_HOME_PIN_INTERVAL_MS) ??
    DEFAULT_PORTAL_HOME_PIN_INTERVAL_MS
);

function isoOrNull(ts: number | null): string | null {
  if (!ts) {
    return null;
  }
  return new Date(ts).toISOString();
}

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
        success: false,
        error: "Failed to login to portal",
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
  portalReady: boolean;
  startedAtMs: number;
  lastActivityAtMs: number;
  lastKeepAliveAtMs: number | null;
  lastLoginAtMs: number | null;
  lastPortalPinAtMs: number | null;
  lastError: string | null;
  operationDepth: number;
  currentOperation: string | null;
}

let globalSession: BrowserSession | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let keepAliveInFlight: Promise<BrowserKeepAliveResult> | null = null;

export interface BrowserSessionStatus {
  active: boolean;
  isLoggedIn: boolean;
  portalReady: boolean;
  busy: boolean;
  currentOperation: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  lastKeepAliveAt: string | null;
  lastLoginAt: string | null;
  lastPortalPinAt: string | null;
  lastError: string | null;
  currentUrl: string | null;
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  portalHomePinEnabled: boolean;
  portalHomePinIntervalMs: number;
}

export interface BrowserKeepAliveResult {
  success: boolean;
  active: boolean;
  isLoggedIn: boolean;
  portalReady: boolean;
  skipped: boolean;
  reason?: string;
  reloginAttempted?: boolean;
  reloginSucceeded?: boolean;
}

function touchSessionActivity(): void {
  if (!globalSession) {
    return;
  }
  globalSession.lastActivityAtMs = Date.now();
}

function clearKeepAliveLoop(): void {
  if (!keepAliveTimer) {
    return;
  }
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function startKeepAliveLoop(): void {
  if (!KEEP_ALIVE_ENABLED || keepAliveTimer) {
    return;
  }

  keepAliveTimer = setInterval(() => {
    keepBrowserSessionAlive({ allowRelogin: true }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (globalSession) {
        globalSession.lastError = `Keepalive failed: ${message}`;
      }
      console.error(`[Session] Keepalive failed: ${message}`);
    });
  }, KEEP_ALIVE_INTERVAL_MS);

  keepAliveTimer.unref?.();
}

function setSessionLoginState(isLoggedIn: boolean, error?: string): void {
  if (!globalSession) {
    return;
  }
  globalSession.isLoggedIn = isLoggedIn;
  globalSession.portalReady = isLoggedIn;
  if (isLoggedIn) {
    globalSession.lastLoginAtMs = Date.now();
    globalSession.lastError = null;
  } else if (error) {
    globalSession.lastError = error;
  }
  touchSessionActivity();
}

async function ensureSessionStillAlive(
  session: BrowserSession
): Promise<boolean> {
  if (!session.instance.browser.isConnected()) {
    return false;
  }
  try {
    await session.instance.page.title();
    return true;
  } catch {
    return false;
  }
}

async function reloginSession(session: BrowserSession): Promise<boolean> {
  if (session.operationDepth > 0) {
    return false;
  }

  session.currentOperation = "relogin";
  session.operationDepth += 1;
  try {
    const loggedIn = await login(session.instance.page);
    session.isLoggedIn = loggedIn;
    session.portalReady = loggedIn;
    session.lastLoginAtMs = loggedIn ? Date.now() : session.lastLoginAtMs;
    session.lastError = loggedIn ? null : "Re-login failed";
    touchSessionActivity();
    return loggedIn;
  } finally {
    session.operationDepth = Math.max(0, session.operationDepth - 1);
    if (session.operationDepth === 0) {
      session.currentOperation = null;
    }
  }
}

async function maybePinPortalHomeIfIdle(
  session: BrowserSession
): Promise<void> {
  if (!PORTAL_HOME_PIN_ENABLED) {
    return;
  }
  if (session.operationDepth > 0) {
    return;
  }
  const now = Date.now();
  if (
    session.lastPortalPinAtMs &&
    now - session.lastPortalPinAtMs < PORTAL_HOME_PIN_INTERVAL_MS
  ) {
    return;
  }

  try {
    const currentUrl = session.instance.page.url();
    if (!currentUrl.includes("dm.maricopa.gov")) {
      await session.instance.page.goto(config.dustPermitUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    }
    const pinned = await navigateToMyDustApps(session.instance.page);
    if (pinned) {
      session.lastPortalPinAtMs = Date.now();
      touchSessionActivity();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.lastError = `Portal home pin failed: ${message}`;
  }
}

async function runKeepAlive(options?: {
  allowRelogin?: boolean;
  force?: boolean;
}): Promise<BrowserKeepAliveResult> {
  const allowRelogin = options?.allowRelogin ?? true;
  const force = options?.force ?? false;

  if (!globalSession) {
    return {
      success: false,
      active: false,
      isLoggedIn: false,
      portalReady: false,
      skipped: true,
      reason: "No active browser session",
    };
  }

  const session = globalSession;
  if (!force && session.operationDepth > 0) {
    return {
      success: true,
      active: true,
      isLoggedIn: session.isLoggedIn,
      portalReady: session.portalReady,
      skipped: true,
      reason: "Session busy",
    };
  }

  try {
    const response = await session.instance.context.request.get(
      config.dustPermitUrl,
      {
        failOnStatusCode: false,
        timeout: 20_000,
      }
    );
    const body = await response.text().catch(() => "");
    const lowerBody = body.toLowerCase();
    const hasLoggedInMarkers =
      lowerBody.includes("my dust control") ||
      lowerBody.includes("my dust apps") ||
      lowerBody.includes("logout");
    const hasLoginMarkers =
      lowerBody.includes("login") &&
      (lowerBody.includes("username") ||
        lowerBody.includes("password") ||
        lowerBody.includes("userid"));

    session.lastKeepAliveAtMs = Date.now();
    touchSessionActivity();

    if (response.ok && hasLoggedInMarkers) {
      session.isLoggedIn = true;
      session.portalReady = true;
      session.lastError = null;
      await maybePinPortalHomeIfIdle(session);
      return {
        success: true,
        active: true,
        isLoggedIn: true,
        portalReady: true,
        skipped: false,
      };
    }

    session.isLoggedIn = false;
    session.portalReady = false;
    session.lastError = hasLoginMarkers
      ? "Portal session expired"
      : `Portal keepalive HTTP ${response.status}`;

    if (!allowRelogin) {
      return {
        success: false,
        active: true,
        isLoggedIn: false,
        portalReady: false,
        skipped: false,
        reason: session.lastError,
      };
    }

    const reloginSucceeded = await reloginSession(session);
    return {
      success: reloginSucceeded,
      active: true,
      isLoggedIn: session.isLoggedIn,
      portalReady: session.portalReady,
      skipped: false,
      reason: reloginSucceeded ? undefined : "Re-login failed",
      reloginAttempted: true,
      reloginSucceeded,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.lastError = `Keepalive request failed: ${message}`;
    session.isLoggedIn = false;
    session.portalReady = false;
    touchSessionActivity();
    return {
      success: false,
      active: true,
      isLoggedIn: false,
      portalReady: false,
      skipped: false,
      reason: session.lastError,
      reloginAttempted: false,
      reloginSucceeded: false,
    };
  }
}

/**
 * Get existing browser session or create a new one.
 * Used by API routes to share a single browser instance.
 */
export async function getOrCreateBrowserSession(): Promise<BrowserSession> {
  if (globalSession) {
    const alive = await ensureSessionStillAlive(globalSession);
    if (alive) {
      touchSessionActivity();
      return globalSession;
    }
    await closeBrowserSession().catch(() => {
      // Best effort cleanup before re-creating session.
    });
  }

  console.log("[Session] Creating new browser session...");
  const instance = await createBrowser({ headless: config.headless });

  // Attempt login
  const loggedIn = await login(instance.page);
  const now = Date.now();

  globalSession = {
    instance,
    isLoggedIn: loggedIn,
    portalReady: loggedIn,
    startedAtMs: now,
    lastActivityAtMs: now,
    lastKeepAliveAtMs: null,
    lastLoginAtMs: loggedIn ? now : null,
    lastPortalPinAtMs: null,
    lastError: loggedIn ? null : "Failed to login to portal",
    operationDepth: 0,
    currentOperation: null,
  };
  startKeepAliveLoop();

  console.log(
    `[Session] Browser ready, logged in: ${globalSession.isLoggedIn}`
  );
  return globalSession;
}

/**
 * Ensure the singleton browser session is available and logged in.
 */
export async function ensureBrowserSessionReady(options?: {
  forceRelogin?: boolean;
}): Promise<BrowserSession> {
  const session = await getOrCreateBrowserSession();
  if (options?.forceRelogin || !session.isLoggedIn) {
    const reloginSucceeded = await reloginSession(session);
    if (!reloginSucceeded) {
      setSessionLoginState(false, "Failed to login to portal");
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
  if (!globalSession) {
    return await fn();
  }

  const session = globalSession;
  session.operationDepth += 1;
  session.currentOperation = operation;
  touchSessionActivity();

  try {
    const result = await fn();
    session.lastError = null;
    touchSessionActivity();
    return result;
  } catch (error) {
    session.lastError = error instanceof Error ? error.message : String(error);
    touchSessionActivity();
    throw error;
  } finally {
    session.operationDepth = Math.max(0, session.operationDepth - 1);
    if (session.operationDepth === 0) {
      session.currentOperation = null;
    }
  }
}

/**
 * Keep the existing session alive and attempt re-login if needed.
 */
export async function keepBrowserSessionAlive(options?: {
  allowRelogin?: boolean;
  force?: boolean;
}): Promise<BrowserKeepAliveResult> {
  if (!globalSession) {
    return {
      success: false,
      active: false,
      isLoggedIn: false,
      portalReady: false,
      skipped: true,
      reason: "No active browser session",
    };
  }

  if (!options?.force && keepAliveInFlight) {
    return await keepAliveInFlight;
  }

  keepAliveInFlight = runKeepAlive(options);
  try {
    return await keepAliveInFlight;
  } finally {
    keepAliveInFlight = null;
  }
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
    clearKeepAliveLoop();
    return;
  }

  console.log("[Session] Closing browser session...");
  clearKeepAliveLoop();
  await closeBrowser(globalSession.instance);
  globalSession = null;
  keepAliveInFlight = null;
  console.log("[Session] Browser closed");
}

/**
 * Get current session status (for API response).
 */
export function getSessionStatus(): BrowserSessionStatus {
  const currentUrl = globalSession?.instance.page.url() ?? null;
  return {
    active: globalSession !== null,
    isLoggedIn: globalSession?.isLoggedIn ?? false,
    portalReady: globalSession?.portalReady ?? false,
    busy: (globalSession?.operationDepth ?? 0) > 0,
    currentOperation: globalSession?.currentOperation ?? null,
    startedAt: isoOrNull(globalSession?.startedAtMs ?? null),
    lastActivityAt: isoOrNull(globalSession?.lastActivityAtMs ?? null),
    lastKeepAliveAt: isoOrNull(globalSession?.lastKeepAliveAtMs ?? null),
    lastLoginAt: isoOrNull(globalSession?.lastLoginAtMs ?? null),
    lastPortalPinAt: isoOrNull(globalSession?.lastPortalPinAtMs ?? null),
    lastError: globalSession?.lastError ?? null,
    currentUrl,
    keepAliveEnabled: KEEP_ALIVE_ENABLED,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
    portalHomePinEnabled: PORTAL_HOME_PIN_ENABLED,
    portalHomePinIntervalMs: PORTAL_HOME_PIN_INTERVAL_MS,
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
