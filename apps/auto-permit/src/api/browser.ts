/**
 * Browser API Handlers
 *
 * Plain handler functions for browser session management.
 */

import {
  closeBrowserSession,
  getOrCreateBrowserSession,
  getSessionStatus,
} from "@/portal/utils/browser";

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
    return Response.json({
      success: true,
      isLoggedIn: session.isLoggedIn,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: errorMsg, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

/**
 * POST /api/browser/stop - Stop browser session
 */
export async function handleBrowserStop(): Promise<Response> {
  try {
    await closeBrowserSession();
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: errorMsg, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
