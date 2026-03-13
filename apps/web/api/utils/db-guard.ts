/**
 * API DB guardrails:
 * - bounded wait time for DB calls in request handlers
 * - lightweight structured error metadata for logs/responses
 */

const DEFAULT_DB_TIMEOUT_MS = 8_000;
const DEFAULT_SLOW_QUERY_MS = 1_500;
const DEFAULT_MAX_IN_FLIGHT = 3;
const inflightByRoute = new Map<string, number>();

export class ApiDbTimeoutError extends Error {
  readonly operation: string;
  readonly requestId: string;
  readonly route: string;
  readonly timeoutMs: number;

  constructor(params: {
    operation: string;
    requestId: string;
    route: string;
    timeoutMs: number;
  }) {
    super(
      `DB query timed out after ${params.timeoutMs}ms (${params.route} :: ${params.operation})`
    );
    this.name = "ApiDbTimeoutError";
    this.operation = params.operation;
    this.requestId = params.requestId;
    this.route = params.route;
    this.timeoutMs = params.timeoutMs;
  }
}

export class ApiDbOverloadedError extends Error {
  readonly current: number;
  readonly maxInFlight: number;
  readonly operation: string;
  readonly requestId: string;
  readonly route: string;

  constructor(params: {
    current: number;
    maxInFlight: number;
    operation: string;
    requestId: string;
    route: string;
  }) {
    super(
      `DB concurrency guard tripped (${params.route} :: ${params.operation}, inFlight=${params.current}, max=${params.maxInFlight})`
    );
    this.name = "ApiDbOverloadedError";
    this.current = params.current;
    this.maxInFlight = params.maxInFlight;
    this.operation = params.operation;
    this.requestId = params.requestId;
    this.route = params.route;
  }
}

export function isApiDbTimeoutError(
  error: unknown
): error is ApiDbTimeoutError | ApiDbOverloadedError {
  return (
    error instanceof ApiDbTimeoutError || error instanceof ApiDbOverloadedError
  );
}

export function isTransientApiDbError(error: unknown): boolean {
  if (isApiDbTimeoutError(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const withCode = error as Error & { code?: string; errno?: string };
  // Postgres protocol contention / transient saturation seen during rapid query churn.
  if (withCode.errno === "08P01") {
    return true;
  }
  if (withCode.errno === "53300") {
    return true;
  }
  return false;
}

export function formatErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string; errno?: string };
    return {
      name: error.name,
      message: error.message,
      code: withCode.code,
      errno: withCode.errno,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

function resolveTimeoutMs(override?: number): number {
  if (Number.isFinite(override) && (override as number) > 0) {
    return override as number;
  }

  const raw = process.env.API_DB_QUERY_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_DB_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_DB_TIMEOUT_MS;
}

function resolveSlowThresholdMs(): number {
  const raw = process.env.API_DB_SLOW_QUERY_MS?.trim();
  if (!raw) {
    return DEFAULT_SLOW_QUERY_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_SLOW_QUERY_MS;
}

function resolveMaxInFlight(override?: number): number {
  if (Number.isFinite(override) && (override as number) > 0) {
    return override as number;
  }

  const raw = process.env.API_DB_MAX_IN_FLIGHT?.trim();
  if (!raw) {
    return DEFAULT_MAX_IN_FLIGHT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_MAX_IN_FLIGHT;
}

export async function withApiDbTimeout<T>(
  params: {
    operation: string;
    requestId: string;
    route: string;
    maxInFlight?: number;
    timeoutMs?: number;
  },
  work: () => Promise<T>
): Promise<T> {
  const timeoutMs = resolveTimeoutMs(params.timeoutMs);
  const slowThresholdMs = resolveSlowThresholdMs();
  const maxInFlight = resolveMaxInFlight(params.maxInFlight);
  const inFlight = inflightByRoute.get(params.route) ?? 0;
  if (inFlight >= maxInFlight) {
    throw new ApiDbOverloadedError({
      current: inFlight,
      maxInFlight,
      operation: params.operation,
      requestId: params.requestId,
      route: params.route,
    });
  }

  inflightByRoute.set(params.route, inFlight + 1);
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let released = false;
  let timedOut = false;

  const release = () => {
    if (released) {
      return;
    }
    released = true;
    const current = inflightByRoute.get(params.route) ?? 0;
    if (current <= 1) {
      inflightByRoute.delete(params.route);
    } else {
      inflightByRoute.set(params.route, current - 1);
    }
  };

  const workPromise = work();
  const trackedWorkPromise = workPromise.finally(() => {
    release();
  });
  // Prevent unhandled rejections when timeout wins the race and the DB query rejects later.
  trackedWorkPromise.catch(() => {
    if (!timedOut) {
      return;
    }
  });

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(
          new ApiDbTimeoutError({
            operation: params.operation,
            requestId: params.requestId,
            route: params.route,
            timeoutMs,
          })
        );
      }, timeoutMs);
    });

    const result = await Promise.race([trackedWorkPromise, timeoutPromise]);
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= slowThresholdMs) {
      console.warn("[api.db.slow]", {
        requestId: params.requestId,
        route: params.route,
        operation: params.operation,
        durationMs,
      });
    }
    return result;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    release();
  }
}
