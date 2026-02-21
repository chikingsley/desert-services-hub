import type {
  ContractResponse,
  CurrentCompanyResponse,
  GraphQLOperationType,
  GraphQLResponse,
  PaginatedContractsInput,
  PaginatedContractsResponse,
  PaginatedPayAppsInput,
  PaginatedPayAppsResponse,
  PayAppResponse,
} from "./types";

export interface SitelineClientConfig {
  apiKey?: string;
  apiUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

const DEFAULT_API_URL = "https://api-external.siteline.com/graphql";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADING_GRAPHQL_COMMENTS_RE = /^\s*(?:#[^\n]*\n\s*)*/;
const OPERATION_TYPE_RE = /^(query|mutation|subscription)\b/i;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export const CURRENT_COMPANY_QUERY = `
  query currentCompany {
    currentCompany {
      id
      name
    }
  }
`;

export const PAGINATED_CONTRACTS_QUERY = `
  query paginatedContracts($input: GetPaginatedContractsInput!) {
    paginatedContracts(input: $input) {
      cursor
      hasNext
      contracts {
        id
        contractNumber
        internalProjectNumber
        status
        project {
          id
          name
          projectNumber
        }
      }
    }
  }
`;

export const PAGINATED_PAY_APPS_QUERY = `
  query paginatedPayApps($input: GetPaginatedPayAppsInput!) {
    paginatedPayApps(input: $input) {
      cursor
      hasNext
      payApps {
        id
        status
        billingStart
        billingEnd
        payAppNumber
        submittedAt
      }
    }
  }
`;

export const CONTRACT_QUERY = `
  query contract($id: ID!) {
    contract(id: $id) {
      id
      contractNumber
      internalProjectNumber
      status
      project {
        id
        name
        projectNumber
      }
      payApps {
        id
        payAppNumber
        status
      }
    }
  }
`;

export const PAY_APP_QUERY = `
  query payApp($id: ID!) {
    payApp(id: $id) {
      id
      status
      billingStart
      billingEnd
      timeZone
      payAppNumber
      currentBilled
      currentRetention
      totalRetention
      submittedAt
      progress {
        id
        progressBilled
        storedMaterialBilled
        totalValue
        sovLineItem {
          id
          code
          name
        }
      }
    }
  }
`;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getGraphQLOperationType(query: string): GraphQLOperationType {
  const normalized = query.replace(LEADING_GRAPHQL_COMMENTS_RE, "").trimStart();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.startsWith("{")) {
    return "selection-set";
  }
  const match = normalized.match(OPERATION_TYPE_RE);
  if (!match) {
    return "unknown";
  }
  const rawType = match[1]?.toLowerCase();
  if (
    rawType === "query" ||
    rawType === "mutation" ||
    rawType === "subscription"
  ) {
    return rawType;
  }
  return "unknown";
}

export function isReadOnlyGraphQLQuery(query: string): boolean {
  const operationType = getGraphQLOperationType(query);
  return operationType === "query" || operationType === "selection-set";
}

export class SitelineError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 0, details?: unknown) {
    super(message);
    this.name = "SitelineError";
    this.status = status;
    this.details = details;
  }
}

