# Browser Session Persistence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make both the permit-worker (Maricopa) and bc-worker (BuildingConnected) persist browser sessions via Playwright `storageState`, and convert the bc-worker from stateless/ephemeral to an always-on kiosk matching the permit-worker pattern — with shared session management code in `lib/browser-session/`.

**Architecture:** Extract ~70% of the permit worker's `browser.ts` (singleton lifecycle, keep-alive loop, circuit breaker, storageState save/load, status reporting, operation wrapping) into `lib/browser-session/`. Each worker provides portal-specific behavior (login detection, relogin strategy, keep-alive check) via a config object with callbacks. The bc-worker then imports the shared session manager and becomes an always-on kiosk. The containers stay separate (different portals, credentials, VNC sessions, failure modes).

**Tech Stack:** Playwright 1.58.2, Bun, TypeScript

---

## Task 1: Create Shared Browser Session Library

**Files:**
- Create: `lib/browser-session/index.ts`

This is the core shared code extracted from the permit worker's `browser.ts`. It provides a generic `BrowserSessionManager` that both workers instantiate with portal-specific config.

**Step 1: Create `lib/browser-session/index.ts`**

```typescript
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

/**
 * Portal-specific behavior injected by each worker.
 */
export interface BrowserSessionConfig {
  /** Display name for logging, e.g. "permit-worker" or "bc-worker". */
  name: string;

  /** Path to the storageState JSON file on a Docker volume. */
  statePath: string;

  /** Chromium launch options. */
  headless: boolean;
  launchArgs?: string[];
  userAgent?: string;
  acceptDownloads?: boolean;
  viewport: { width: number; height: number };

  /** Keep-alive settings. */
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;

  /**
   * Check if the current page indicates a logged-in session.
   * Called after navigating to the portal or after restoring storageState.
   * Return true if logged in, false if login page detected.
   */
  checkLoggedIn: (page: Page) => Promise<boolean>;

  /**
   * Perform a keep-alive check. Navigate to the portal and verify session.
   * Return true if session is still alive, false if expired.
   * This runs on the session's page — callers should NOT close it.
   */
  keepAliveCheck: (session: BrowserSession) => Promise<{
    alive: boolean;
    reason?: string;
  }>;

  /**
   * Attempt automatic relogin after session expiry.
   * Return true if relogin succeeded, false if not possible (e.g. 2FA required).
   * Return null if auto-relogin is not supported (manual auth required).
   */
  relogin: ((session: BrowserSession) => Promise<boolean>) | null;
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
const KEEPALIVE_RETRY_DELAY_MS = 3_000;
const KEEPALIVE_MAX_RETRIES = 1;

export class BrowserSessionManager {
  private config: BrowserSessionConfig;
  private log: string;

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

  private async runKeepAlive(): Promise<KeepAliveResult> {
    if (!this.session) {
      return {
        active: false, isLoggedIn: false, portalReady: false,
        reason: "No active browser session", skipped: true, success: false,
      };
    }

    const session = this.session;
    if (session.operationDepth > 0) {
      return {
        active: true, isLoggedIn: session.isLoggedIn,
        portalReady: session.portalReady, reason: "Session busy",
        skipped: true, success: true,
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
            active: true, isLoggedIn: true, portalReady: true,
            skipped: false, success: true,
          };
        }

        // Session expired
        session.isLoggedIn = false;
        session.portalReady = false;
        session.lastError = result.reason ?? "Session expired";

        // Try relogin if supported
        if (this.config.relogin) {
          const succeeded = await this.config.relogin(session);
          if (succeeded) {
            session.isLoggedIn = true;
            session.portalReady = true;
            session.lastLoginAtMs = Date.now();
            session.lastError = null;
            this.consecutiveFailures = 0;
            await this.saveState("relogin");
            return {
              active: true, isLoggedIn: true, portalReady: true,
              reloginAttempted: true, reloginSucceeded: true,
              skipped: false, success: true,
            };
          }
        }

        // Relogin not available or failed
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
          active: true, isLoggedIn: false, portalReady: false,
          reason: session.lastError,
          reloginAttempted: Boolean(this.config.relogin),
          reloginSucceeded: false, skipped: false, success: false,
        };
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
      active: true, isLoggedIn: false, portalReady: false,
      reason: session.lastError, skipped: false, success: false,
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

  private async closeBrowserInstance(
    instance: BrowserInstance
  ): Promise<void> {
    try {
      await instance.context.close().catch(() => {});
    } catch {
      // Ignore
    }
    try {
      await instance.browser.close().catch(() => {});
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
      await this.close().catch(() => {});
    }

    if (!this.creationInFlight) {
      this.creationInFlight = this.createSession().finally(() => {
        this.creationInFlight = null;
      });
    }
    return this.creationInFlight;
  }

  async keepAlive(): Promise<KeepAliveResult> {
    if (!this.session) {
      return {
        active: false, isLoggedIn: false, portalReady: false,
        reason: "No active browser session", skipped: true, success: false,
      };
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

  getStatus(): SessionStatus {
    const currentUrl = this.session?.instance.page.url() ?? null;
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
   */
  async reloadStateFromDisk(): Promise<boolean> {
    if (!this.session) {
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
      await this.session.instance.context.close().catch(() => {});

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
```

