/**
 * BuildingConnected file download proxy.
 *
 * Streams files from BuildingConnected using auth cookies extracted from
 * the persistent Playwright browser session. Returns a binary response
 * (not base64 JSON) so callers can stream large files to disk without
 * buffering everything in memory.
 *
 * Input: { downloadUrl: "/_/download/file/..." }
 * Output: streaming binary with Content-Type/Content-Length/Content-Disposition
 */
import { bcSession } from "../lib/browser";

const BC_BASE = "https://app.buildingconnected.com";
const DOWNLOAD_TIMEOUT_MS = 300_000; // 5 minutes for large files

async function getAuthCookieHeader(): Promise<string> {
  const context = bcSession.getContext();
  if (!context) {
    throw new Error("No active browser context");
  }
  const cookies = await context.cookies(BC_BASE);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export async function handleBuildingConnectedDownload(
  req: Request
): Promise<Response> {
  const status = bcSession.getStatus();
  if (!status.active) {
    return Response.json(
      { error: "No active browser session", success: false },
      { status: 503 }
    );
  }
  if (!status.isLoggedIn) {
    return Response.json(
      { error: "Not logged in", success: false },
      { status: 401 }
    );
  }

  let body: { downloadUrl?: string };
  try {
    body = (await req.json()) as { downloadUrl?: string };
  } catch {
    return Response.json(
      { error: "Invalid JSON body", success: false },
      { status: 400 }
    );
  }

  if (!body?.downloadUrl || typeof body.downloadUrl !== "string") {
    return Response.json(
      { error: "downloadUrl is required", success: false },
      { status: 400 }
    );
  }

  try {
    const cookieHeader = await getAuthCookieHeader();
    const fullUrl = body.downloadUrl.startsWith("http")
      ? body.downloadUrl
      : `${BC_BASE}${body.downloadUrl}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(fullUrl, {
        headers: { Cookie: cookieHeader },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }

    clearTimeout(timer);

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => "");
      return Response.json(
        {
          error: `BC download returned HTTP ${upstream.status}: ${errorText.slice(0, 200)}`,
          success: false,
        },
        { status: 502 }
      );
    }

    // Pass through the streaming body with relevant headers
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    const contentDisposition = upstream.headers.get("content-disposition");
    if (contentDisposition) {
      headers.set("Content-Disposition", contentDisposition);
    }

    return new Response(upstream.body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bc-worker-download] failed: ${message}`);
    return Response.json({ error: message, success: false }, { status: 500 });
  }
}
