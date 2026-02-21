import {
  DEFAULT_ARCGIS_PAGE_SIZE,
  DEFAULT_ARCGIS_SERVICES_BASE_URL,
} from "./arcgis-constants";
import type {
  ArcGisClientOptions,
  ArcGisFeature,
  ArcGisLayerConfig,
  ArcGisLayerMetadata,
} from "./arcgis-types";
import { parseRetryAfterMs } from "./megasearch-client";

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_RETRIES = 4;
const RETRY_BACKOFF_MS = 750;
const RETRY_JITTER_MS = 250;
const MAX_RETRY_AFTER_MS = 60_000;

interface ArcGisQueryResponse {
  error?: {
    code?: number;
    details?: unknown;
    message?: string;
  };
  exceededTransferLimit?: boolean;
  features?: unknown[];
}

interface ArcGisCountResponse {
  count?: number;
  error?: {
    code?: number;
    details?: unknown;
    message?: string;
  };
}

export class ArcGisClientError extends Error {
  readonly responseStatus: number;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    responseStatus: number,
    retryAfterMs: number | null
  ) {
    super(message);
    this.name = "ArcGisClientError";
    this.responseStatus = responseStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isInteger(value)) {
    return DEFAULT_ARCGIS_PAGE_SIZE;
  }
  return Math.max(1, Math.min(2000, value ?? DEFAULT_ARCGIS_PAGE_SIZE));
}

function extractArcGisErrorMessage(
  payload: ArcGisQueryResponse | ArcGisCountResponse
): string | null {
  if (!payload.error) {
    return null;
  }

  const parts = [payload.error.message ?? "ArcGIS error response"];
  if (
    Array.isArray(payload.error.details) &&
    payload.error.details.length > 0
  ) {
    parts.push(String(payload.error.details[0]));
  }
  return parts.filter(Boolean).join(": ");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500 || status === 0;
}

function calculateRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof ArcGisClientError) {
    if (!isRetryableStatus(error.responseStatus)) {
      return -1;
    }
    if (error.responseStatus === 429 && error.retryAfterMs !== null) {
      return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, error.retryAfterMs));
    }
  }

  const jitterMs = Math.floor(Math.random() * RETRY_JITTER_MS);
  return RETRY_BACKOFF_MS * Math.max(1, attempt) + jitterMs;
}

function toArcGisClientError(error: unknown): ArcGisClientError {
  if (error instanceof ArcGisClientError) {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ArcGisClientError("ArcGIS request timed out", 0, null);
  }
  const message =
    error instanceof Error ? error.message : "Unknown ArcGIS error";
  return new ArcGisClientError(message, 0, null);
}

function asFeature(value: unknown): ArcGisFeature | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (!candidate.attributes || typeof candidate.attributes !== "object") {
    return null;
  }
  return {
    attributes: candidate.attributes as Record<string, unknown>,
    geometry:
      candidate.geometry && typeof candidate.geometry === "object"
        ? (candidate.geometry as Record<string, unknown>)
        : null,
  };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class ArcGisClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options?: ArcGisClientOptions & { baseUrl?: string }) {
    this.baseUrl = options?.baseUrl ?? DEFAULT_ARCGIS_SERVICES_BASE_URL;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getLayerMetadata(
    layer: ArcGisLayerConfig
  ): Promise<ArcGisLayerMetadata> {
    const url = this.layerUrl(layer);
    const metadata = (await this.fetchJson(
      `${url}?f=pjson`
    )) as ArcGisLayerMetadata;
    return metadata;
  }

  async getLayerCount(layer: ArcGisLayerConfig): Promise<number> {
    const url = new URL(`${this.layerUrl(layer)}/query`);
    url.searchParams.set("where", "1=1");
    url.searchParams.set("returnCountOnly", "true");
    url.searchParams.set("f", "pjson");

    const payload = (await this.fetchJson(
      url.toString()
    )) as ArcGisCountResponse;
    const errorMessage = extractArcGisErrorMessage(payload);
    if (errorMessage) {
      throw new ArcGisClientError(errorMessage, 0, null);
    }
    if (!Number.isInteger(payload.count)) {
      throw new ArcGisClientError(
        `ArcGIS count payload missing integer count for layer ${layer.key}`,
        0,
        null
      );
    }
    return payload.count ?? 0;
  }

  async queryLayerPage(input: {
    layer: ArcGisLayerConfig;
    objectIdField: string;
    pageSize?: number;
    resultOffset: number;
  }): Promise<{
    exceededTransferLimit: boolean;
    features: ArcGisFeature[];
  }> {
    const pageSize = clampPageSize(input.pageSize);
    const url = new URL(`${this.layerUrl(input.layer)}/query`);
    url.searchParams.set("where", "1=1");
    url.searchParams.set("outFields", "*");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("resultOffset", `${input.resultOffset}`);
    url.searchParams.set("resultRecordCount", `${pageSize}`);
    url.searchParams.set("orderByFields", `${input.objectIdField} ASC`);
    url.searchParams.set("f", "pjson");

    const payload = (await this.fetchJson(
      url.toString()
    )) as ArcGisQueryResponse;
    const errorMessage = extractArcGisErrorMessage(payload);
    if (errorMessage) {
      throw new ArcGisClientError(errorMessage, 0, null);
    }
    if (!Array.isArray(payload.features)) {
      throw new ArcGisClientError(
        `ArcGIS query payload missing features array for layer ${input.layer.key}`,
        0,
        null
      );
    }

    const features: ArcGisFeature[] = [];
    for (const feature of payload.features) {
      const normalized = asFeature(feature);
      if (normalized) {
        features.push(normalized);
      }
    }

    return {
      features,
      exceededTransferLimit: Boolean(payload.exceededTransferLimit),
    };
  }

  private layerUrl(layer: ArcGisLayerConfig): string {
    return `${this.baseUrl}/${layer.serviceName}/FeatureServer/${layer.layerId}`;
  }

  private async fetchJson(url: string): Promise<unknown> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url);
        if (!response.ok) {
          const responseText = await response.text();
          const retryAfterMs = parseRetryAfterMs(
            this.headersToRecord(response.headers)
          );
          throw new ArcGisClientError(
            `ArcGIS HTTP ${response.status}: ${responseText.slice(0, 400)}`,
            response.status,
            retryAfterMs
          );
        }
        return (await response.json()) as unknown;
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw toArcGisClientError(error);
        }
        const retryDelayMs = calculateRetryDelayMs(error, attempt);
        if (retryDelayMs < 0) {
          throw toArcGisClientError(error);
        }
        await sleep(retryDelayMs);
      }
    }

    throw new ArcGisClientError("Unexpected ArcGIS client state", 0, null);
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        headers: {
          accept: "application/json, text/plain, */*",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private headersToRecord(headers: Headers): Record<string, string> {
    return Object.fromEntries(
      Array.from(headers.entries()).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ])
    );
  }
}