**Step 2: Run lint**

```bash
bun x ultracite fix lib/browser-session/index.ts
```

**Step 3: Commit**

```bash
git add lib/browser-session/index.ts
git commit -m "feat: add shared browser session manager (lib/browser-session)

Generic singleton Playwright session with storageState persistence,
keep-alive loop with jitter/circuit breaker, operation tracking.
Portal-specific behavior injected via BrowserSessionConfig callbacks.
Shared by permit-worker and bc-worker."
```

---

## Task 2: Migrate Permit Worker to Shared Session Manager

**Files:**
- Modify: `apps/dust-permits/src/portal/utils/browser.ts`

Refactor the permit worker's `browser.ts` to use `BrowserSessionManager` from `lib/browser-session/`. The singleton session management, keep-alive loop, and storageState code gets replaced by the shared class. Portal-specific code (login detection, credential-based relogin, Maricopa-specific keep-alive check) stays.

The key changes:
1. Import `BrowserSessionManager` and create an instance with Maricopa-specific config
2. Replace the module-level `globalSession`, keep-alive timer, and helper functions with calls to the manager
3. Keep all the existing public exports (`getOrCreateBrowserSession`, `getSessionStatus`, etc.) but delegate to the manager
4. Keep `withBrowser()` for one-off operations (create, scrape) — this uses its own browser, not the singleton
5. Keep `login()` import — used both in `createSession` config and `withBrowser`

**Important**: The permit worker's `browser.ts` has two modes:
- **Singleton session** (API server) — this moves to `BrowserSessionManager`
- **One-off `withBrowser()`** (CLI operations like create/scrape) — this stays as-is, but gets storageState load too

**Step 1: Add imports and create manager instance**

At the top of `browser.ts`, after existing imports:

```typescript
import { BrowserSessionManager } from "@/lib/browser-session";
```

After the `RESOLVED_VIEWPORT` block and `IS_DOCKER` constant (around line 92), add:

```typescript
const AUTH_STATE_PATH =
  process.env.PERMIT_WORKER_AUTH_STATE_PATH?.trim() ||
  "/app/data/auth-state.json";
```

Then after the existing constants section, create the manager instance. The key is providing Maricopa-specific callbacks:

```typescript
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
      // Handle disclaimer if present
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
```

**Step 2: Replace the session management functions**

Remove or replace these module-level variables and functions — they're now in the manager:
- `globalSession`, `keepAliveTimer`, `keepAliveInFlight`, `sessionCreationInFlight`, `consecutiveReloginFailures`
- `touchSessionActivity()`, `clearKeepAliveLoop()`, `nextKeepAliveDelayMs()`, `scheduleNextKeepAlive()`, `startKeepAliveLoop()`
- `setSessionLoginState()`, `ensureSessionStillAlive()`, `reloginSession()`
- `runKeepAlive()`, the internal `createSession()`, `createBrowser()` for sessions

Replace the public functions with delegations:

