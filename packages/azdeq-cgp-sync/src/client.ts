import {
  DEFAULT_CGP_ENDPOINT,
  DEFAULT_REFERER,
  DEFAULT_USER_AGENT,
} from "./constants";
import type { CgpClientOptions, CgpPermitRecord, CgpQuery } from "./types";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_MS = 600;

export class AzdeqCgpClientError extends Error {
  readonly endpoint: string;
  readonly status: number;

  constructor(message: string, endpoint: string, status = 0) {
    super(message);
    this.name = "AzdeqCgpClientError";
    this.endpoint = endpoint;
    this.status = status;
  }
}

export class AzdeqCgpClient {
  private readonly endpoint: string;
  private readonly userAgent: string;
  private readonly referer: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options?: CgpClientOptions) {
    this.endpoint = options?.endpoint ?? DEFAULT_CGP_ENDPOINT;
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.referer = options?.referer ?? DEFAULT_REFERER;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async fetchByCounty(countyCode: string): Promise<CgpPermitRecord[]> {
    return await this.fetchPermits({ facilitycounty: countyCode });
  }

  async fetchByLtfId(ltfId: string): Promise<CgpPermitRecord[]> {
    return await this.fetchPermits({ ltfid: ltfId });
  }

  async fetchPermits(query: CgpQuery): Promise<CgpPermitRecord[]> {
    const queryString = this.toQueryString(query);
    if (!queryString) {
      throw new AzdeqCgpClientError(
        "At least one filter is required. Empty CGP query commonly returns HTTP 500.",
        this.endpoint
      );
    }

    const url = `${this.endpoint}?${queryString}`;
    return await this.requestJson(url);
  }

  private toQueryString(query: CgpQuery): string {
    const params = new URLSearchParams();

    if (query.ltfid?.trim()) {
      params.set("ltfid", query.ltfid.trim());
    }
    if (query.companyname?.trim()) {
      params.set("companyname", query.companyname.trim());
    }
    if (query.facilityname?.trim()) {
      params.set("facilityname", query.facilityname.trim());
    }
    if (query.facilitycounty?.trim()) {
      params.set("facilitycounty", query.facilitycounty.trim());
    }

    return params.toString();
  }

  private async requestJson(url: string): Promise<CgpPermitRecord[]> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url);
        await this.throwIfHttpError(response, url);
        return await this.parsePermitPayload(response, url);
      } catch (error) {
        const clientError = this.toClientError(error, url);
        if (this.shouldRetry(clientError, attempt)) {
          await this.sleep(BACKOFF_MS * attempt);
          continue;
        }
        throw clientError;
      }
    }

    throw new AzdeqCgpClientError(
      "Unexpected client state while requesting CGP endpoint.",
      this.endpoint
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent": this.userAgent,
          referer: this.referer,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throwIfHttpError(
    response: Response,
    url: string
  ): Promise<void> {
    if (response.ok) {
      return;
    }

    const text = await response.text();
    throw new AzdeqCgpClientError(
      `HTTP ${response.status} from CGP endpoint: ${text.slice(0, 400)}`,
      url,
      response.status
    );
  }

  private async parsePermitPayload(
    response: Response,
    url: string
  ): Promise<CgpPermitRecord[]> {
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new AzdeqCgpClientError(
        "Expected CGP endpoint payload to be a JSON array.",
        url,
        response.status
      );
    }
    return payload as CgpPermitRecord[];
  }

  private shouldRetry(error: AzdeqCgpClientError, attempt: number): boolean {
    if (attempt >= this.maxRetries) {
      return false;
    }
    return error.status >= 500 || error.status === 0;
  }

  private toClientError(error: unknown, url: string): AzdeqCgpClientError {
    if (error instanceof AzdeqCgpClientError) {
      return error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      return new AzdeqCgpClientError(
        `Request timed out after ${this.timeoutMs}ms`,
        url,
        0
      );
    }
    const message =
      error instanceof Error ? error.message : "Unknown request failure";
    return new AzdeqCgpClientError(message, url, 0);
  }
}
