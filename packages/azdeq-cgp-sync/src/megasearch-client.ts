import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "playwright";
import {
  DEFAULT_MEGASEARCH_BASE_URL,
  DEFAULT_MEGASEARCH_REFERER,
  DEFAULT_MEGASEARCH_USER_AGENT,
} from "./megasearch-constants";
import { parseMegaSearchEnvelope } from "./megasearch-schema";
import type {
  MegaSearchClientOptions,
  MegaSearchEndpointConfig,
  MegaSearchQuery,
  MegaSearchQueryErrorDetails,
  MegaSearchQueryResult,
} from "./megasearch-types";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 750;
const RETRY_JITTER_MS = 250;
const MAX_RETRY_AFTER_MS = 60_000;

interface BrowserFetchResult {
  responseHeaders: Record<string, string>;
  responseStatus: number;
  responseText: string;
}

export class AzdeqMegaSearchClientError extends Error {
  readonly details: MegaSearchQueryErrorDetails;

  constructor(message: string, details: MegaSearchQueryErrorDetails) {
    super(message);
    this.name = "AzdeqMegaSearchClientError";
    this.details = details;
  }
}

export function parseRetryAfterMs(
  headers: Record<string, string>,
  nowMs = Date.now()
): number | null {
  const retryAfter = headers["retry-after"]?.trim();
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const retryDateMs = Date.parse(retryAfter);
  if (Number.isNaN(retryDateMs)) {
    return null;
  }

  return Math.max(0, retryDateMs - nowMs);
}

function isRetryableStatus(responseStatus: number): boolean {
  return responseStatus === 429 || responseStatus >= 500 || responseStatus === 0;
}

function calculateRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof AzdeqMegaSearchClientError) {
    if (!isRetryableStatus(error.details.responseStatus)) {
      return -1;
    }

    if (error.details.responseStatus === 429) {
      const retryAfterMs = error.details.retryAfterMs ?? null;
      if (retryAfterMs !== null) {
        return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryAfterMs));
      }
    }
  }

  const jitterMs = Math.floor(Math.random() * RETRY_JITTER_MS);
  return RETRY_BACKOFF_MS * Math.max(1, attempt) + jitterMs;
}

export class AzdeqMegaSearchClient {
  private readonly baseUrl: string;
  private readonly headless: boolean;
  private readonly maxRetries: number;
  private readonly referer: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(options?: MegaSearchClientOptions) {
    this.baseUrl = options?.baseUrl ?? DEFAULT_MEGASEARCH_BASE_URL;
    this.headless = options?.headless ?? true;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.referer = options?.referer ?? DEFAULT_MEGASEARCH_REFERER;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options?.userAgent ?? DEFAULT_MEGASEARCH_USER_AGENT;
  }

  async start(): Promise<void> {
    if (this.page) {
      return;
    }

    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext({
      userAgent: this.userAgent,
    });
    this.page = await this.context.newPage();
    await this.page.goto(this.referer, {
      waitUntil: "domcontentloaded",
      timeout: this.timeoutMs,
    });
    await this.page.waitForTimeout(2500);
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async queryEndpoint(
    endpointConfig: MegaSearchEndpointConfig,
    query: MegaSearchQuery
  ): Promise<MegaSearchQueryResult> {
    await this.start();
    const page = this.page;
    if (!page) {
      throw new Error("MegaSearch browser page is not initialized.");
    }

    const payload = {
      facilityName: query.facilityName,
      uniqueId: query.uniqueId,
      address: query.address,
      city: query.city,
      zip: query.zip,
      [endpointConfig.checkbox]: true,
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const browserFetch = (await page.evaluate(
          async ({ endpoint, requestPayload }) => {
            const response = await fetch(`${endpoint}/list`, {
              method: "POST",
              headers: {
                accept: "application/json, text/plain, */*",
                "content-type": "application/json; charset=utf-8",
              },
              body: JSON.stringify(requestPayload),
            });

            const responseText = await response.text();
            const responseHeaders = Object.fromEntries(
              Array.from(response.headers.entries()).map(([key, value]) => [
                key.toLowerCase(),
                value,
              ])
            );
            return {
              responseHeaders,
              responseStatus: response.status,
              responseText,
            } satisfies BrowserFetchResult;
          },
          {
            endpoint: endpointConfig.endpoint,
            requestPayload: payload,
          }
        )) as BrowserFetchResult;

        if (browserFetch.responseStatus >= 400) {
          const retryAfterMs = parseRetryAfterMs(browserFetch.responseHeaders);
          throw new AzdeqMegaSearchClientError(
            `MegaSearch HTTP ${browserFetch.responseStatus} for endpoint "${endpointConfig.endpoint}": ${browserFetch.responseText.slice(0, 400)}`,
            {
              endpoint: endpointConfig.endpoint,
              responseStatus: browserFetch.responseStatus,
              query,
              retryAfterMs,
            }
          );
        }

        const parsedJson = JSON.parse(browserFetch.responseText) as unknown;
        const parsed = parseMegaSearchEnvelope(
          parsedJson,
          endpointConfig.endpoint
        );

        return {
          endpoint: endpointConfig.endpoint,
          query,
          responseStatus: browserFetch.responseStatus,
          rows: parsed.rows,
          rawEnvelope: parsed.envelope,
        };
      } catch (error) {
        if (attempt >= this.maxRetries) {
          if (error instanceof AzdeqMegaSearchClientError) {
            throw error;
          }
          const message =
            error instanceof Error ? error.message : "Unknown MegaSearch error";
          throw new AzdeqMegaSearchClientError(message, {
            endpoint: endpointConfig.endpoint,
            responseStatus: 0,
            query,
          });
        }

        const retryDelayMs = calculateRetryDelayMs(error, attempt);
        if (retryDelayMs < 0) {
          if (error instanceof AzdeqMegaSearchClientError) {
            throw error;
          }
          const message =
            error instanceof Error ? error.message : "Unknown MegaSearch error";
          throw new AzdeqMegaSearchClientError(message, {
            endpoint: endpointConfig.endpoint,
            responseStatus: 0,
            query,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw new AzdeqMegaSearchClientError(
      "Unexpected MegaSearch client state.",
      {
        endpoint: endpointConfig.endpoint,
        responseStatus: 0,
        query,
      }
    );
  }
}
