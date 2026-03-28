import type { Browser, BrowserEndpoint } from "@cloudflare/playwright";
import type { Frame, Page } from "playwright";

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

interface PlaywrightLikePage {
  setDefaultNavigationTimeout: (ms: number) => void;
  setDefaultTimeout: (ms: number) => void;
}

interface PollUntilOptions<T> {
  intervalMs?: number;
  isDone: (value: T) => boolean;
  timeoutMs?: number;
}

const asPlaywrightPage = (page: PlaywrightLikePage): Page =>
  page as unknown as Page;

const sleepMs = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const pollUntil = async <T>(
  read: () => Promise<T>,
  options: PollUntilOptions<T>
): Promise<T | null> => {
  const timeoutMs = options.timeoutMs ?? PORTAL_TIMINGS.readyMs;
  const intervalMs = options.intervalMs ?? PORTAL_TIMINGS.pollMs;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();
    if (options.isDone(value)) {
      return value;
    }

    await sleepMs(intervalMs);
  }

  return null;
};

export const waitForVisible = async (
  ctx: PortalContext,
  selector: string,
  timeoutMs = PORTAL_TIMINGS.readyMs
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

export const isVisible = async (
  ctx: PortalContext,
  selector: string
): Promise<boolean> => {
  try {
    return await ctx.locator(selector).first().isVisible();
  } catch {
    return false;
  }
};

export const hasSelector = async (
  ctx: PortalContext,
  selector: string
): Promise<boolean> => {
  try {
    return (await ctx.locator(selector).count()) > 0;
  } catch {
    return false;
  }
};

export const settlePortalUi = async (): Promise<void> => {
  await sleepMs(PORTAL_TIMINGS.settleMs);
};

export const launchPortalPage = async (
  env: PortalEnv
): Promise<{ browser: Browser; page: Page }> => {
  const { launch } = await import("@cloudflare/playwright");
  const browser = await launch(env.BROWSER as BrowserEndpoint);
  const page = await browser.newPage();
  page.setDefaultTimeout(PORTAL_TIMINGS.sessionMs);
  page.setDefaultNavigationTimeout(PORTAL_TIMINGS.sessionMs);
  return { browser, page: asPlaywrightPage(page) };
};
