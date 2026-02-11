/**
 * Browser API Handlers
 *
 * Plain handler functions for browser session management.
 */

import {
  closeBrowserSession,
  ensureBrowserSessionReady,
  getOrCreateBrowserSession,
  getSessionStatus,
  keepBrowserSessionAlive,
} from "@/portal/utils/browser";

function jsonSuccess(data: Record<string, unknown>): Response {
  return Response.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

function jsonError(error: string, status = 500): Response {
  return Response.json(
    {
      success: false,
      error,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * GET /api/browser/status - Get browser session status
 */
export function handleBrowserStatus(): Response {
  const status = getSessionStatus();
  return Response.json({
    ...status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/browser/start - Start browser session
 */
export async function handleBrowserStart(): Promise<Response> {
  try {
    const session = await getOrCreateBrowserSession();
    return jsonSuccess({
      isLoggedIn: session.isLoggedIn,
      portalReady: session.portalReady,
      status: getSessionStatus(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return jsonError(errorMsg);
  }
}

/**
 * POST /api/browser/ready - Ensure browser session is active and logged in
 */
export async function handleBrowserReady(): Promise<Response> {
  try {
    await ensureBrowserSessionReady();
    const keepAlive = await keepBrowserSessionAlive({
      allowRelogin: true,
      force: true,
    });
    return jsonSuccess({
      isLoggedIn: keepAlive.isLoggedIn,
      portalReady: keepAlive.portalReady,
      keepAlive,
      status: getSessionStatus(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return jsonError(errorMsg);
  }
}

/**
 * POST /api/browser/keepalive - Trigger keepalive check and optional relogin
 */
export async function handleBrowserKeepAlive(): Promise<Response> {
  try {
    const keepAlive = await keepBrowserSessionAlive({
      allowRelogin: true,
      force: true,
    });
    return jsonSuccess({
      keepAlive,
      status: getSessionStatus(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return jsonError(errorMsg);
  }
}

/**
 * POST /api/browser/stop - Stop browser session
 */
export async function handleBrowserStop(): Promise<Response> {
  try {
    await closeBrowserSession();
    return jsonSuccess({ status: getSessionStatus() });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return jsonError(errorMsg);
  }
}
