/**
 * Shared Browser Session Manager
 *
 * Generic singleton Playwright browser session with:
 * - storageState persistence (save/restore across restarts)
 * - Keep-alive loop with jitter and circuit breaker
 * - Operation depth tracking (busy/idle)
 * - Session status reporting
 *
 * Each worker provides portal-specific behavior via BrowserSessionConfig.
 * Shared by permit-worker (Maricopa) and bc-worker (BuildingConnected).
 *
 * Lives alongside lib/vnc/ as shared container infrastructure.
 */

// biome-ignore lint/nursery/noExcessiveLinesPerFile: Shared browser session manager is intentionally centralized.
import { existsSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

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

export interface SessionStatus {
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

export interface KeepAliveResult {
  active: boolean;
  isLoggedIn: boolean;
  portalReady: boolean;
  reason?: string;
  reloginAttempted?: boolean;
  reloginSucceeded?: boolean;
  skipped: boolean;
  success: boolean;
}

export interface AbortOperationResult {
  activeBeforeAbort: boolean;
  busyBeforeAbort: boolean;
  operation: string | null;
  reason: string;
  stopped: boolean;
}

/**
 * Portal-specific behavior injected by each worker.
 */
export interface BrowserSessionConfig {
  acceptDownloads?: boolean;

  /**
   * Check if the current page indicates a logged-in session.
   * Called after navigating to the portal or after restoring storageState.
   * Return true if logged in, false if login page detected.
   */
  checkLoggedIn: (page: Page) => Promise<boolean>;

  /** Chromium launch options. */
  headless: boolean;

  /**
   * Perform a keep-alive check. Navigate to the portal and verify session.
   * Return true if session is still alive, false if expired.
   * This runs on the session's page — callers should NOT close it.
   */
  keepAliveCheck: (session: BrowserSession) => Promise<{
    alive: boolean;
    reason?: string;
  }>;

  /** Keep-alive settings. */
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  launchArgs?: string[];
  /** Display name for logging, e.g. "permit-worker" or "bc-worker". */
  name: string;

  /**
   * Attempt automatic relogin after session expiry.
   * Return true if relogin succeeded, false if not possible (e.g. 2FA required).
   * Return null if auto-relogin is not supported (manual auth required).
   */
  relogin: ((session: BrowserSession) => Promise<boolean>) | null;

  /** Path to the storageState JSON file on a Docker volume. */
  statePath: string;
  userAgent?: string;
  viewport: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoOrNull(ts: number | null): string | null {
  return ts ? new Date(ts).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Session Manager Class
// ---------------------------------------------------------------------------

const DEFAULT_JITTER_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
const KEEPALIVE_RETRY_DELAY_MS = 3000;
const KEEPALIVE_MAX_RETRIES = 1;

export class BrowserSessionManager {
  private readonly config: BrowserSessionConfig;
  private readonly log: string;

  private session: BrowserSession | null = null;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveInFlight: Promise<KeepAliveResult> | null = null;
  private creationInFlight: Promise<BrowserSession> | null = null;
  private consecutiveFailures = 0;

  constructor(config: BrowserSessionConfig) {
    this.config = config;
    this.log = `[${config.name}]`;
  }

  // -------------------------------------------------------------------------
  // storageState Persistence
  // -------------------------------------------------------------------------

  async saveState(label: string): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      await this.session.instance.context.storageState({
        path: this.config.statePath,
      });
      console.log(`${this.log} Saved auth state (${label})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`${this.log} Failed to save auth state (${label}): ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Activity Tracking
  // -------------------------------------------------------------------------

  private touchActivity(): void {
    if (this.session) {
      this.session.lastActivityAtMs = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // Keep-Alive Loop
  // -------------------------------------------------------------------------

  private clearKeepAliveLoop(): void {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private nextDelayMs(): number {
    return this.config.keepAliveIntervalMs + Math.random() * DEFAULT_JITTER_MS;
  }

  private scheduleNextKeepAlive(): void {
    if (!(this.config.keepAliveEnabled && this.session)) {
      return;
    }
    this.keepAliveTimer = setTimeout(() => {
      this.keepAlive()
        .catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          if (this.session) {
            this.session.lastError = `Keepalive failed: ${msg}`;
          }
          console.error(`${this.log} Keepalive failed: ${msg}`);
        })
        .finally(() => {
          this.scheduleNextKeepAlive();
        });
    }, this.nextDelayMs());
    this.keepAliveTimer.unref?.();
  }

  private startKeepAliveLoop(): void {
    if (!this.config.keepAliveEnabled || this.keepAliveTimer) {
      return;
    }
    this.scheduleNextKeepAlive();
  }

  private async attemptRelogin(
    session: BrowserSession
  ): Promise<KeepAliveResult | null> {
    if (!this.config.relogin) {
      return null;
    }
    const succeeded = await this.config.relogin(session);
    if (!succeeded) {
      return null;
    }
    session.isLoggedIn = true;
    session.portalReady = true;
    session.lastLoginAtMs = Date.now();
    session.lastError = null;
    this.consecutiveFailures = 0;
    await this.saveState("relogin");
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

  private recordFailure(session: BrowserSession): KeepAliveResult {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `${this.log} Circuit breaker: ${this.consecutiveFailures} consecutive failures`
      );
      setTimeout(() => {
        this.consecutiveFailures = 0;
        console.log(`${this.log} Circuit breaker reset`);
      }, CIRCUIT_BREAKER_COOLDOWN_MS).unref?.();
    }
    return {
      active: true,
      isLoggedIn: false,
      portalReady: false,
      reason: session.lastError ?? undefined,
      reloginAttempted: Boolean(this.config.relogin),
      reloginSucceeded: false,
      skipped: false,
      success: false,
    };
  }

  private async runKeepAlive(): Promise<KeepAliveResult> {
    if (!this.session) {
      return {
        active: false,
        isLoggedIn: false,
        portalReady: false,
        reason: "No active browser session",
        skipped: true,
        success: false,
      };
    }

    const session = this.session;
    if (session.operationDepth > 0) {
      return {
        active: true,
        isLoggedIn: session.isLoggedIn,
        portalReady: session.portalReady,
        reason: "Session busy",
        skipped: true,
        success: true,
      };
    }

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= KEEPALIVE_MAX_RETRIES; attempt++) {
      try {
        const result = await this.config.keepAliveCheck(session);
        session.lastKeepAliveAtMs = Date.now();
        this.touchActivity();

        if (result.alive) {
          session.isLoggedIn = true;
          session.portalReady = true;
          session.lastError = null;
          this.consecutiveFailures = 0;
          await this.saveState("keepalive");
          return {
            active: true,
            isLoggedIn: true,
            portalReady: true,
            skipped: false,
            success: true,
          };
        }

        // Session expired
        session.isLoggedIn = false;
        session.portalReady = false;
        session.lastError = result.reason ?? "Session expired";

        // Try relogin if supported
        const reloginResult = await this.attemptRelogin(session);
        if (reloginResult) {
          return reloginResult;
        }

        // Relogin not available or failed
        return this.recordFailure(session);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        lastError = msg;
        if (attempt < KEEPALIVE_MAX_RETRIES) {
          console.warn(
            `${this.log} Keepalive attempt ${attempt + 1} failed (${msg}), retrying...`
          );
          await new Promise((r) => setTimeout(r, KEEPALIVE_RETRY_DELAY_MS));
        }
      }
    }

    // All retries exhausted
    session.lastError = `Keepalive failed: ${lastError}`;
    session.isLoggedIn = false;
    session.portalReady = false;
    this.touchActivity();
    return {
      active: true,
      isLoggedIn: false,
      portalReady: false,
      reason: session.lastError ?? undefined,
      skipped: false,
      success: false,
    };
  }

  // -------------------------------------------------------------------------
  // Browser Creation
  // -------------------------------------------------------------------------

  private async createBrowser(): Promise<BrowserInstance> {
    const args = [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      ...(this.config.launchArgs ?? []),
    ];

    const browser = await chromium.launch({
      args,
      headless: this.config.headless,
    });

    const hasState = existsSync(this.config.statePath);
    if (hasState) {
      console.log(
        `${this.log} Loading auth state from ${this.config.statePath}`
      );
    }

    const context = await browser.newContext({
      acceptDownloads: this.config.acceptDownloads ?? false,
      storageState: hasState ? this.config.statePath : undefined,
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
    });

    const page = await context.newPage();
    return { browser, context, page };
  }

  private async closeBrowserInstance(instance: BrowserInstance): Promise<void> {
    try {
      await instance.context.close().catch(() => {
        /* swallow */
      });
    } catch {
      // Ignore
    }
    try {
      await instance.browser.close().catch(() => {
        /* swallow */
      });
    } catch {
      // Ignore
    }
  }

  private async createSession(): Promise<BrowserSession> {
    console.log(`${this.log} Creating new browser session...`);
    const instance = await this.createBrowser();

    instance.browser.on("disconnected", () => {
      console.error(`${this.log} Browser disconnected unexpectedly`);
      this.clearKeepAliveLoop();
      this.session = null;
      this.keepAliveInFlight = null;
    });

    // Check if restored storageState gives us a valid session
    const loggedIn = await this.config.checkLoggedIn(instance.page);
    const now = Date.now();

    if (loggedIn) {
      // State was valid — save it back (freshens timestamps)
      try {
        await instance.context.storageState({
          path: this.config.statePath,
        });
      } catch {
        // Non-fatal
      }
    }

    this.session = {
      currentOperation: null,
      instance,
      isLoggedIn: loggedIn,
      lastActivityAtMs: now,
      lastError: loggedIn ? null : "Not logged in",
      lastKeepAliveAtMs: null,
      lastLoginAtMs: loggedIn ? now : null,
      operationDepth: 0,
      portalReady: loggedIn,
      startedAtMs: now,
    };
    this.consecutiveFailures = 0;
    this.startKeepAliveLoop();

    console.log(`${this.log} Browser ready, logged in: ${loggedIn}`);
    return this.session;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async getOrCreateSession(): Promise<BrowserSession> {
    if (this.session) {
      const alive = this.session.instance.browser.isConnected();
      if (alive) {
        this.touchActivity();
        return this.session;
      }
      await this.close().catch(() => {
        /* swallow */
      });
    }

    if (!this.creationInFlight) {
      this.creationInFlight = this.createSession().finally(() => {
        this.creationInFlight = null;
      });
    }
    return this.creationInFlight;
  }

  keepAlive(): Promise<KeepAliveResult> {
    if (!this.session) {
      return Promise.resolve({
        active: false,
        isLoggedIn: false,
        portalReady: false,
        reason: "No active browser session",
        skipped: true,
        success: false,
      });
    }
    if (this.keepAliveInFlight) {
      return this.keepAliveInFlight;
    }
    this.keepAliveInFlight = this.runKeepAlive().finally(() => {
      this.keepAliveInFlight = null;
    });
    return this.keepAliveInFlight;
  }

  async withOperation<T>(
    operation: string,
    fn: (session: BrowserSession) => Promise<T>
  ): Promise<T> {
    const session = await this.getOrCreateSession();
    session.operationDepth += 1;
    session.currentOperation = operation;
    this.touchActivity();

    try {
      const result = await fn(session);
      session.lastError = null;
      this.touchActivity();
      return result;
    } catch (error) {
      session.lastError =
        error instanceof Error ? error.message : String(error);
      this.touchActivity();
      throw error;
    } finally {
      session.operationDepth = Math.max(0, session.operationDepth - 1);
      if (session.operationDepth === 0) {
        session.currentOperation = null;
      }
    }
  }

  async close(): Promise<void> {
    if (!this.session) {
      this.clearKeepAliveLoop();
      return;
    }
    console.log(`${this.log} Closing browser session...`);
    this.clearKeepAliveLoop();
    await this.saveState("shutdown");
    await this.closeBrowserInstance(this.session.instance);
    this.session = null;
    this.keepAliveInFlight = null;
    console.log(`${this.log} Browser closed`);
  }

  /**
   * Emergency kill switch.
   *
   * Immediately tears down the current browser session without saving state,
   * which interrupts in-flight Playwright operations.
   */
  async abortCurrentOperation(
    reason = "Operation aborted"
  ): Promise<AbortOperationResult> {
    const session = this.session;
    if (!session) {
      this.clearKeepAliveLoop();
      return {
        activeBeforeAbort: false,
        busyBeforeAbort: false,
        operation: null,
        reason,
        stopped: false,
      };
    }

    const operation = session.currentOperation;
    const busyBeforeAbort = session.operationDepth > 0;
    session.lastError = reason;

    console.warn(
      `${this.log} Emergency abort requested: operation=${operation ?? "none"}, reason=${reason}`
    );

    this.clearKeepAliveLoop();
    this.session = null;
    this.keepAliveInFlight = null;

    await this.closeBrowserInstance(session.instance).catch(() => {
      // Best effort: if close throws, we still consider the session torn down.
    });

    return {
      activeBeforeAbort: true,
      busyBeforeAbort,
      operation,
      reason,
      stopped: true,
    };
  }

  getStatus(): SessionStatus {
    let currentUrl: string | null = null;
    try {
      currentUrl = this.session?.instance.page.url() ?? null;
    } catch {
      /* browser may have disconnected */
    }
    return {
      active: this.session !== null,
      busy: (this.session?.operationDepth ?? 0) > 0,
      currentOperation: this.session?.currentOperation ?? null,
      currentUrl,
      isLoggedIn: this.session?.isLoggedIn ?? false,
      keepAliveEnabled: this.config.keepAliveEnabled,
      keepAliveIntervalMs: this.config.keepAliveIntervalMs,
      lastActivityAt: isoOrNull(this.session?.lastActivityAtMs ?? null),
      lastError: this.session?.lastError ?? null,
      lastKeepAliveAt: isoOrNull(this.session?.lastKeepAliveAtMs ?? null),
      lastLoginAt: isoOrNull(this.session?.lastLoginAtMs ?? null),
      portalReady: this.session?.portalReady ?? false,
      startedAt: isoOrNull(this.session?.startedAtMs ?? null),
      viewportHeight: this.config.viewport.height,
      viewportWidth: this.config.viewport.width,
    };
  }

  /** Direct access to the session's page (for downloads, navigation, etc.). */
  getPage(): Page | null {
    return this.session?.instance.page ?? null;
  }

  /** Direct access to the session's context (for new tabs, cookies, etc.). */
  getContext(): BrowserContext | null {
    return this.session?.instance.context ?? null;
  }

  /** Get raw session (for advanced use). */
  getSession(): BrowserSession | null {
    return this.session;
  }

  /** Check if state file exists on disk. */
  hasStateFile(): boolean {
    return existsSync(this.config.statePath);
  }

  get statePath(): string {
    return this.config.statePath;
  }

  /**
   * Reload storageState from disk into a fresh context.
   * Used after manual bootstrap saves state externally.
   *
   * WARNING: This swaps the context and page on the existing BrowserInstance.
   * Any code that cached `instance.page` or `instance.context` directly will
   * hold stale references after this call. Always access via getPage()/getContext().
   */
  async reloadStateFromDisk(): Promise<boolean> {
    if (!this.session) {
      return false;
    }
    if (this.session.operationDepth > 0) {
      console.warn(
        `${this.log} Cannot reload state while operation in progress`
      );
      return false;
    }
    if (!existsSync(this.config.statePath)) {
      return false;
    }

    try {
      const { browser } = this.session.instance;
      const newContext = await browser.newContext({
        acceptDownloads: this.config.acceptDownloads ?? false,
        storageState: this.config.statePath,
        userAgent: this.config.userAgent,
        viewport: this.config.viewport,
      });
      const newPage = await newContext.newPage();

      // Close old context
      await this.session.instance.context.close().catch(() => {
        /* swallow */
      });

      // Swap references
      this.session.instance.context = newContext;
      this.session.instance.page = newPage;

      // Verify login
      const loggedIn = await this.config.checkLoggedIn(newPage);
      this.session.isLoggedIn = loggedIn;
      this.session.portalReady = loggedIn;
      this.session.lastLoginAtMs = loggedIn ? Date.now() : null;
      this.session.lastError = loggedIn
        ? null
        : "State reloaded but not logged in";

      console.log(
        `${this.log} Reloaded state from disk, loggedIn: ${loggedIn}`
      );
      return loggedIn;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`${this.log} Failed to reload state: ${msg}`);
      return false;
    }
  }
}
