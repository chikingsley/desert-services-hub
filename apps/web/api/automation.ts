/**
 * Automation API proxy handlers
 *
 * Proxies browser-session endpoints from the permit-worker service into
 * the main web app API so frontend can consume a single origin.
 */

import { PermitClient, PermitWorkerError } from "@permits/client";
import { z } from "zod";

const clipboardPasteSchema = z.object({
  text: z.string().catch(""),
});

const client = new PermitClient();

const DEFAULT_VNC_QUERY =
  "autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=false&shared=true";

function getVncUrl(req: Request): string {
  const configured = process.env.PERMIT_WORKER_VNC_URL?.trim();
  if (configured) {
    return configured;
  }

  const requestUrl = new URL(req.url);
  const port = process.env.PERMIT_WORKER_VNC_PORT || "6080";
  return `${requestUrl.protocol}//${requestUrl.hostname}:${port}/vnc.html?${DEFAULT_VNC_QUERY}`;
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
    return Response.json({ ...status, vncUrl: getVncUrl(req) });
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
 * POST /api/automation/clipboard/paste
 */
export async function postAutomationClipboardPaste(
  req: Request
): Promise<Response> {
  try {
    const { text } = clipboardPasteSchema.parse(
      await req.json().catch(() => ({}))
    );
    const result = await client.clipboardPaste({ text });
    return Response.json(result);
  } catch (error) {
    return proxyError(error);
  }
}

/**
 * POST /api/automation/clipboard/copy
 */
export async function postAutomationClipboardCopy(): Promise<Response> {
  try {
    const result = await client.clipboardCopy();
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
