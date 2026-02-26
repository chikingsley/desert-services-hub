import { load } from "cheerio";
import { BASE_URL, DUST_APP_STATUS_VALUES, PAGES } from "./constants";
import type { DustAppStatus } from "./types";

const DUST_DETAIL_TITLE_REGEX =
  /<title>\s*Dust Application Detail\s*<\/title>/i;
const TRAILING_SLASHES_REGEX = /\/+$/;
const SOURCE_ONCLICK_REGEX = /source:'([^']+)'/i;
const DEFAULT_CRAWL4AI_BASE_URL = "http://127.0.0.1:11235";
const DEFAULT_CRAWL4AI_TIMEOUT_MS = 120_000;
const DEFAULT_STATUS_SEARCH_ORDER: readonly DustAppStatus[] = [
  "Active",
  "Submitted",
  "Closed",
  "Superseded",
  "Rejected",
];
const DUST_SEARCH_URL = `${BASE_URL}${PAGES.dustApplicationSearch}`;
const DISCLAIMER_URL = `${BASE_URL}${PAGES.disclaimer}`;

export type AQDetailFetchBackend = "client" | "hybrid" | "crawl4ai";
export type AQDetailFetchSource = "client" | "crawl4ai";

interface Crawl4AiConfig {
  baseUrl: string;
  bearerToken: string | null;
  timeoutMs: number;
}

interface CrawlStep {
  jsCode: string;
  sessionId: string;
  url: string;
}

interface CrawlResponsePayload {
  error?: string;
  results?: CrawlResultPayload[];
  success?: boolean;
}

interface CrawlResultPayload {
  error_message?: string;
  html?: string;
  metadata?: {
    title?: string | null;
  };
  redirected_url?: string | null;
  success?: boolean;
}

export function getAQDetailFetchBackend(): AQDetailFetchBackend {
  const raw = (process.env.AQDATA_DETAIL_FETCH_BACKEND ?? "client")
    .trim()
    .toLowerCase();

  if (raw === "client" || raw === "hybrid" || raw === "crawl4ai") {
    return raw;
  }

  if (raw.length > 0) {
    console.warn(
      `[aqdata] invalid AQDATA_DETAIL_FETCH_BACKEND=${JSON.stringify(raw)}; defaulting to client`
    );
  }
  return "client";
}

export async function fetchDustApplicationDetailViaCrawl4Ai(
  applicationId: string,
  statusOrder: readonly DustAppStatus[]
): Promise<string | null> {
  const normalizedApplicationId = applicationId.trim();
  if (!normalizedApplicationId) {
    return null;
  }

  const config = getCrawl4AiConfig();
  const sessionId = createSessionId(normalizedApplicationId);

  const disclaimer = await runCrawlStep(config, {
    jsCode: buildDisclaimerScript(),
    sessionId,
    url: DISCLAIMER_URL,
  });
  if (!disclaimer) {
    return null;
  }

  const statuses = dedupeStatuses(statusOrder);
  for (const status of statuses) {
    const source = await searchForDetailSource(config, {
      applicationId: normalizedApplicationId,
      sessionId,
      statuses: [status],
    });
    if (!source) {
      continue;
    }

    const html = await openDetailFromSource(config, sessionId, source);
    if (html) {
      return html;
    }
  }

  const source = await searchForDetailSource(config, {
    applicationId: normalizedApplicationId,
    sessionId,
    statuses: [...DEFAULT_STATUS_SEARCH_ORDER],
  });
  if (!source) {
    return null;
  }

  return await openDetailFromSource(config, sessionId, source);
}

async function searchForDetailSource(
  config: Crawl4AiConfig,
  params: {
    applicationId: string;
    sessionId: string;
    statuses: readonly DustAppStatus[];
  }
): Promise<string | null> {
  const statusValues = params.statuses
    .map((status) => DUST_APP_STATUS_VALUES[status])
    .filter((value): value is string => !!value);

  const result = await runCrawlStep(config, {
    jsCode: buildSearchScript(params.applicationId, statusValues),
    sessionId: params.sessionId,
    url: DUST_SEARCH_URL,
  });

  if (!result?.html) {
    return null;
  }

  return extractDetailSource(result.html, params.applicationId);
}

async function openDetailFromSource(
  config: Crawl4AiConfig,
  sessionId: string,
  source: string
): Promise<string | null> {
  const result = await runCrawlStep(config, {
    jsCode: buildOpenDetailScript(source),
    sessionId,
    url: DUST_SEARCH_URL,
  });

  if (!result?.html) {
    return null;
  }

  if (isDustDetailHtml(result)) {
    return result.html;
  }

  return null;
}