```typescript
export async function getOrCreateBrowserSession(): Promise<BrowserSession> {
  return sessionManager.getOrCreateSession();
}

export async function ensureBrowserSessionReady(options?: {
  forceRelogin?: boolean;
}): Promise<BrowserSession> {
  const session = await sessionManager.getOrCreateSession();
  if (options?.forceRelogin || !session.isLoggedIn) {
    if (sessionManager["config"].relogin) {
      const succeeded = await sessionManager["config"].relogin(session);
      if (succeeded) {
        session.isLoggedIn = true;
        session.portalReady = true;
        session.lastLoginAtMs = Date.now();
        session.lastError = null;
        await sessionManager.saveState("force-relogin");
      }
    }
  }
  return session;
}

export async function keepBrowserSessionAlive(options?: {
  allowRelogin?: boolean;
  force?: boolean;
}): Promise<BrowserKeepAliveResult> {
  return sessionManager.keepAlive();
}

export async function withBrowserSessionOperation<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return sessionManager.withOperation(operation, () => fn());
}

export async function closeBrowserSession(): Promise<void> {
  return sessionManager.close();
}

export function getSessionStatus(): BrowserSessionStatus {
  const status = sessionManager.getStatus();
  return {
    ...status,
    // Existing fields the API expects
    keepAliveEnabled: KEEP_ALIVE_ENABLED,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
  };
}

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
```

**Step 3: Add storageState to `createBrowser()` (one-off operations)**

The existing `createBrowser()` function (used by `withBrowser()` for one-off CLI operations) should also load storageState. This way create/scrape operations benefit from saved cookies too.

In the existing `createBrowser()` function, update the `newContext` call:

```typescript
  const hasState = existsSync(AUTH_STATE_PATH);
  const context = await browser.newContext({
    storageState: hasState ? AUTH_STATE_PATH : undefined,
    viewport: {
      height: RESOLVED_VIEWPORT.height,
      width: RESOLVED_VIEWPORT.width,
    },
  });
```

**Step 4: Save state after successful login in `withBrowser()`**

After the login succeeds in `withBrowser()` (line 160), add:

```typescript
    // 2. Login
    const loggedIn = await login(instance.page);
    if (loggedIn) {
      // Save state for future sessions
      try {
        await instance.context.storageState({ path: AUTH_STATE_PATH });
      } catch {
        // Non-fatal
      }
    }
```

**Step 5: Keep the selectors import for checkLoggedIn**

The `checkLoggedIn` callback in the session manager config references `portal.loggedIn.myDustApps`. Make sure the selectors are imported. Check if `portal` is already imported from `"./selectors"` — if not, add it.

**Step 6: Run lint and verify types**

```bash
bun x ultracite fix apps/dust-permits/src/portal/utils/browser.ts
```

**Step 7: Run type check**

```bash
cd /home/simon/github/desert-services-hub
bunx tsc --noEmit --project apps/dust-permits/tsconfig.json 2>&1 | head -30
```

**Step 8: Commit**

```bash
git add apps/dust-permits/src/portal/utils/browser.ts
git commit -m "refactor(permit-worker): use shared BrowserSessionManager

Replace ~400 LOC of inline session management with delegation
to lib/browser-session. Portal-specific behavior (login detection,
credential relogin, keep-alive check) injected via config callbacks.
Adds storageState persistence for restart recovery."
```

---

## Task 3: Create BC Worker Session Instance

**Files:**
- Create: `apps/bc-worker/src/lib/browser.ts`

This is a thin file that creates a `BrowserSessionManager` instance with BuildingConnected-specific config. Much smaller than the old plan because all the heavy lifting is in the shared library.

**Step 1: Create the file**

