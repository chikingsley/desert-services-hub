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
  keepOpen?: boolean;
  keepOpenTimeoutMs?: number;
  operation: keyof typeof config.scripts;
}

const DEFAULT_KEEP_OPEN_TIMEOUT_MS = 15 * 60 * 1000;
const MIN_KEEP_OPEN_TIMEOUT_MS = 30_000;
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_KEEP_ALIVE_INTERVAL_MS = 60_000;
const KEEPALIVE_REQUEST_TIMEOUT_MS = 20_000;
const KEEPALIVE_RETRY_TIMEOUT_MS = 30_000;
const KEEPALIVE_MAX_RETRIES = 1;
const KEEPALIVE_RETRY_DELAY_MS = 3000;
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
// Session Management (Singleton for API Server)
// ============================================================================

export interface BrowserSession {
  currentOperation: string | null;
  instance: BrowserInstance;
  isLoggedIn: boolean;
  lastActivityAtMs: number;
  lastError: string | null;
  lastKeepAliveAtMs: number | null;
  lastLoginAtMs: number | null;
  operationDepth: number;
  portalReady: boolean;
  startedAtMs: number;
}

let globalSession: BrowserSession | null = null;
let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
let keepAliveInFlight: Promise<BrowserKeepAliveResult> | null = null;
let sessionCreationInFlight: Promise<BrowserSession> | null = null;
let consecutiveReloginFailures = 0;
const MAX_CONSECUTIVE_RELOGIN_FAILURES = 3;
const RELOGIN_CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

export interface BrowserSessionStatus {
  active: boolean;
  busy: boolean;
  currentOperation: string | null;
  currentUrl: string | null;
  isLoggedIn: boolean;
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  lastActivityAt: string | null;
  lastError: string | null;
  lastKeepAliveAt: string | null;
  lastLoginAt: string | null;
  portalReady: boolean;
  startedAt: string | null;
  viewportHeight: number;
  viewportWidth: number;
}

export interface BrowserKeepAliveResult {
  active: boolean;
  isLoggedIn: boolean;
  portalReady: boolean;
  reason?: string;
  reloginAttempted?: boolean;
  reloginSucceeded?: boolean;
  skipped: boolean;
  success: boolean;
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
  clearTimeout(keepAliveTimer);
  keepAliveTimer = null;
}

/** Compute next keepalive delay with jitter to avoid perfectly periodic requests. */
function nextKeepAliveDelayMs(): number {
  // Add 0-30s jitter to avoid bot-like fixed-interval patterns
  const jitter = Math.random() * 30_000;
  return KEEP_ALIVE_INTERVAL_MS + jitter;
}

function scheduleNextKeepAlive(): void {
  if (!(KEEP_ALIVE_ENABLED && globalSession)) {
    return;
  }
  keepAliveTimer = setTimeout(() => {
    keepBrowserSessionAlive({ allowRelogin: true })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (globalSession) {
          globalSession.lastError = `Keepalive failed: ${message}`;
        }
        console.error(`[Session] Keepalive failed: ${message}`);
      })
      .finally(() => {
        scheduleNextKeepAlive();
      });
  }, nextKeepAliveDelayMs());
  keepAliveTimer.unref?.();
}

