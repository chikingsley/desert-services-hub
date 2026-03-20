import { getGraphToken } from "./auth";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const GRAPH_MAX_ATTEMPTS = 5;

function resolveGraphUrl(path: string): string {
  return path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(retryAfterSeconds)) {
      return Math.max(0, retryAfterSeconds * 1000);
    }

    const retryDate = new Date(retryAfter);
    if (!Number.isNaN(retryDate.getTime())) {
      return Math.max(0, retryDate.getTime() - Date.now());
    }
  }

  if (response.status === 429) {
    return 30_000;
  }

  return Math.min(5000 * 2 ** (attempt - 1), 80_000);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphRequest(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getGraphToken();
  const url = resolveGraphUrl(path);
  const headers = {
    ...(init?.headers ?? {}),
    Authorization: `Bearer ${token}`,
  };

  for (let attempt = 1; attempt <= GRAPH_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.ok) {
      return response;
    }

    const canRetry =
      GRAPH_RETRYABLE_STATUS_CODES.has(response.status) &&
      attempt < GRAPH_MAX_ATTEMPTS;
    if (canRetry) {
      await sleep(getRetryDelayMs(response, attempt));
      continue;
    }

    const text = await response.text();
    throw new Error(`Graph API ${response.status}: ${text}`);
  }

  throw new Error("Graph request retry loop exhausted unexpectedly");
}

export async function graphGet<T>(path: string): Promise<T> {
  const res = await graphRequest(path, {
    headers: {},
  });
  return (await res.json()) as T;
}

export async function graphGetBinary(path: string): Promise<Buffer> {
  const res = await graphRequest(path, {
    headers: {},
  });
  return Buffer.from(await res.arrayBuffer());
}

export async function graphPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await graphRequest(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 202 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await res.json()) as T;
}

export async function graphPatch<T>(
  path: string,
  body: Record<string, unknown>,
  opts?: { ifMatch?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts?.ifMatch) {
    headers["If-Match"] = opts.ifMatch;
  }

  const res = await graphRequest(path, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 202 || res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await res.json()) as T;
}
