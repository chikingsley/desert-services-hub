const DEFAULT_VNC_QUERY =
  "autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=false&shared=true";
const REQUIRED_VNC_PARAMS = {
  autoconnect: "true",
  reconnect: "true",
  reconnect_delay: "2000",
  resize: "scale",
  shared: "true",
  view_only: "false",
} as const;

function normalizeVncUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed.length) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === "/") {
      parsed.pathname = "/vnc.html";
    }

    for (const [key, value] of Object.entries(REQUIRED_VNC_PARAMS)) {
      parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function getBcWorkerBaseUrl(): string {
  return (
    process.env.BC_WORKER_BASE_URL?.trim() ||
    "http://bc-worker:47824"
  );
}

function getBuildingConnectedVncUrl(req: Request): string {
  const configured = process.env.BUILDINGCONNECTED_AUTH_VNC_URL?.trim();
  if (configured) {
    return normalizeVncUrl(configured);
  }

  const requestUrl = new URL(req.url);
  const port = process.env.BUILDINGCONNECTED_AUTH_VNC_PORT || "6081";
  return normalizeVncUrl(
    `${requestUrl.protocol}//${requestUrl.hostname}:${port}/vnc.html?${DEFAULT_VNC_QUERY}`
  );
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
        vncUrl: getBuildingConnectedVncUrl(req),
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

export async function postBuildingConnectedAuthClipboardPaste(
  req: Request
): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    return await proxyBackgroundJobs(
      "/api/buildingconnected/auth/clipboard/paste",
      {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );
  } catch (error) {
    return proxyFailure(error);
  }
}

export async function postBuildingConnectedAuthClipboardCopy(): Promise<Response> {
  try {
    return await proxyBackgroundJobs(
      "/api/buildingconnected/auth/clipboard/copy",
      {
        method: "POST",
      }
    );
  } catch (error) {
    return proxyFailure(error);
  }
}
