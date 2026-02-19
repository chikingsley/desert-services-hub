import { db } from "@lib/db/client";
import { AQDataClient } from "../../apps/aqdata-worker/src/aqdata/client";
import { parseDustApplicationDetail } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail";
import { mergePermitPdfIntoDetail } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail-enrichment";
import { evaluateDustApplicationDetailQA } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail-qa";
import { extractDustPermitPdf } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-permit-pdf";
import type { DustAppStatus } from "../../apps/aqdata-worker/src/aqdata/types";
import {
  buildReport,
  buildStatusAttemptOrder,
  type CliOptions,
  DEFAULT_STATUS_SEARCH_ORDER,
  normalizeStatus,
  type PermitAuditRow,
  type PermitRow,
  parseArgs,
  writeReport,
} from "./aqdata-detail-qa-batch-support";

const DUST_DETAIL_TITLE_REGEX =
  /<title>\s*Dust Application Detail\s*<\/title>/i;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const results = await runBatch(options);

  const report = buildReport(options, results);
  const outputPath = writeReport(report, options.outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        summary: report.summary,
      },
      null,
      2
    )
  );
}

async function runBatch(options: CliOptions): Promise<PermitAuditRow[]> {
  const rows = await loadPermitRows(options);
  if (rows.length === 0) {
    console.log(
      JSON.stringify(
        {
          message: "No permits matched selection.",
          options,
        },
        null,
        2
      )
    );
    return [];
  }

  console.log(
    `[aqdata-qa] selected ${rows.length} permits (mode=${options.mode}, dryRun=${options.dryRun})`
  );

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

  const results: PermitAuditRow[] = [];
  for (const row of rows) {
    results.push(await processPermitRow(row, options, getClient, resetClient));
  }
  return results;
}