```typescript
/**
 * BC Worker — Browser Session Instance
 *
 * Creates a BrowserSessionManager configured for BuildingConnected.
 * Portal-specific behavior:
 * - Login detection: URL-based (redirect to /signin or autodesk.com)
 * - No auto-relogin (requires 2FA/CAPTCHA via VNC bootstrap)
 * - Keep-alive: navigate to BC home, check for redirect
 * - Always headed (VNC kiosk)
 */

import { BrowserSessionManager } from "@/lib/browser-session";

const DEFAULT_STATE_PATH = "/app/data/attachments/body-links-auth/state.json";
const BC_HOME_URL = "https://app.buildingconnected.com/";
const BC_LOGIN_MARKERS = ["/signin", "/login", "accounts.autodesk.com"];
const KEEPALIVE_TIMEOUT_MS = 30_000;

const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;
const VIEWPORT_PATTERN = /^(\d{2,5})x(\d{2,5})$/i;

const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_KEEP_ALIVE_INTERVAL_MS = 60_000;

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseViewport(): { width: number; height: number } {
  const raw = process.env.VNC_RESOLUTION?.trim();
  const match = raw?.match(VIEWPORT_PATTERN);
  if (!match) {
    return { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT };
  }
  const w = Number.parseInt(match[1], 10);
  const h = Number.parseInt(match[2], 10);
  return w > 0 && h > 0
    ? { width: w, height: h }
    : { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT };
}

function isLoginUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return BC_LOGIN_MARKERS.some((marker) => lower.includes(marker));
}

const STATE_PATH =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH?.trim() ||
  DEFAULT_STATE_PATH;

const KEEP_ALIVE_INTERVAL_MS = Math.max(
  MIN_KEEP_ALIVE_INTERVAL_MS,
  parsePositiveInt(process.env.BC_WORKER_KEEP_ALIVE_INTERVAL_MS) ??
    DEFAULT_KEEP_ALIVE_INTERVAL_MS
);

export const bcSession = new BrowserSessionManager({
  name: "bc-worker",
  statePath: STATE_PATH,
  headless: false, // Always headed — VNC kiosk
  acceptDownloads: true,
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: parseViewport(),
  keepAliveEnabled: process.env.BC_WORKER_KEEP_ALIVE_ENABLED !== "false",
  keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,

  async checkLoggedIn(page) {
    try {
      await page.goto(BC_HOME_URL, {
        timeout: KEEPALIVE_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });
      return !isLoginUrl(page.url());
    } catch {
      return false;
    }
  },

  async keepAliveCheck(session) {
    const page = session.instance.page;
    const response = await page.goto(BC_HOME_URL, {
      timeout: KEEPALIVE_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    const currentUrl = page.url();
    const redirectedToLogin = isLoginUrl(currentUrl);

    if (response?.ok() && !redirectedToLogin) {
      return { alive: true };
    }
    return {
      alive: false,
      reason: redirectedToLogin
        ? "BC session expired (redirected to login)"
        : `BC keepalive HTTP ${response?.status() ?? "unknown"}`,
    };
  },

  // No auto-relogin — BuildingConnected requires 2FA/CAPTCHA via manual VNC bootstrap
  relogin: null,
});

export { STATE_PATH as BC_STATE_PATH };
```

**Step 2: Run lint**

```bash
bun x ultracite fix apps/bc-worker/src/lib/browser.ts
```

**Step 3: Commit**

```bash
git add apps/bc-worker/src/lib/browser.ts
git commit -m "feat(bc-worker): add session instance using shared BrowserSessionManager

Thin config file for BuildingConnected-specific behavior:
- URL-based login detection (not DOM)
- No auto-relogin (requires manual VNC bootstrap for 2FA)
- Always headed, acceptDownloads, custom user agent"
```

---

## Task 4: Update BC Worker Auth API

**Files:**
- Modify: `apps/bc-worker/src/api/auth.ts`

Integrate the session manager into the existing auth API. The subprocess bootstrap flow stays (needed for 2FA/CAPTCHA), but after bootstrap completes, the session reloads storageState from disk.

**Step 1: Add session import**

At the top of `auth.ts`:

```typescript
import { bcSession } from "../lib/browser";
```

**Step 2: Update `getStatusPayload` to include session status**

Add session status to the response:

```typescript
async function getStatusPayload(
  currentOptions?: BuildingConnectedAuthStartOptions
): Promise<BuildingConnectedAuthStatusResponse> {
  const viewport = parseBuildingConnectedVncResolution(
    process.env.VNC_RESOLUTION
  );
  const stateFile = await readStateFileMetadata();
  const session = bcSession.getStatus();
  return {
    finishedAt: runState.finishedAt,
    lastError: session.lastError ?? runState.lastError,
    lastExitCode: runState.lastExitCode,
    lastSignal: runState.lastSignal,
    lastValidateUrl: runState.lastValidateUrl,
    logTail: [...runState.logTail],
    manualAuthTimeoutMs:
      currentOptions?.manualAuthTimeoutMs ?? getDefaultManualAuthTimeoutMs(),
    pid: runState.pid,
    running: runState.running,
    session,
    startUrl: currentOptions?.startUrl ?? getDefaultStartUrl(),
    startedAt: runState.startedAt,
    stateExists: stateFile.exists,
    stateFileSize: stateFile.size,
    stateLastModifiedAt: stateFile.lastModifiedAt,
    statePath: STATE_PATH,
    viewportHeight: viewport.height,
    viewportWidth: viewport.width,
    vncWsUrl: process.env.BUILDINGCONNECTED_AUTH_VNC_WS_URL || "",
  };
}
```

Update the `BuildingConnectedAuthStatusResponse` interface to include the `session` field and `vncWsUrl`:

