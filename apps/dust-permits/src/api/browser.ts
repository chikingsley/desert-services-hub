/**
 * Browser API Handlers
 *
 * Plain handler functions for browser session management.
 */

import {
  abortBrowserSessionOperation,
  closeBrowserSession,
  ensureBrowserSessionReady,
  getOrCreateBrowserSession,
  getSessionStatus,
  keepBrowserSessionAlive,
} from "@/portal/utils/browser";
import { getCurrentPage } from "@/portal/utils/helpers";

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
      error,
      success: false,
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
 * GET /api/browser/debug - Inspect the active browser page for validation/debugging
 */
export async function handleBrowserDebug(): Promise<Response> {
  try {
    const session = await ensureBrowserSessionReady();
    const { page } = session.instance;
    const currentPage = await getCurrentPage(page);
    const debug = await page.evaluate(() => {
      const selectors = [
        '[class*="message"]',
        '[class*="error"]',
        '[role="alert"]',
        "td.x1q, span.x1q, div.x1q",
      ];

      const messages = new Set<string>();
      for (const selector of selectors) {
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        for (const node of nodes) {
          const text = node.innerText?.trim();
          if (!text) {
            continue;
          }
          if (text.length < 3) {
            continue;
          }
          if (node.offsetParent === null) {
            continue;
          }
          messages.add(text);
        }
      }

      const bodyText = document.body.innerText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 120);

      return {
        applicationId:
          document
            .querySelector('[id="ThePage:applicationId"]')
            ?.textContent?.trim() || null,
        bodyText,
        messages: [...messages].slice(0, 40),
        pageTitle: document.title,
      };
    });

    return jsonSuccess({
      currentPage,
      currentUrl: page.url(),
      debug,
      status: getSessionStatus(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return jsonError(errorMsg);
  }
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
      keepAlive,
      portalReady: keepAlive.portalReady,
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

/**
 * POST /api/browser/abort - Emergency stop for in-flight browser operations
 */
export async function handleBrowserAbort(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim()
        : "Operation aborted";

    const aborted = await abortBrowserSessionOperation(reason);
    return jsonSuccess({
      aborted,
      status: getSessionStatus(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return jsonError(errorMsg);
  }
}
