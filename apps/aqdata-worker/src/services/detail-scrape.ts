import { AQDataClient } from "../aqdata/client";
import { parseDustApplicationDetail } from "../aqdata/parsers/dust-application-detail";
import { mergePermitPdfIntoDetail } from "../aqdata/parsers/dust-application-detail-enrichment";
import { evaluateDustApplicationDetailQA } from "../aqdata/parsers/dust-application-detail-qa";
import { extractDustPermitPdf } from "../aqdata/parsers/dust-permit-pdf";
import type { DustAppStatus } from "../aqdata/types";
import {
  type AQPermitListRow,
  listPermitsNeedingDetailScrape,
  savePermitDetail,
} from "./persistence";
import type { DetailScrapeResult } from "./types";

const DUST_DETAIL_TITLE_REGEX =
  /<title>\s*Dust Application Detail\s*<\/title>/i;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 1500;
const DEFAULT_STATUS_SEARCH_ORDER: readonly DustAppStatus[] = [
  "Active",
  "Submitted",
  "Closed",
  "Superseded",
  "Rejected",
];

interface RunDetailScrapeOptions {
  limit?: number;
  retryAttempts?: number;
  retryBackoffMs?: number;
}

export async function runAQDetailScrape(
  options: RunDetailScrapeOptions = {}
): Promise<DetailScrapeResult> {
  const limit = clampPositiveInt(options.limit, 10, 200);
  const retryAttempts = clampPositiveInt(
    options.retryAttempts,
    DEFAULT_RETRY_ATTEMPTS,
    10
  );
  const retryBackoffMs = clampPositiveInt(
    options.retryBackoffMs,
    DEFAULT_RETRY_BACKOFF_MS,
    30_000
  );

  try {
    const pending = await listPermitsNeedingDetailScrape(limit);
    if (pending.length === 0) {
      return {
        success: true,
        stats: {
          failed: 0,
          queued: 0,
          scraped: 0,
          skipped: 0,
        },
      };
    }

    let client: AQDataClient | null = null;
    const getClient = async (): Promise<AQDataClient> => {
      if (!client) {
        client = new AQDataClient();
        await client.connect();
      }
      return client;
    };
    const resetClient = (): void => {
      client = null;
    };

    let scraped = 0;
    let failed = 0;
    const skipped = 0;

    for (const row of pending) {
      try {
        const html = await fetchDetailWithRetries(
          row,
          getClient,
          resetClient,
          retryAttempts,
          retryBackoffMs
        );

        if (!html) {
          failed++;
          continue;
        }

        let detail = parseDustApplicationDetail(html, row.id);
        detail = await enrichWithPermitPdf(detail, row.id, getClient);

        const qa = evaluateDustApplicationDetailQA(detail, {
          expectedApplicationId: row.id,
          expectedStatus: row.status ?? null,
        });

        await savePermitDetail(row.id, html, detail, qa);
        scraped++;
      } catch (error) {
        failed++;
        resetClient();
        console.warn(
          `[aqdata] detail scrape failed for ${row.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      success: true,
      stats: {
        failed,
        queued: pending.length,
        scraped,
        skipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stats: {
        failed: 0,
        queued: 0,
        scraped: 0,
        skipped: 0,
      },
    };
  }
}

async function fetchDetailWithRetries(
  row: AQPermitListRow,
  getClient: () => Promise<AQDataClient>,
  resetClient: () => void,
  retryAttempts: number,
  retryBackoffMs: number
): Promise<string | null> {
  const statusHint = normalizeStatus(row.status);

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const html = await fetchDetailWithFallback(row.id, statusHint, getClient);
      if (html) {
        return html;
      }
      console.warn(
        `[aqdata] detail missing for ${row.id}, attempt=${attempt}/${retryAttempts}`
      );
    } catch (error) {
      console.warn(
        `[aqdata] detail retry for ${row.id}, attempt=${attempt}/${retryAttempts}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    resetClient();
    if (attempt < retryAttempts) {
      await Bun.sleep(retryBackoffMs);
    }
  }

  return null;
}

async function fetchDetailWithFallback(
  applicationId: string,
  statusHint: DustAppStatus | null,
  getClient: () => Promise<AQDataClient>
): Promise<string | null> {
  const statuses = buildStatusAttemptOrder(statusHint);
  for (const status of statuses) {
    const client = await getClient();
    await client.navigateToDustApplicationSearch();
    await client.searchDustApplications({
      applicationId,
      statuses: [status],
    });
    try {
      const html = await client.openDustApplicationDetail(applicationId);
      if (DUST_DETAIL_TITLE_REGEX.test(html)) {
        return html;
      }
    } catch {
      // keep trying status variants
    }
  }

  const client = await getClient();
  await client.navigateToDustApplicationSearch();
  await client.searchDustApplications({
    applicationId,
    statuses: [...DEFAULT_STATUS_SEARCH_ORDER],
  });
  try {
    const html = await client.openDustApplicationDetail(applicationId);
    if (DUST_DETAIL_TITLE_REGEX.test(html)) {
      return html;
    }
  } catch {
    // return null
  }

  return null;
}

async function enrichWithPermitPdf(
  detail: ReturnType<typeof parseDustApplicationDetail>,
  applicationId: string,
  getClient: () => Promise<AQDataClient>
): Promise<ReturnType<typeof parseDustApplicationDetail>> {
  if (!detail.permitDocument?.url) {
    return detail;
  }

  try {
    const client = await getClient();
    const document = await client.downloadDocument(detail.permitDocument.url);
    if (!isLikelyPdf(document.contentType, document.url)) {
      return detail;
    }
    const permitPdf = await extractDustPermitPdf(
      document.bytes,
      document.contentType
    );
    return mergePermitPdfIntoDetail(detail, permitPdf);
  } catch (error) {
    console.warn(
      `[aqdata] permit PDF parse skipped for ${applicationId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return detail;
  }
}

function buildStatusAttemptOrder(
  hint: DustAppStatus | null
): readonly DustAppStatus[] {
  if (!hint) {
    return DEFAULT_STATUS_SEARCH_ORDER;
  }
  const out: DustAppStatus[] = [hint];
  for (const status of DEFAULT_STATUS_SEARCH_ORDER) {
    if (status !== hint) {
      out.push(status);
    }
  }
  return out;
}

function normalizeStatus(value: string | null): DustAppStatus | null {
  if (!value) {
    return null;
  }
  return DEFAULT_STATUS_SEARCH_ORDER.includes(value as DustAppStatus)
    ? (value as DustAppStatus)
    : null;
}

function isLikelyPdf(contentType: string | null, url: string): boolean {
  if (contentType?.toLowerCase().includes("pdf")) {
    return true;
  }
  return url.toLowerCase().endsWith(".pdf");
}

function clampPositiveInt(
  value: number | undefined,
  fallback: number,
  max: number
): number {
  if (!Number.isFinite(value) || typeof value !== "number") {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.trunc(value)));
}