function startKeepAliveLoop(): void {
  if (!KEEP_ALIVE_ENABLED || keepAliveTimer) {
    return;
  }
  scheduleNextKeepAlive();
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

  // Circuit breaker: stop hammering the portal after repeated failures
  if (consecutiveReloginFailures >= MAX_CONSECUTIVE_RELOGIN_FAILURES) {
    console.error(
      `[Session] Circuit breaker open: ${consecutiveReloginFailures} consecutive relogin failures, cooling down`
    );
    session.lastError = `Relogin circuit breaker open (${consecutiveReloginFailures} failures)`;
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

    if (loggedIn) {
      consecutiveReloginFailures = 0;
    } else {
      consecutiveReloginFailures += 1;
      if (consecutiveReloginFailures >= MAX_CONSECUTIVE_RELOGIN_FAILURES) {
        console.error(
          `[Session] Circuit breaker tripped after ${consecutiveReloginFailures} failures. Will reset after ${RELOGIN_CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s.`
        );
        setTimeout(() => {
          consecutiveReloginFailures = 0;
          console.log("[Session] Relogin circuit breaker reset");
        }, RELOGIN_CIRCUIT_BREAKER_COOLDOWN_MS).unref?.();
      }
    }
    return loggedIn;
  } finally {
    session.operationDepth = Math.max(0, session.operationDepth - 1);
    if (session.operationDepth === 0) {
      session.currentOperation = null;
    }
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
      active: false,
      isLoggedIn: false,
      portalReady: false,
      reason: "No active browser session",
      skipped: true,
      success: false,
    };
  }

  const session = globalSession;
  if (!force && session.operationDepth > 0) {
    return {
      active: true,
      isLoggedIn: session.isLoggedIn,
      portalReady: session.portalReady,
      reason: "Session busy",
      skipped: true,
      success: true,
    };
  }

  // Try the keepalive request with retries for transient failures (timeouts, network blips).
  // A timeout does NOT mean the session expired — it means the portal was slow.
  let lastError: string | undefined;
  for (let attempt = 0; attempt <= KEEPALIVE_MAX_RETRIES; attempt++) {
    try {
      const timeoutMs =
        attempt === 0
          ? KEEPALIVE_REQUEST_TIMEOUT_MS
          : KEEPALIVE_RETRY_TIMEOUT_MS;
      const response = await session.instance.context.request.get(
        config.dustPermitUrl,
        {
          failOnStatusCode: false,
          timeout: timeoutMs,
        }
      );
      const body = await response.text().catch(() => "");
      const lowerBody = body.toLowerCase();
      const hasLoginMarkers =
        lowerBody.includes("login") &&
        (lowerBody.includes("username") ||
          lowerBody.includes("password") ||
          lowerBody.includes("userid"));

      session.lastKeepAliveAtMs = Date.now();
      touchSessionActivity();

      // Portal pages vary (dashboard/detail/about), but the login page consistently
      // includes credential fields. Treat "no login form + HTTP 200" as logged in
      // to avoid false negatives on pages like "Last Pinned Home" or detail screens.
      if (response.ok() && !hasLoginMarkers) {
        session.isLoggedIn = true;
        session.portalReady = true;
        session.lastError = null;
        return {
          active: true,
          isLoggedIn: true,
          portalReady: true,
          skipped: false,
          success: true,
        };
      }

      // Definitive signal: portal responded but session expired or HTTP error.
      // No need to retry — go straight to relogin.
      session.isLoggedIn = false;
      session.portalReady = false;
      session.lastError = hasLoginMarkers
        ? "Portal session expired"
        : `Portal keepalive HTTP ${response.status()}`;

      if (!allowRelogin) {
        return {
          active: true,
          isLoggedIn: false,
          portalReady: false,
          reason: session.lastError,
          skipped: false,
          success: false,
        };
      }

      const reloginSucceeded = await reloginSession(session);
      return {
        active: true,
        isLoggedIn: session.isLoggedIn,
        portalReady: session.portalReady,
        reason: reloginSucceeded ? undefined : "Re-login failed",
        reloginAttempted: true,
        reloginSucceeded,
        skipped: false,
        success: reloginSucceeded,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;

      if (attempt < KEEPALIVE_MAX_RETRIES) {
        console.warn(
          `[Session] Keepalive attempt ${attempt + 1} failed (${message}), retrying in ${KEEPALIVE_RETRY_DELAY_MS}ms...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, KEEPALIVE_RETRY_DELAY_MS)
        );
      }
    }
  }

  // All retries exhausted — transient failure (timeout/network).
  // Attempt relogin if allowed, since the page-level session might need a fresh navigation.
  session.lastError = `Keepalive request failed: ${lastError}`;
  touchSessionActivity();

  if (allowRelogin) {
    console.warn(
      "[Session] Keepalive timed out after retries, attempting relogin..."
    );
    const reloginSucceeded = await reloginSession(session);
    if (reloginSucceeded) {
      return {
        active: true,
        isLoggedIn: true,
        portalReady: true,
        reloginAttempted: true,
        reloginSucceeded: true,
        skipped: false,
        success: true,
      };
    }
  }

  // Everything failed — now mark session as not logged in
  session.isLoggedIn = false;
  session.portalReady = false;
  return {
    active: true,
    isLoggedIn: false,
    portalReady: false,
    reason: session.lastError,
    reloginAttempted: allowRelogin,
    reloginSucceeded: false,
    skipped: false,
    success: false,
  };
}

/**
 * Internal session creation — called only via the deduplication wrapper.
 */
async function createSession(): Promise<BrowserSession> {
  console.log("[Session] Creating new browser session...");
  const instance = await createBrowser({ headless: config.headless });

  // Register disconnect listener to detect crashes between keepalive intervals
  instance.browser.on("disconnected", () => {
    console.error("[Session] Browser disconnected unexpectedly");
    clearKeepAliveLoop();
    globalSession = null;
    keepAliveInFlight = null;
  });

  // Attempt login
  const loggedIn = await login(instance.page);
  const now = Date.now();

  globalSession = {
    currentOperation: null,
    instance,
    isLoggedIn: loggedIn,
    lastActivityAtMs: now,
    lastError: loggedIn ? null : "Failed to login to portal",
    lastKeepAliveAtMs: null,
    lastLoginAtMs: loggedIn ? now : null,
    operationDepth: 0,
    portalReady: loggedIn,
    startedAtMs: now,
  };
  consecutiveReloginFailures = 0;
  startKeepAliveLoop();

  console.log(
    `[Session] Browser ready, logged in: ${globalSession.isLoggedIn}`
  );
  return globalSession;
}

/**
 * Get existing browser session or create a new one.
 * Uses deduplication to prevent concurrent creation from orphaning Chromium processes.
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

  // Deduplicate concurrent creation requests — same pattern as keepAliveInFlight
  if (!sessionCreationInFlight) {
    sessionCreationInFlight = createSession().finally(() => {
      sessionCreationInFlight = null;
    });
  }
  return sessionCreationInFlight;
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
      active: false,
      isLoggedIn: false,
      portalReady: false,
      reason: "No active browser session",
      skipped: true,
      success: false,
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
      touchSessionActivity();
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

      touchSessionActivity();
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
    context: globalSession.instance.context,
    page: globalSession.instance.page,
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
    busy: (globalSession?.operationDepth ?? 0) > 0,
    currentOperation: globalSession?.currentOperation ?? null,
    currentUrl,
    isLoggedIn: globalSession?.isLoggedIn ?? false,
    keepAliveEnabled: KEEP_ALIVE_ENABLED,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
    lastActivityAt: isoOrNull(globalSession?.lastActivityAtMs ?? null),
    lastError: globalSession?.lastError ?? null,
    lastKeepAliveAt: isoOrNull(globalSession?.lastKeepAliveAtMs ?? null),
    lastLoginAt: isoOrNull(globalSession?.lastLoginAtMs ?? null),
    portalReady: globalSession?.portalReady ?? false,
    startedAt: isoOrNull(globalSession?.startedAtMs ?? null),
    viewportHeight: RESOLVED_VIEWPORT.height,
    viewportWidth: RESOLVED_VIEWPORT.width,
  };
}

// ============================================================================
// Low-Level Browser Creation
// ============================================================================

const IS_DOCKER = Boolean(
  process.env.CONTAINER || process.env.DOCKER_CONTAINER
);

/**
 * Create a Playwright browser instance.
 *
 * Launches Chromium with settings optimized for the ADF portal:
 * - Popup blocking disabled (required for ADF popups)
 * - Automation detection disabled
 * - Docker-safe flags in container environments (both headed and headless)
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

  const context = await browser.newContext({
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
