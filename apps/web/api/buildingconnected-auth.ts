/**
 * BuildingConnected auth proxy handlers
 *
 * Proxies browser-session endpoints from the bc-worker service into
 * the main web app API so frontend can consume a single origin.
 */

function getBcWorkerBaseUrl(): string {
  return process.env.BC_WORKER_BASE_URL?.trim() || "http://bc-worker:47824";
}

function getBuildingConnectedVncWsUrl(req: Request): string {
  const configured = process.env.BUILDINGCONNECTED_AUTH_VNC_WS_URL?.trim();
  if (configured) {
    return configured;
  }

  const requestUrl = new URL(req.url);
  const wsProtocol = requestUrl.protocol === "https:" ? "wss:" : "ws:";
  const port = process.env.BUILDINGCONNECTED_AUTH_VNC_PORT || "6081";
  return `${wsProtocol}//${requestUrl.hostname}:${port}`;
}

function proxyFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json(
    {
      error: `BuildingConnected auth proxy failed: ${message}`,
      success: false,
      timestamp: new Date().toISOString(),
    },
    { status: 502 }
  );
}

async function proxyBackgroundJobs(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const upstream = await fetch(`${getBcWorkerBaseUrl()}${path}`, init);
  const payload = (await upstream.json().catch(() => ({}))) as
    | Record<string, unknown>
    | undefined;

  return Response.json(payload ?? {}, { status: upstream.status });
}

export async function getBuildingConnectedAuthStatus(
  req: Request
): Promise<Response> {
  try {
    const upstream = await fetch(
      `${getBcWorkerBaseUrl()}/api/buildingconnected/auth/status`
    );
    const payload = (await upstream.json().catch(() => ({}))) as
      | Record<string, unknown>
      | undefined;

    return Response.json(
      {
        ...(payload ?? {}),
        vncWsUrl: getBuildingConnectedVncWsUrl(req),
      },
      { status: upstream.status }
    );
  } catch (error) {
    return proxyFailure(error);
  }
}

export async function postBuildingConnectedAuthStart(
  req: Request
): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    return await proxyBackgroundJobs("/api/buildingconnected/auth/start", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    return proxyFailure(error);
  }
}

export async function postBuildingConnectedAuthStop(): Promise<Response> {
  try {
    return await proxyBackgroundJobs("/api/buildingconnected/auth/stop", {
      method: "POST",
    });
  } catch (error) {
    return proxyFailure(error);
  }
}
