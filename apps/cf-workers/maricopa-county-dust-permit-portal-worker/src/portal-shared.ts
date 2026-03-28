import type { Browser, BrowserEndpoint } from "@cloudflare/playwright";
import type { Frame, Locator, Page } from "playwright";

export interface PortalEnv {
  BROWSER?: unknown;
  DUST_PERMIT_PASSWORD?: string;
  DUST_PERMIT_USERNAME?: string;
}

export type PortalContext = Frame | Page;

export const PORTAL_TIMINGS = {
  operationMs: 30_000,
  pollMs: 250,
  quickMs: 5_000,
  readyMs: 15_000,
  sessionMs: 60_000,
  settleMs: 1_000,
} as const;

const sleepMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const log = (tag: string, ...args: unknown[]): void => {
  console.log(`[${tag}]`, ...args);
};

export const pollUntil = async <T>(
  read: () => Promise<T>,
  options: {
    intervalMs?: number;
    isDone: (value: T) => boolean;
    timeoutMs?: number;
  },
): Promise<T | null> => {
  const timeoutMs = options.timeoutMs ?? PORTAL_TIMINGS.readyMs;
  const intervalMs = options.intervalMs ?? PORTAL_TIMINGS.pollMs;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();
    if (options.isDone(value)) return value;
    await sleepMs(intervalMs);
  }

  return null;
};

export const settlePortalUi = (): Promise<void> =>
  sleepMs(PORTAL_TIMINGS.settleMs);

export const isVisible = async (
  ctx: PortalContext,
  selector: string,
): Promise<boolean> => {
  try {
    return await ctx.locator(selector).first().isVisible();
  } catch {
    return false;
  }
};

export const waitForVisible = async (
  ctx: PortalContext,
  selector: string,
  timeoutMs = PORTAL_TIMINGS.readyMs,
): Promise<boolean> => {
  try {
    await ctx
      .locator(selector)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
};

export const hasSelector = async (
  ctx: PortalContext,
  selector: string,
): Promise<boolean> => {
  try {
    return (await ctx.locator(selector).count()) > 0;
  } catch {
    return false;
  }
};

/** Search all frames (main + iframes) for a selector, polling until found or timeout. */
export const findInFrames = async (
  page: Page,
  selector: string,
  timeoutMs = PORTAL_TIMINGS.readyMs,
): Promise<{ ctx: Frame; locator: Locator } | null> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const locator = frame.locator(selector).first();
        if ((await locator.count()) > 0) return { ctx: frame, locator };
      } catch {
        // Frame may have detached mid-iteration.
      }
    }
    await sleepMs(PORTAL_TIMINGS.pollMs);
  }

  return null;
};

/** Force-click a selector found anywhere in the page's frame tree. */
export const clickInFrames = async (
  page: Page,
  selector: string,
  timeoutMs = PORTAL_TIMINGS.readyMs,
): Promise<boolean> => {
  const found = await findInFrames(page, selector, timeoutMs);
  if (!found) return false;

  try {
    await found.locator.click({ force: true, timeout: PORTAL_TIMINGS.quickMs });
  } catch {
    try {
      await found.locator.evaluate((el) => (el as HTMLElement).click());
    } catch {
      return false;
    }
  }

  await settlePortalUi();
  return true;
};

/** Fill a field found anywhere in the page's frame tree. */
export const fillInFrames = async (
  page: Page,
  selector: string,
  value: string,
  timeoutMs = PORTAL_TIMINGS.readyMs,
): Promise<boolean> => {
  const found = await findInFrames(page, selector, timeoutMs);
  if (!found) return false;

  try {
    await found.locator.fill(value, { timeout: PORTAL_TIMINGS.quickMs });
    await settlePortalUi();
    return true;
  } catch {
    return false;
  }
};

export const launchPortalPage = async (
  env: PortalEnv,
): Promise<{ browser: Browser; page: Page }> => {
  const { launch } = await import("@cloudflare/playwright");
  const browser = await launch(env.BROWSER as BrowserEndpoint);
  const page = await browser.newPage();
  page.setDefaultTimeout(PORTAL_TIMINGS.sessionMs);
  page.setDefaultNavigationTimeout(PORTAL_TIMINGS.sessionMs);
  return { browser, page: page as unknown as Page };
};
