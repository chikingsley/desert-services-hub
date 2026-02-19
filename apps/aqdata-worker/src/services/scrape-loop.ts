import { runAQSync } from "../services/sync";
import type { ScrapeLoopStatus } from "../services/types";
import { runAQDetailScrape } from "./detail-scrape";

const DEFAULT_INTERVAL_MS = Number.parseInt(
  process.env.AQDATA_SCRAPE_INTERVAL_MS ?? "900000",
  10
);
const DEFAULT_DETAIL_BATCH_SIZE = Number.parseInt(
  process.env.AQDATA_DETAIL_SCRAPE_BATCH_SIZE ?? "10",
  10
);

let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = Number.isFinite(DEFAULT_INTERVAL_MS)
  ? Math.max(30_000, DEFAULT_INTERVAL_MS)
  : 900_000;
let isRunning = false;
let lastRunAt: string | undefined;
let lastRunError: string | undefined;

export async function startScrapeLoop(
  nextIntervalMs?: number
): Promise<ScrapeLoopStatus> {
  if (typeof nextIntervalMs === "number" && Number.isFinite(nextIntervalMs)) {
    intervalMs = Math.max(30_000, nextIntervalMs);
  }

  if (timer) {
    return getScrapeLoopStatus();
  }

  timer = setInterval(() => {
    runOnce().catch((error) => {
      lastRunError = error instanceof Error ? error.message : String(error);
      lastRunAt = new Date().toISOString();
    });
  }, intervalMs);

  await runOnce();
  return getScrapeLoopStatus();
}

export function stopScrapeLoop(): ScrapeLoopStatus {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  isRunning = false;
  return getScrapeLoopStatus();
}

export async function runScrapeNow(): Promise<ScrapeLoopStatus> {
  await runOnce();
  return getScrapeLoopStatus();
}

export function getScrapeLoopStatus(): ScrapeLoopStatus {
  return {
    intervalMs,
    isRunning,
    lastRunAt,
    lastRunError,
  };
}

async function runOnce(): Promise<void> {
  if (isRunning) {
    return;
  }

  isRunning = true;
  lastRunError = undefined;

  try {
    const syncResult = await runAQSync({ companyOnly: false });
    if (!syncResult.success) {
      lastRunError = syncResult.error ?? "Unknown AQData sync error";
      return;
    }

    const scrapeResult = await runAQDetailScrape({
      limit: Math.max(1, DEFAULT_DETAIL_BATCH_SIZE),
    });
    if (!scrapeResult.success) {
      lastRunError = scrapeResult.error ?? "Unknown AQData detail scrape error";
      return;
    }
    lastRunAt = new Date().toISOString();
  } catch (error) {
    lastRunError = error instanceof Error ? error.message : String(error);
    lastRunAt = new Date().toISOString();
  } finally {
    isRunning = false;
  }
}
