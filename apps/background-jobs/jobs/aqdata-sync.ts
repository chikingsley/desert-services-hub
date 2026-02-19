/**
 * AQData sync orchestration for background-jobs.
 * Calls aqdata-worker over internal Docker network.
 */

import {
  AQDATA_SYNC_TIMEOUT_MS,
  AQDATA_WORKER_URL,
} from "@background-jobs/jobs/config";

interface AQDataSyncStats {
  matchedCompanyName?: string;
  outputPath: string;
  permitsFilePath: string;
  totalRecords: number;
  upsertedToDb?: number;
  withCoordinates: number;
}

interface AQDataDetailScrapeStats {
  failed: number;
  queued: number;
  scraped: number;
  skipped: number;
}

interface AQDataBaseResponse {
  success: boolean;
  error?: string;
  timestamp?: string;
}

export interface AQDataSyncResponse extends AQDataBaseResponse {
  stats?: AQDataSyncStats;
}

export interface AQDataDetailScrapeResponse extends AQDataBaseResponse {
  stats?: AQDataDetailScrapeStats;
}

let syncInFlight: Promise<AQDataSyncResponse> | null = null;
let companySyncInFlight: Promise<AQDataSyncResponse> | null = null;
let detailScrapeInFlight: Promise<AQDataDetailScrapeResponse> | null = null;

export function runAQDataSync(): Promise<AQDataSyncResponse> {
  if (!syncInFlight) {
    syncInFlight = callAQDataWorker<AQDataSyncResponse>("/api/sync").finally(
      () => {
        syncInFlight = null;
      }
    );
  }
  return syncInFlight;
}

export function runAQDataCompanySync(): Promise<AQDataSyncResponse> {
  if (!companySyncInFlight) {
    companySyncInFlight = callAQDataWorker<AQDataSyncResponse>(
      "/api/sync/company"
    ).finally(() => {
      companySyncInFlight = null;
    });
  }
  return companySyncInFlight;
}

export function runAQDataDetailScrape(options?: {
  limit?: number;
}): Promise<AQDataDetailScrapeResponse> {
  if (!detailScrapeInFlight) {
    detailScrapeInFlight = callAQDataWorker<AQDataDetailScrapeResponse>(
      "/api/scrape",
      options?.limit ? { limit: options.limit } : undefined
    ).finally(() => {
      detailScrapeInFlight = null;
    });
  }
  return detailScrapeInFlight;
}

async function callAQDataWorker<T extends AQDataBaseResponse>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AQDATA_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`${AQDATA_WORKER_URL}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      method: "POST",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({
      error: `Invalid JSON from aqdata-worker (${response.status})`,
      success: false,
    }))) as T;

    if (!response.ok || payload.success === false) {
      const error =
        payload.error ?? `aqdata-worker request failed (${response.status})`;
      throw new Error(error);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
