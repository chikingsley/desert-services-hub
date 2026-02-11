/**
 * Automation API proxy handlers
 *
 * Proxies browser-session endpoints from the permit-worker service into
 * the main web app API so frontend can consume a single origin.
 */

const DEFAULT_PERMIT_WORKER_URL =
  process.env.PERMIT_WORKER_URL ?? "http://permit-worker:47822";
const DEFAULT_VNC_QUERY =
  "autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000";
const TRAILING_SLASH_RE = /\/$/;

function getPermitWorkerBaseUrl(): string {
  return DEFAULT_PERMIT_WORKER_URL.replace(TRAILING_SLASH_RE, "");
}

function getVncUrl(req: Request): string {
  const configured = process.env.PERMIT_WORKER_VNC_URL?.trim();
  if (configured) {
    return configured;
  }

  const requestUrl = new URL(req.url);
  const port = process.env.PERMIT_WORKER_VNC_PORT || "47821";
  return `${requestUrl.protocol}//${requestUrl.hostname}:${port}/vnc.html?${DEFAULT_VNC_QUERY}`;
}

async function proxyJson(path: string, method: "GET" | "POST") {
  const upstreamUrl = `${getPermitWorkerBaseUrl()}${path}`;
  const response = await fetch(upstreamUrl, { method });

  const payload = await response.json().catch(async () => {
    const body = await response.text().catch(() => "");
    return {
      success: false,
      error: body || `Permit worker returned HTTP ${response.status}`,
    };
  });

  return { response, payload };
}

function proxyError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json(
    {
      success: false,
      error: `Permit worker request failed: ${message}`,
      timestamp: new Date().toISOString(),
    },
    { status: 502 }
  );
}

/**
 * GET /api/automation/status
 */
export async function getAutomationStatus(req: Request): Promise<Response> {
  try {
    const { response, payload } = await proxyJson("/api/browser/status", "GET");
    const merged =
      payload && typeof payload === "object"
        ? { ...payload, vncUrl: getVncUrl(req) }
        : { payload, vncUrl: getVncUrl(req) };

    return Response.json(merged, { status: response.status });
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/start
 */
export async function postAutomationStart(): Promise<Response> {
  try {
    const { response, payload } = await proxyJson("/api/browser/start", "POST");
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/ready
 */
export async function postAutomationReady(): Promise<Response> {
  try {
    const { response, payload } = await proxyJson("/api/browser/ready", "POST");
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/keepalive
 */
export async function postAutomationKeepAlive(): Promise<Response> {
  try {
    const { response, payload } = await proxyJson(
      "/api/browser/keepalive",
      "POST"
    );
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/stop
 */
export async function postAutomationStop(): Promise<Response> {
  try {
    const { response, payload } = await proxyJson("/api/browser/stop", "POST");
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return proxyError(error);
  }
}