```typescript
export interface BuildingConnectedAuthStatusResponse {
  finishedAt: string | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastValidateUrl: string | null;
  logTail: string[];
  manualAuthTimeoutMs: number;
  pid: number | null;
  running: boolean;
  session: import("@/lib/browser-session").SessionStatus;
  startedAt: string | null;
  startUrl: string;
  stateExists: boolean;
  stateFileSize: number | null;
  stateLastModifiedAt: string | null;
  statePath: string;
  viewportHeight: number;
  viewportWidth: number;
  vncWsUrl: string;
}
```

**Step 3: Reload session after bootstrap completes**

In `markRunFinished()`, add session reload:

```typescript
function markRunFinished(code: number | null, signal: string | null): void {
  runState.running = false;
  runState.finishedAt = new Date().toISOString();
  runState.lastExitCode = code;
  runState.lastSignal = signal;
  runState.pid = null;
  activeProcess = null;

  if (code !== 0 && !runState.lastError) {
    runState.lastError = `Auth bootstrap exited with code ${code ?? "unknown"}`;
  }

  // Bootstrap saved storageState — reload the persistent session
  if (code === 0) {
    bcSession.reloadStateFromDisk().catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`${LOG} Failed to reload session after bootstrap: ${msg}`);
    });
  }
}
```

**Step 4: Loosen clipboard guards**

Replace the `runState.running` check in clipboard handlers with a check that allows either bootstrap or active session:

In `handleBuildingConnectedAuthClipboardPaste` and `handleBuildingConnectedAuthClipboardCopy`, change:

```typescript
  if (!runState.running) {
    return runningConflictResponse(
      "BuildingConnected auth session is not running"
    );
  }
```

To:

```typescript
  if (!runState.running && !bcSession.getStatus().active) {
    return runningConflictResponse(
      "No active browser session or bootstrap process"
    );
  }
```

**Step 5: Run lint**

```bash
bun x ultracite fix apps/bc-worker/src/api/auth.ts
```

**Step 6: Commit**

```bash
git add apps/bc-worker/src/api/auth.ts
git commit -m "feat(bc-worker): integrate auth API with shared session manager

Status includes both bootstrap state and session state.
After bootstrap saves storageState, session auto-reloads.
Clipboard works with both bootstrap and persistent session."
```

---

## Task 5: Rewrite BC Worker Downloads to Use Persistent Session

**Files:**
- Modify: `apps/bc-worker/src/api/download.ts`

Replace ephemeral browser-per-download with a new tab in the persistent session's context.

**Step 1: Rewrite `download.ts`**

