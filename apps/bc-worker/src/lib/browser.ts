/**
 * BC Worker — Browser Session Instance
 *
 * Creates a BrowserSessionManager configured for BuildingConnected.
 * Portal-specific behavior:
 * - Login detection: URL-based (redirect to /signin or autodesk.com)
 * - No auto-relogin (requires 2FA/CAPTCHA via VNC bootstrap)
 * - Keep-alive: HTTP-only check via context.request (no page navigation)
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
    // Use HTTP-only request (context.request) — does NOT navigate the visible
    // page, so the VNC view is never disrupted by keep-alive checks.
    const response = await session.instance.context.request.get(BC_HOME_URL, {
      failOnStatusCode: false,
      timeout: KEEPALIVE_TIMEOUT_MS,
      maxRedirects: 0,
    });
    const status = response.status();
    const finalUrl = response.url();
    const locationHeader = response.headers().location ?? "";
    const redirectedToLogin =
      isLoginUrl(finalUrl) || isLoginUrl(locationHeader);

    if (status >= 200 && status < 400 && !redirectedToLogin) {
      return { alive: true };
    }
    return {
      alive: false,
      reason: redirectedToLogin
        ? "BC session expired (redirected to login)"
        : `BC keepalive HTTP ${status}`,
    };
  },

  // No auto-relogin — BuildingConnected requires 2FA/CAPTCHA via manual VNC bootstrap
  relogin: null,
});

export { STATE_PATH as BC_STATE_PATH };
