/**
 * Kasm-backed automation API proxy handlers
 *
 * Proxies browser-session endpoints from the Kasm Maricopa permit-worker clone
 * into the main web app API so frontend can consume a single origin.
 */

import {
  PermitClient,
  PermitWorkerError,
} from "@/apps/dust-permits-mcp/client";

const client = new PermitClient({
  baseUrl:
    process.env.PERMIT_WORKER_KASM_URL?.trim() ||
    "http://permit-worker-kasm:47822",
});

function normalizeKasmUrl(url: string): string {
  const normalized = new URL(url);
  if (normalized.pathname === "") {
    normalized.pathname = "/";
  }
  return normalized.toString();
}

function getKasmUrl(): string {
  const explicitUrl = process.env.PERMIT_WORKER_KASM_PUBLIC_URL?.trim();
  if (explicitUrl) {
    return normalizeKasmUrl(explicitUrl);
  }

  const host = process.env.MARICOPA_KASM_HOST?.trim();
  if (host) {
    return normalizeKasmUrl(`https://${host}`);
  }

  return normalizeKasmUrl("https://maricopa-kasm.desertservices.app");
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
      error: `Permit worker Kasm request failed: ${message}`,
      success: false,
      timestamp: new Date().toISOString(),
    },
    { status: 502 }
  );
}

export async function getAutomationKasmStatus(
  _req: Request
): Promise<Response> {
  try {
    const status = await client.browserStatus();
    return Response.json({
      ...status,
      kasmUrl: getKasmUrl(),
      viewerKind: "kasm",
    });
  } catch (error) {
    return proxyError(error);
  }
}

export async function postAutomationKasmStart(): Promise<Response> {
  try {
    return Response.json(await client.browserStart());
  } catch (error) {
    return proxyError(error);
  }
}

export async function postAutomationKasmReady(): Promise<Response> {
  try {
    return Response.json(await client.browserReady());
  } catch (error) {
    return proxyError(error);
  }
}

export async function postAutomationKasmKeepAlive(): Promise<Response> {
  try {
    return Response.json(await client.browserKeepAlive());
  } catch (error) {
    return proxyError(error);
  }
}

export async function postAutomationKasmStop(): Promise<Response> {
  try {
    return Response.json(await client.browserStop());
  } catch (error) {
    return proxyError(error);
  }
}