```typescript
/**
 * BuildingConnected file download using the persistent browser session.
 *
 * Opens a new tab in the singleton session's context (reuses cookies).
 * No cold-start overhead, no ephemeral browsers.
 */
import { readFile, unlink } from "node:fs/promises";
import type { Download, Page } from "playwright";
import { bcSession } from "../lib/browser";

const PAGE_TIMEOUT_MS = 45_000;
const DOWNLOAD_WAIT_MS = 15_000;
const AUTO_DOWNLOAD_SETTLE_MS = 3_000;

const DOWNLOAD_SELECTORS = [
  'button:has-text("Download")',
  'a:has-text("Download")',
  '[data-testid="download"]',
  'button:has-text("Download Folder")',
  'a:has-text("Direct download")',
  'a:has-text("Download as zip")',
];

interface DownloadResult {
  data: string;
  name: string;
  size: number;
  success: true;
}

interface DownloadError {
  error: string;
  pageTitle?: string;
  success: false;
}

async function tryClickDownload(page: Page): Promise<Download | null> {
  for (const selector of DOWNLOAD_SELECTORS) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        const downloadPromise = page.waitForEvent("download", {
          timeout: DOWNLOAD_WAIT_MS,
        });
        await button.click();
        return await downloadPromise;
      }
    } catch {
      // Try next selector
    }
  }
  return null;
}

async function downloadFile(
  url: string
): Promise<DownloadResult | DownloadError> {
  return bcSession.withOperation("download", async (session) => {
    const page = await session.instance.context.newPage();

    try {
      const autoDownloadPromise = page
        .waitForEvent("download", { timeout: PAGE_TIMEOUT_MS })
        .catch(() => null);

      await page.goto(url, {
        timeout: PAGE_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });

      let download = await Promise.race([
        autoDownloadPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), AUTO_DOWNLOAD_SETTLE_MS)
        ),
      ]);

      if (!download) {
        download = await tryClickDownload(page);
      }

      if (!download) {
        const title = await page.title().catch(() => "unknown");
        return {
          error:
            "No download triggered. Session may have expired or page requires CAPTCHA.",
          pageTitle: title,
          success: false as const,
        };
      }

      const tmpPath = await download.path();
      if (!tmpPath) {
        return {
          error: "Download path not available",
          success: false as const,
        };
      }

      const filename = download.suggestedFilename();
      const buffer = await readFile(tmpPath);

      try {
        await unlink(tmpPath);
      } catch {
        // Non-fatal
      }

      return {
        data: buffer.toString("base64"),
        name: filename,
        size: buffer.byteLength,
        success: true as const,
      };
    } finally {
      await page.close().catch(() => {});
    }
  });
}

export async function handleBuildingConnectedDownload(
  req: Request
): Promise<Response> {
  const status = bcSession.getStatus();
  if (!status.active) {
    return Response.json(
      {
        error: "No active browser session",
        success: false,
      },
      { status: 503 }
    );
  }
  if (!status.isLoggedIn) {
    return Response.json(
      {
        error: "Not logged in. Run auth bootstrap via VNC first.",
        success: false,
      },
      { status: 401 }
    );
  }

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return Response.json(
      { error: "Invalid JSON body", success: false },
      { status: 400 }
    );
  }

  if (!body?.url || typeof body.url !== "string") {
    return Response.json(
      { error: "url is required", success: false },
      { status: 400 }
    );
  }

  try {
    const result = await downloadFile(body.url);
    if (!result.success) {
      return Response.json(result, { status: 422 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bc-worker-download] failed: ${message}`);
    return Response.json({ error: message, success: false }, { status: 500 });
  }
}
```

**Step 2: Run lint**

```bash
bun x ultracite fix apps/bc-worker/src/api/download.ts
```

**Step 3: Commit**

```bash
git add apps/bc-worker/src/api/download.ts
git commit -m "feat(bc-worker): downloads use persistent session

New tab in persistent context instead of ephemeral browser.
Reuses cookies, no cold-start overhead."
```

---

## Task 6: Auto-Start Session on BC Worker Startup

**Files:**
- Modify: `apps/bc-worker/src/index.ts`

**Step 1: Add session auto-start**

```typescript
import { serve } from "bun";
import {
  handleBuildingConnectedAuthClipboardCopy,
  handleBuildingConnectedAuthClipboardPaste,
  handleBuildingConnectedAuthStart,
  handleBuildingConnectedAuthStatus,
  handleBuildingConnectedAuthStop,
} from "./api/auth";
import { handleBuildingConnectedDownload } from "./api/download";
import { bcSession } from "./lib/browser";

const PORT = Number(process.env.PORT) || 47_824;