export class SitelineClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private lastRequestAt = 0;
  private rateLimitLock: Promise<void> = Promise.resolve();

  constructor(config?: SitelineClientConfig) {
    this.apiUrl =
      config?.apiUrl ?? process.env.SITELINE_API_URL ?? DEFAULT_API_URL;
    this.apiKey = config?.apiKey ?? process.env.SITELINE_API_KEY ?? "";
    this.maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey.trim()) {
      throw new SitelineError(
        "Missing SITELINE_API_KEY. Set SITELINE_API_KEY in your environment."
      );
    }
  }

  private async applyRateLimit(): Promise<void> {
    let releaseLock: () => void = () => undefined;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const previousLock = this.rateLimitLock;
    this.rateLimitLock = previousLock.then(() => nextLock);

    await previousLock;
    const elapsedMs = Date.now() - this.lastRequestAt;
    const waitMs = Math.max(0, DEFAULT_MIN_REQUEST_INTERVAL_MS - elapsedMs);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    this.lastRequestAt = Date.now();
    releaseLock();
  }

  private getRetryDelayMs(attempt: number, response?: Response): number {
    const retryAfter = response?.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
    return Math.min(5000, 500 * 2 ** attempt);
  }

  private parsePayload<TData>(body: string): GraphQLResponse<TData> {
    try {
      return JSON.parse(body) as GraphQLResponse<TData>;
    } catch {
      return {
        errors: [{ message: `Non-JSON response: ${body.slice(0, 500)}` }],
      };
    }
  }

  private parseTransportError(error: unknown): SitelineError {
    if (error instanceof SitelineError) {
      return error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      return new SitelineError(
        `Siteline request timed out after ${this.timeoutMs}ms`
      );
    }
    return new SitelineError(
      `Siteline request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  private async executeRequest<TData>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ payload: GraphQLResponse<TData>; response: Response }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const body = await response.text();
      return { payload: this.parsePayload<TData>(body), response };
    } catch (error) {
      throw this.parseTransportError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  private ensureSuccessPayload<TData>(
    payload: GraphQLResponse<TData>,
    status: number
  ): TData {
    if (payload.errors && payload.errors.length > 0) {
      const first = payload.errors[0];
      throw new SitelineError(
        `Siteline GraphQL error: ${first?.message ?? "Unknown error"}`,
        status,
        payload.errors
      );
    }

    if (!payload.data) {
      throw new SitelineError(
        "Siteline response did not contain data.",
        status
      );
    }

    return payload.data;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof SitelineError) {
      return error.status === 0;
    }
    return true;
  }

  private async waitForRetry(
    attempt: number,
    response?: Response
  ): Promise<void> {
    await delay(this.getRetryDelayMs(attempt, response));
  }

  async query<TData>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<TData> {
    return await this.request<TData>(query, variables);
  }

  async queryReadOnly<TData>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<TData> {
    if (!isReadOnlyGraphQLQuery(query)) {
      throw new SitelineError(
        "Only read-only GraphQL queries are allowed for this operation."
      );
    }
    return await this.request<TData>(query, variables);
  }

  private async request<TData>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<TData> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.applyRateLimit();

      try {
        const { payload, response } = await this.executeRequest<TData>(
          query,
          variables
        );

        if (!response.ok) {
          if (
            RETRYABLE_STATUS_CODES.has(response.status) &&
            attempt < this.maxRetries
          ) {
            await this.waitForRetry(attempt, response);
            continue;
          }
          throw new SitelineError(
            `Siteline request failed with HTTP ${response.status}`,
            response.status,
            payload
          );
        }

        return this.ensureSuccessPayload(payload, response.status);
      } catch (error) {
        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          await this.waitForRetry(attempt);
          continue;
        }
        throw this.parseTransportError(error);
      }
    }

    throw new SitelineError("Siteline request failed after retries.");
  }

  async currentCompany(): Promise<CurrentCompanyResponse> {
    return await this.queryReadOnly<CurrentCompanyResponse>(
      CURRENT_COMPANY_QUERY
    );
  }

  async paginatedContracts(
    input: PaginatedContractsInput
  ): Promise<PaginatedContractsResponse> {
    return await this.queryReadOnly<PaginatedContractsResponse>(
      PAGINATED_CONTRACTS_QUERY,
      { input }
    );
  }

  async paginatedPayApps(
    input: PaginatedPayAppsInput
  ): Promise<PaginatedPayAppsResponse> {
    return await this.queryReadOnly<PaginatedPayAppsResponse>(
      PAGINATED_PAY_APPS_QUERY,
      { input }
    );
  }

  async contract(id: string): Promise<ContractResponse> {
    return await this.queryReadOnly<ContractResponse>(CONTRACT_QUERY, { id });
  }

  async payApp(id: string): Promise<PayAppResponse> {
    return await this.queryReadOnly<PayAppResponse>(PAY_APP_QUERY, { id });
  }
}