async function processPermitRow(
  row: PermitRow,
  options: CliOptions,
  getClient: () => Promise<AQDataClient>,
  resetClient: () => void
): Promise<PermitAuditRow> {
  try {
    const hasStoredDetailHtml = hasValidDetailHtml(row.detail_html);
    const shouldRescrape = shouldRescrapeRow(options.mode, hasStoredDetailHtml);
    console.log(
      `[aqdata-qa] processing ${row.id} status=${row.status ?? "unknown"} mode=${options.mode} shouldRescrape=${shouldRescrape}`
    );

    const { fetchResult, html, source } = await resolveRowHtml(
      row,
      options,
      shouldRescrape,
      hasStoredDetailHtml,
      getClient,
      resetClient
    );
    if (!html) {
      return {
        error: "No detail HTML available.",
        id: row.id,
        source,
        status: row.status,
      };
    }

    const detail = await parseAndEnrichDetailWithPermitPdf(
      html,
      row.id,
      getClient
    );
    const qa = evaluateDustApplicationDetailQA(detail, {
      expectedApplicationId: row.id,
      expectedStatus: row.status,
    });

    if (fetchResult && !options.dryRun) {
      await db.run(
        `UPDATE aqdata_permits
         SET detail_html = $1, detail_fields = $2::jsonb, detail_scraped_at = now()
         WHERE id = $3`,
        [html, buildDetailPayload(detail), row.id]
      );
    }

    console.log(
      `[aqdata-qa] done ${row.id} passed=${qa.passed} required=${qa.summary.required.coverage} optional=${qa.summary.optional.coverage} source=${source}`
    );

    return {
      id: row.id,
      optionalCoverage: qa.summary.optional.coverage,
      passed: qa.passed,
      qa,
      requiredCoverage: qa.summary.required.coverage,
      source,
      status: row.status,
    };
  } catch (error) {
    resetClient();
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[aqdata-qa] error ${row.id}: ${message}`);
    return {
      error: message,
      id: row.id,
      source: "rescraped",
      status: row.status,
    };
  }
}

function hasValidDetailHtml(html: string | null): boolean {
  return Boolean(html && DUST_DETAIL_TITLE_REGEX.test(html));
}

function shouldRescrapeRow(
  mode: CliOptions["mode"],
  hasStored: boolean
): boolean {
  if (mode === "rescrape-all") {
    return true;
  }
  if (mode === "rescrape-missing") {
    return !hasStored;
  }
  return false;
}

async function resolveRowHtml(
  row: PermitRow,
  options: CliOptions,
  shouldRescrape: boolean,
  hasStoredDetailHtml: boolean,
  getClient: () => Promise<AQDataClient>,
  resetClient: () => void
): Promise<{
  fetchResult: { html: string; statusUsed: DustAppStatus } | null;
  html: string | null;
  source: "existing" | "rescraped";
}> {
  const fetchResult = shouldRescrape
    ? await fetchDetailWithRetries(
        row.id,
        normalizeStatus(row.status),
        options,
        getClient,
        resetClient
      )
    : null;

  const existingHtml = hasStoredDetailHtml ? row.detail_html : null;
  return {
    fetchResult,
    html: fetchResult?.html ?? existingHtml,
    source: fetchResult ? "rescraped" : "existing",
  };
}

async function parseAndEnrichDetailWithPermitPdf(
  html: string,
  applicationId: string,
  getClient: () => Promise<AQDataClient>
) {
  let detail = parseDustApplicationDetail(html, applicationId);
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
    detail = mergePermitPdfIntoDetail(detail, permitPdf);
  } catch (error) {
    console.log(
      `[aqdata-qa] permit-pdf-skip ${applicationId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return detail;
}

function buildDetailPayload(
  detail: ReturnType<typeof parseDustApplicationDetail>
): Record<string, unknown> {
  return {
    attachments: detail.attachments,
    coordinates: detail.coordinates,
    detailFields: detail.detailFields,
    documentLinks: detail.documentLinks,
    permitDocument: detail.permitDocument,
    permitPdf: detail.permitPdf,
    structured: detail.structured,
  };
}

async function fetchDetailWithRetries(
  applicationId: string,
  statusHint: DustAppStatus | null,
  options: CliOptions,
  getClient: () => Promise<AQDataClient>,
  resetClient: () => void
): Promise<{ html: string; statusUsed: DustAppStatus } | null> {
  for (let attempt = 1; attempt <= options.retryAttempts; attempt++) {
    try {
      const result = await withTimeout(
        fetchDetailWithFallback(applicationId, statusHint, getClient),
        options.rescrapeTimeoutMs,
        `Timed out scraping detail for ${applicationId} (attempt ${attempt}/${options.retryAttempts})`
      );
      if (result) {
        return result;
      }
      console.log(
        `[aqdata-qa] retryable no-detail ${applicationId} attempt=${attempt}/${options.retryAttempts}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[aqdata-qa] retryable error ${applicationId} attempt=${attempt}/${options.retryAttempts}: ${message}`
      );
    }

    resetClient();
    if (attempt < options.retryAttempts) {
      await sleep(options.retryBackoffMs);
    }
  }

  return null;
}

async function loadPermitRows(options: CliOptions): Promise<PermitRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.ids.length > 0) {
    where.push(
      `id IN (${placeholderList(params.length + 1, options.ids.length)})`
    );
    params.push(...options.ids);
  }

  if (options.statuses.length > 0) {
    where.push(
      `status IN (${placeholderList(params.length + 1, options.statuses.length)})`
    );
    params.push(...options.statuses);
  }

  if (options.mode === "existing") {
    where.push("detail_html IS NOT NULL");
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const query = `SELECT id, status, detail_html
                 FROM aqdata_permits
                 ${whereSql}
                 ORDER BY id
                 LIMIT $${params.length + 1}
                 OFFSET $${params.length + 2}`;

  params.push(options.limit, options.offset);
  return await db.query<PermitRow>(query).all(...params);
}

async function fetchDetailWithFallback(
  applicationId: string,
  statusHint: DustAppStatus | null,
  getClient: () => Promise<AQDataClient>
): Promise<{ html: string; statusUsed: DustAppStatus } | null> {
  const statuses = buildStatusAttemptOrder(
    statusHint,
    DEFAULT_STATUS_SEARCH_ORDER
  );
  for (const status of statuses) {
    const client = await getClient();
    await client.navigateToDustApplicationSearch();
    await client.searchDustApplications({
      applicationId,
      statuses: [status],
    });

    try {
      const html = await client.openDustApplicationDetail(applicationId);
      if (!DUST_DETAIL_TITLE_REGEX.test(html)) {
        continue;
      }
      return { html, statusUsed: status };
    } catch {
      // keep trying status variants
    }
  }

  // Final fallback: search across all status buckets in one request.
  {
    const client = await getClient();
    await client.navigateToDustApplicationSearch();
    await client.searchDustApplications({
      applicationId,
      statuses: [...DEFAULT_STATUS_SEARCH_ORDER],
    });
    try {
      const html = await client.openDustApplicationDetail(applicationId);
      if (DUST_DETAIL_TITLE_REGEX.test(html)) {
        return {
          html,
          statusUsed: statusHint ?? DEFAULT_STATUS_SEARCH_ORDER[0],
        };
      }
    } catch {
      // no-op
    }
  }

  return null;
}

function placeholderList(start: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `$${start + index}`).join(
    ", "
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyPdf(contentType: string | null, url: string): boolean {
  if (contentType?.toLowerCase().includes("pdf")) {
    return true;
  }
  return url.toLowerCase().endsWith(".pdf");
}

await main();