serve({
  hostname: "0.0.0.0",
  port: PORT,
  routes: {
    "/health": {
      GET() {
        return Response.json({
          ok: true,
          service: "bc-worker",
          timestamp: new Date().toISOString(),
        });
      },
    },
    "/api/buildingconnected/auth/status": {
      GET: handleBuildingConnectedAuthStatus,
    },
    "/api/buildingconnected/auth/start": {
      POST: ((req: Request) => handleBuildingConnectedAuthStart(req)) as never,
    },
    "/api/buildingconnected/auth/stop": {
      POST: handleBuildingConnectedAuthStop,
    },
    "/api/buildingconnected/auth/clipboard/paste": {
      POST: ((req: Request) =>
        handleBuildingConnectedAuthClipboardPaste(req)) as never,
    },
    "/api/buildingconnected/auth/clipboard/copy": {
      POST: handleBuildingConnectedAuthClipboardCopy,
    },
    "/api/buildingconnected/download": {
      POST: ((req: Request) => handleBuildingConnectedDownload(req)) as never,
    },
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
  error(error) {
    console.error("[bc-worker] unhandled error:", error);
    return Response.json(
      { error: "Internal Server Error", success: false },
      { status: 500 }
    );
  },
});

console.log(`BC Worker API running on http://localhost:${PORT}`);

// Auto-start browser session — loads storageState if available
bcSession.getOrCreateSession().catch((error) => {
  console.error("[bc-worker] Failed to auto-start session:", error);
});
```

**Step 2: Run lint and commit**

```bash
bun x ultracite fix apps/bc-worker/src/index.ts
git add apps/bc-worker/src/index.ts
git commit -m "feat(bc-worker): auto-start browser session on startup

Launches persistent browser immediately on container start.
If storageState exists, session is restored automatically."
```

---

## Task 7: Update Frontend Status Types

**Files:**
- Modify: `apps/web/frontend/pages/automation.tsx`

Update the `BuildingConnectedAuthStatus` type and display helpers to use session-based status. Same changes as the previous plan version — the frontend doesn't care whether the session manager is shared or inline.

**Step 1: Update the type**

Replace `BuildingConnectedAuthStatus`:

```typescript
interface BuildingConnectedAuthStatus {
  finishedAt: string | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastValidateUrl: string | null;
  logTail: string[];
  manualAuthTimeoutMs: number;
  pid: number | null;
  running: boolean;
  session: {
    active: boolean;
    busy: boolean;
    currentOperation: string | null;
    isLoggedIn: boolean;
    portalReady: boolean;
    lastError: string | null;
    startedAt: string | null;
  };
  startedAt: string | null;
  startUrl: string;
  stateExists: boolean;
  stateFileSize: number | null;
  stateLastModifiedAt: string | null;
  statePath: string;
  viewportHeight: number;
  viewportWidth: number;
  vncWsUrl: string;
}
```

**Step 2: Update display helpers**

```typescript
function getBuildingConnectedSessionDisplay(
  data: BuildingConnectedAuthStatus | undefined
): { label: string; dotClass: string } {
  if (!data) {
    return { label: "Checking", dotClass: "bg-red-500" };
  }
  if (data.session?.portalReady) {
    return { label: "Ready", dotClass: "bg-green-500" };
  }
  if (data.session?.active) {
    return { label: "Login Needed", dotClass: "bg-amber-500" };
  }
  if (data.running) {
    return { label: "Auth Running", dotClass: "bg-amber-500" };
  }
  return { label: "Offline", dotClass: "bg-red-500" };
}

function getVncStatusLabel(
  portal: AutomationPortal,
  maricopa: AutomationStatus | undefined,
  bc: BuildingConnectedAuthStatus | undefined
): string {
  if (portal === "maricopa") {
    return maricopa?.portalReady ? "Portal ready" : "Portal not ready";
  }
  if (bc?.session?.portalReady) {
    return "Portal ready";
  }
  if (bc?.session?.active) {
    return "Session active — login needed";
  }
  if (bc?.running) {
    return "Auth bootstrap in progress";
  }
  return "Session idle";
}
```

Update `deriveVncState` to use `bc?.session?.portalReady`:

```typescript
    healthy: isMaricopa
      ? (maricopa?.portalReady ?? false)
      : (bc?.session?.portalReady ?? false),
```

**Step 3: Run lint and commit**

```bash
bun x ultracite fix apps/web/frontend/pages/automation.tsx
git add apps/web/frontend/pages/automation.tsx
git commit -m "feat(web): update BC status display for persistent session

Shows session-based health: Ready (green), Login Needed (amber),
Auth Running (amber), Offline (red)."
```

---

## Task 8: Build, Deploy, Verify

**Step 1: Lint everything**

```bash
bun x ultracite fix lib/browser-session/index.ts apps/dust-permits/src/portal/utils/browser.ts apps/bc-worker/src/lib/browser.ts apps/bc-worker/src/api/auth.ts apps/bc-worker/src/api/download.ts apps/bc-worker/src/index.ts apps/web/frontend/pages/automation.tsx
```

**Step 2: Build and deploy**

```bash
cd /home/simon/github/desert-services-hub
docker compose build permit-worker bc-worker web
docker compose up -d permit-worker bc-worker web
```

**Step 3: Verify permit-worker**

```bash
docker logs permit-worker --tail 30
# Look for: "[permit-worker] Loading auth state from /app/data/auth-state.json"
# After login: "[permit-worker] Saved auth state (login)"
docker exec permit-worker ls -la /app/data/auth-state.json
```

**Step 4: Verify bc-worker**

```bash
docker logs bc-worker --tail 30
# Look for: "[bc-worker] Creating new browser session..."
# If state exists: "[bc-worker] Loading auth state from ..."
curl -s http://localhost:47824/api/buildingconnected/auth/status | jq '.session'
# Should show active: true, isLoggedIn: true/false depending on state
```

**Step 5: Verify VNC shows browser**

Navigate to both VNC panels in the automation page — both should show a headed browser window (not blank screen).
