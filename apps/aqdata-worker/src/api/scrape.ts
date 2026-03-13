import { AQDataClient } from "../aqdata/client";
import { FORMS } from "../aqdata/constants";
import {
  fetchDustApplicationDetailViaCrawl4Ai,
  getAQDetailFetchBackend,
} from "../aqdata/crawl4ai";
import { parseDustApplicationDetail } from "../aqdata/parsers/dust-application-detail";
import { mergePermitPdfIntoDetail } from "../aqdata/parsers/dust-application-detail-enrichment";
import { evaluateDustApplicationDetailQA } from "../aqdata/parsers/dust-application-detail-qa";
import { parseDustApplicationExport } from "../aqdata/parsers/dust-applications";
import { extractDustPermitPdf } from "../aqdata/parsers/dust-permit-pdf";
import type { DustAppStatus } from "../aqdata/types";
import { runAQDetailScrape } from "../services/detail-scrape";
import {
  getScrapeLoopStatus,
  startScrapeLoop,
  stopScrapeLoop,
} from "../services/scrape-loop";

const DUST_DETAIL_TITLE_REGEX =
  /<title>\s*Dust Application Detail\s*<\/title>/i;
const DUST_STATUS_SEARCH_ORDER: readonly DustAppStatus[] = [
  "Active",
  "Submitted",
  "Closed",
  "Superseded",
  "Rejected",
];

interface StartRequestBody {
  intervalMs?: number;
}

interface ScrapeRunRequestBody {
  limit?: number;
  retryAttempts?: number;
  retryBackoffMs?: number;
}

export function handleScrapeStatus(): Response {
  return Response.json({
    success: true,
    status: getScrapeLoopStatus(),
    timestamp: new Date().toISOString(),
  });
}

export async function handleScrapeStart(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as StartRequestBody;
  const status = await startScrapeLoop(body.intervalMs);
  return Response.json({
    success: true,
    status,
    timestamp: new Date().toISOString(),
  });
}

export function handleScrapeStop(): Response {
  const status = stopScrapeLoop();
  return Response.json({
    success: true,
    status,
    timestamp: new Date().toISOString(),
  });
}

export async function handleScrapeRun(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as ScrapeRunRequestBody;
  const result = await runAQDetailScrape({
    limit: body.limit,
    retryAttempts: body.retryAttempts,
    retryBackoffMs: body.retryBackoffMs,
  });
  return Response.json({
    ...result,
    timestamp: new Date().toISOString(),
  });
}

export async function handleScrapePermit(id: string): Promise<Response> {
  try {
    const client = new AQDataClient();
    await client.connect();
    const summary = await findSummaryRow(client, id);
    if (!summary) {
      return Response.json(
        {
          success: false,
          error: `Permit ${id} was not found in AQData dust application search.`,
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }
    if (summary.status === "Draft") {
      return Response.json(
        {
          success: false,
          error: `Permit ${id} is Draft and is not eligible for detail scrape.`,
          timestamp: new Date().toISOString(),
        },
        { status: 409 }
      );
    }

    const backend = getAQDetailFetchBackend();
    let detailHtml: string | null = null;
    const statusHint = toDustStatus(summary.status);
    const searchOrder = statusHint
      ? ([
          statusHint,
          ...DUST_STATUS_SEARCH_ORDER.filter((status) => status !== statusHint),
        ] as const)
      : DUST_STATUS_SEARCH_ORDER;

    if (backend !== "client") {
      detailHtml = await fetchDustApplicationDetailViaCrawl4Ai(id, searchOrder);
    }

    if (!detailHtml && backend !== "crawl4ai") {
      detailHtml = await openDetailWithStatusFallback(client, id, searchOrder);
    }
    if (!detailHtml) {
      throw new Error(`Detail page was not returned for ${id}.`);
    }

    let detail = parseDustApplicationDetail(detailHtml, id);
    if (detail.permitDocument?.url) {
      try {
        const document = await client.downloadDocument(
          detail.permitDocument.url
        );
        if (isLikelyPdf(document.contentType, document.url)) {
          const permitPdf = await extractDustPermitPdf(
            document.bytes,
            document.contentType
          );
          detail = mergePermitPdfIntoDetail(detail, permitPdf);
        }
      } catch (error) {
        console.warn(
          `[aqdata] permit PDF parse skipped for ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    const qa = evaluateDustApplicationDetailQA(detail, {
      expectedApplicationId: id,
      expectedStatus: summary?.status ?? null,
    });

    return Response.json({
      success: true,
      summary,
      detail,
      qa,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

function isLikelyPdf(contentType: string | null, url: string): boolean {
  if (contentType?.toLowerCase().includes("pdf")) {
    return true;
  }
  return url.toLowerCase().endsWith(".pdf");
}

async function openDetailWithStatusFallback(
  client: AQDataClient,
  permitId: string,
  searchOrder: readonly DustAppStatus[] = DUST_STATUS_SEARCH_ORDER
): Promise<string> {
  for (const status of searchOrder) {
    await client.navigateToDustApplicationSearch();
    await client.searchDustApplications({
      applicationId: permitId,
      statuses: [status],
    });
    try {
      const html = await client.openRecordDetail(permitId);
      if (DUST_DETAIL_TITLE_REGEX.test(html)) {
        return html;
      }
    } catch {
      // keep trying status variants
    }
  }

  throw new Error(`Detail page was not returned for ${permitId}.`);
}

function toDustStatus(value: string | null | undefined): DustAppStatus | null {
  if (!value) {
    return null;
  }
  return DUST_STATUS_SEARCH_ORDER.includes(value as DustAppStatus)
    ? (value as DustAppStatus)
    : null;
}

async function findSummaryRow(client: AQDataClient, permitId: string) {
  await client.navigateToDustApplicationSearch();
  await client.searchDustApplications({
    applicationId: permitId,
    statuses: [...DUST_STATUS_SEARCH_ORDER],
  });
  const summaryBuffer = await client.exportCurrentResults(
    FORMS.dustApplications.exportBtn
  );
  const summaryRows = parseDustApplicationExport(summaryBuffer);
  return summaryRows.find((row) => row.applicationId === permitId) ?? null;
}
