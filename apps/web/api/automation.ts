/**
 * Automation API proxy handlers
 *
 * Proxies browser-session endpoints from the permit-worker service into
 * the main web app API so frontend can consume a single origin.
 */

import {
  PermitClient,
  PermitWorkerError,
} from "@/apps/dust-permits-mcp/client";

const client = new PermitClient();

function getVncUrl(req: Request): string {
  const configured = process.env.PERMIT_WORKER_VNC_URL?.trim();
  if (configured) {
    return configured;
  }

  const requestUrl = new URL(req.url);
  const port = process.env.PERMIT_WORKER_VNC_PORT || "6080";
  return `${requestUrl.protocol}//${requestUrl.hostname}:${port}/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=false&shared=true`;
}

function getVncWsUrl(req: Request): string {
  const configured = process.env.PERMIT_WORKER_VNC_WS_URL?.trim();
  if (configured) {
    return configured;
  }

  const requestUrl = new URL(req.url);
  const wsProtocol = requestUrl.protocol === "https:" ? "wss:" : "ws:";
  const port = process.env.PERMIT_WORKER_VNC_PORT || "6080";
  return `${wsProtocol}//${requestUrl.hostname}:${port}`;
}

function proxyError(error: unknown): Response {
  if (error instanceof PermitWorkerError) {
    const status =
      Number.isFinite(error.status) && error.status > 0 ? error.status : 502;
    if (error.body !== null && error.body !== undefined) {
      return Response.json(error.body, { status });
    }
    return Response.json(
      {
        error: error.message,
        success: false,
        timestamp: new Date().toISOString(),
      },
      { status }
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return Response.json(
    {
      error: `Permit worker request failed: ${message}`,
      success: false,
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
    const status = await client.browserStatus();
    return Response.json({
      ...status,
      vncUrl: getVncUrl(req),
      vncWsUrl: getVncWsUrl(req),
    });
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/start
 */
export async function postAutomationStart(): Promise<Response> {
  try {
    const result = await client.browserStart();
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/ready
 */
export async function postAutomationReady(): Promise<Response> {
  try {
    const result = await client.browserReady();
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/keepalive
 */
export async function postAutomationKeepAlive(): Promise<Response> {
  try {
    const result = await client.browserKeepAlive();
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/stop
 */
export async function postAutomationStop(): Promise<Response> {
  try {
    const result = await client.browserStop();
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/permits/:id/renew-and-pay
 *
 * Tunnel-safe proxy to permit-worker renew-and-pay endpoint.
 * This route exists so callers can use public web tunnel base URL while
 * still hitting the typed permit-worker contract.
 */
export async function postPermitRenewAndPay(
  req: { json(): Promise<unknown> },
  id: string
): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    const result = await client.renewAndPay(id, body as never);
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/permits/:id/submit-draft-and-pay
 *
 * Tunnel-safe proxy to permit-worker submit-draft-and-pay endpoint.
 */
export async function postPermitSubmitDraftAndPay(
  req: { json(): Promise<unknown> },
  id: string
): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    const result = await client.submitDraftAndPay(id, body as never);
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}
