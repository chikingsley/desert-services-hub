/**
 * Permit Worker Client
 *
 * Typed HTTP client for the permit-worker API.
 * Wraps all 21 endpoints with type-safe request/response handling.
 */

import type {
  BrowserActionResponse,
  BrowserStatusResponse,
  ClipboardPasteRequest,
  ClipboardResponse,
  CloseRequest,
  CloseResponse,
  CreateRequest,
  CreateResponse,
  DashboardPermit,
  DeleteResponse,
  HealthResponse,
  InvoicePdfRequest,
  InvoicePdfResponse,
  RenewRequest,
  RenewResponse,
  ReviseRequest,
  ReviseResponse,
  ScrapePdfRequest,
  ScrapePdfResponse,
  ScrapeResponse,
  SyncResponse,
} from "./types";

// ============================================================================
// Config
// ============================================================================

export interface PermitClientConfig {
  /** Base URL of the permit-worker API. Default: PERMIT_WORKER_URL env or http://permit-worker:47822 */
  baseUrl?: string;
  /** Request timeout in ms. Default: 60_000 */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "http://permit-worker:47822";
const DEFAULT_TIMEOUT_MS = 60_000;
const TRAILING_SLASH_RE = /\/$/;

// ============================================================================
// Error
// ============================================================================

export class PermitWorkerError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly endpoint: string;

  constructor(
    message: string,
    status: number,
    body: unknown,
    endpoint: string
  ) {
    super(message);
    this.name = "PermitWorkerError";
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

// ============================================================================
// Client
// ============================================================================

export class PermitClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: PermitClientConfig) {
    const envUrl = process.env.PERMIT_WORKER_URL?.trim();
    this.baseUrl = (config?.baseUrl ?? envUrl ?? DEFAULT_BASE_URL).replace(
      TRAILING_SLASH_RE,
      ""
    );
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // --------------------------------------------------------------------------
  // Internal fetch helper
  // --------------------------------------------------------------------------

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Chain external signal if provided
    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }

    try {
      const response = await fetch(url, {
        method,
        headers:
          body !== undefined
            ? { "content-type": "application/json" }
            : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }

      if (!response.ok) {
        const msg =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as Record<string, unknown>).error)
            : `HTTP ${response.status}`;
        throw new PermitWorkerError(
          msg,
          response.status,
          payload,
          `${method} ${path}`
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof PermitWorkerError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new PermitWorkerError(
          `Request timed out after ${timeoutMs}ms`,
          0,
          null,
          `${method} ${path}`
        );
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new PermitWorkerError(
        `Request failed: ${msg}`,
        0,
        null,
        `${method} ${path}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // --------------------------------------------------------------------------
  // Scrape
  // --------------------------------------------------------------------------

  async scrapePdf(req: ScrapePdfRequest): Promise<ScrapePdfResponse> {
    return await this.request("POST", "/api/scrape/pdf", req);
  }

  async scrape(permitId: string): Promise<ScrapeResponse> {
    return await this.request("GET", `/api/scrape/${permitId}`);
  }

  // --------------------------------------------------------------------------
  // Permits
  // --------------------------------------------------------------------------

  async listPermits(): Promise<DashboardPermit[]> {
    return await this.request("GET", "/api/permits");
  }

  async getPermit(id: string): Promise<DashboardPermit> {
    return await this.request("GET", `/api/permits/${id}`);
  }

  async createPermit(req: CreateRequest): Promise<CreateResponse> {
    return await this.request("POST", "/api/permits/create", req);
  }

  async renewPermit(id: string, req?: RenewRequest): Promise<RenewResponse> {
    return await this.request("POST", `/api/permits/${id}/renew`, req ?? {});
  }

  async closePermit(id: string, req?: CloseRequest): Promise<CloseResponse> {
    return await this.request("POST", `/api/permits/${id}/close`, req ?? {});
  }

  async revisePermit(id: string, req: ReviseRequest): Promise<ReviseResponse> {
    return await this.request("POST", `/api/permits/${id}/revise`, req);
  }

  async deletePermit(id: string): Promise<DeleteResponse> {
    return await this.request("DELETE", `/api/permits/${id}`);
  }

  async deleteAllDrafts(): Promise<DeleteResponse> {
    return await this.request("DELETE", "/api/permits/drafts");
  }

  // --------------------------------------------------------------------------
  // Sync
  // --------------------------------------------------------------------------

  async sync(): Promise<SyncResponse> {
    return await this.request("POST", "/api/sync");
  }

  async syncCompany(options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<SyncResponse> {
    return await this.request("POST", "/api/sync/company", undefined, options);
  }

  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------

  async invoicePdf(req: InvoicePdfRequest): Promise<InvoicePdfResponse> {
    return await this.request("POST", "/api/invoices/pdf", req);
  }

  // --------------------------------------------------------------------------
  // Browser
  // --------------------------------------------------------------------------

  async browserStatus(): Promise<BrowserStatusResponse> {
    return await this.request("GET", "/api/browser/status");
  }

  async browserStart(): Promise<BrowserActionResponse> {
    return await this.request("POST", "/api/browser/start");
  }

  async browserReady(): Promise<BrowserActionResponse> {
    return await this.request("POST", "/api/browser/ready");
  }

  async browserKeepAlive(): Promise<BrowserActionResponse> {
    return await this.request("POST", "/api/browser/keepalive");
  }

  async browserStop(): Promise<BrowserActionResponse> {
    return await this.request("POST", "/api/browser/stop");
  }

  async clipboardPaste(req: ClipboardPasteRequest): Promise<ClipboardResponse> {
    return await this.request("POST", "/api/browser/clipboard/paste", req);
  }

  async clipboardCopy(): Promise<ClipboardResponse> {
    return await this.request("POST", "/api/browser/clipboard/copy");
  }

  // --------------------------------------------------------------------------
  // Health
  // --------------------------------------------------------------------------

  async health(): Promise<HealthResponse> {
    return await this.request("GET", "/health");
  }
}