async function runCrawlStep(
  config: Crawl4AiConfig,
  step: CrawlStep
): Promise<CrawlResultPayload | null> {
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/crawl`, {
      body: JSON.stringify({
        urls: [step.url],
        browser_config: {
          headless: true,
        },
        crawler_config: {
          cache_mode: "BYPASS",
          js_code: [step.jsCode],
          page_timeout: config.timeoutMs,
          session_id: step.sessionId,
          wait_for: "css:body",
        },
      }),
      headers,
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(
        `[aqdata] crawl4ai HTTP ${response.status}: ${body.slice(0, 400)}`
      );
      return null;
    }

    const payload = (await response.json()) as CrawlResponsePayload;
    if (!payload.success) {
      console.warn(
        `[aqdata] crawl4ai request failed: ${payload.error ?? "unknown error"}`
      );
      return null;
    }

    const result = payload.results?.[0];
    if (!result) {
      console.warn("[aqdata] crawl4ai returned no results");
      return null;
    }
    if (!result.success) {
      console.warn(
        `[aqdata] crawl4ai crawl result failed: ${result.error_message ?? "unknown error"}`
      );
      return null;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[aqdata] crawl4ai request error: ${message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getCrawl4AiConfig(): Crawl4AiConfig {
  const timeoutMs = parsePositiveInt(
    process.env.AQDATA_CRAWL4AI_TIMEOUT_MS,
    DEFAULT_CRAWL4AI_TIMEOUT_MS
  );
  return {
    baseUrl:
      process.env.AQDATA_CRAWL4AI_BASE_URL?.trim() || DEFAULT_CRAWL4AI_BASE_URL,
    bearerToken: process.env.AQDATA_CRAWL4AI_BEARER_TOKEN?.trim() || null,
    timeoutMs,
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function createSessionId(applicationId: string): string {
  return `aqdata-${applicationId.toLowerCase()}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function dedupeStatuses(statuses: readonly DustAppStatus[]): DustAppStatus[] {
  const out: DustAppStatus[] = [];
  const seen = new Set<DustAppStatus>();
  const merged =
    statuses.length > 0 ? statuses : [...DEFAULT_STATUS_SEARCH_ORDER];
  for (const status of merged) {
    if (seen.has(status)) {
      continue;
    }
    seen.add(status);
    out.push(status);
  }
  return out;
}

function extractDetailSource(
  html: string,
  applicationId: string
): string | null {
  const target = applicationId.trim().toUpperCase();
  if (!target) {
    return null;
  }

  const $ = load(html);
  for (const node of $("a").toArray()) {
    const id = $(node).text().trim().toUpperCase();
    if (id !== target) {
      continue;
    }
    const onclick = $(node).attr("onclick") ?? "";
    const sourceMatch = SOURCE_ONCLICK_REGEX.exec(onclick);
    if (sourceMatch?.[1]) {
      return sourceMatch[1];
    }
  }
  return null;
}

function isDustDetailHtml(result: CrawlResultPayload): boolean {
  if (result.html && DUST_DETAIL_TITLE_REGEX.test(result.html)) {
    return true;
  }
  return result.metadata?.title?.trim() === "Dust Application Detail";
}

function buildDisclaimerScript(): string {
  return `(() => {
    const button = document.querySelector('[id$="agreeBtn"]');
    if (!button) return "agree-missing";
    button.click();
    return "agree-clicked";
  })()`;
}

function buildSearchScript(
  applicationId: string,
  statusValues: readonly string[]
): string {
  return `(async () => {
    const permitId = ${JSON.stringify(applicationId)};
    const statusValues = ${JSON.stringify(statusValues)};
    const numberField = document.querySelector('[id="_idJsp6:dcpNumber"]');
    if (!numberField) return "missing-number-field";
    numberField.value = permitId;
    numberField.dispatchEvent(new Event("input", { bubbles: true }));
    numberField.dispatchEvent(new Event("change", { bubbles: true }));

    const statuses = document.querySelector('[id="_idJsp6:dcpStateCds"]');
    if (statuses && statuses.options) {
      const selected = new Set(statusValues);
      for (const option of Array.from(statuses.options)) {
        option.selected = selected.has(option.value);
      }
    }

    const submit = document.querySelector('[id="_idJsp6:dustAppSearch_SubmitBtn"]');
    if (!submit) return "missing-submit-button";
    submit.click();

    const waitFor = async (predicate, timeoutMs = 30000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    };

    await waitFor(() => {
      const hasPermitLink = Array.from(document.querySelectorAll("a")).some(
        (a) => (a.textContent || "").trim().toUpperCase() === permitId.toUpperCase()
      );
      if (hasPermitLink) return true;
      const bodyText = (document.body?.textContent || "").toLowerCase();
      return bodyText.includes("no records found");
    });

    return document.title;
  })()`;
}

function buildOpenDetailScript(source: string): string {
  return `(async () => {
    const source = ${JSON.stringify(source)};
    if (typeof submitForm !== "function") return "missing-submitForm";

    const form = document.querySelector("form");
    const formName = form && form.getAttribute("name") ? form.getAttribute("name") : "_idJsp5";
    submitForm(formName, 1, { source });

    const waitFor = async (predicate, timeoutMs = 30000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    };

    await waitFor(() => /Dust Application Detail/i.test(document.title));
    return document.title;
  })()`;
}
