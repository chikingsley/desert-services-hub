/**
 * BuildingConnected file download using the persistent browser session.
 *
 * Opens a new tab in the singleton session's context (reuses cookies).
 * No cold-start overhead, no ephemeral browsers.
 */
import { readFile, unlink } from "node:fs/promises";
import type { Download, Page } from "playwright";
import { bcSession } from "../lib/browser";

const PAGE_TIMEOUT_MS = 45_000;
const DOWNLOAD_WAIT_MS = 15_000;
const AUTO_DOWNLOAD_SETTLE_MS = 3000;

const DOWNLOAD_SELECTORS = [
  'button:has-text("Download")',
  'a:has-text("Download")',
  '[data-testid="download"]',
  'button:has-text("Download Folder")',
  'a:has-text("Direct download")',
  'a:has-text("Download as zip")',
];

interface DownloadResult {
  data: string;
  name: string;
  size: number;
  success: true;
}

interface DownloadError {
  error: string;
  pageTitle?: string;
  success: false;
}

async function tryClickDownload(page: Page): Promise<Download | null> {
  for (const selector of DOWNLOAD_SELECTORS) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        const downloadPromise = page.waitForEvent("download", {
          timeout: DOWNLOAD_WAIT_MS,
        });
        await button.click();
        return await downloadPromise;
      }
    } catch {
      // Try next selector
    }
  }
  return null;
}

function downloadFile(url: string): Promise<DownloadResult | DownloadError> {
  return bcSession.withOperation("download", async (session) => {
    const page = await session.instance.context.newPage();

    try {
      const autoDownloadPromise = page
        .waitForEvent("download", { timeout: PAGE_TIMEOUT_MS })
        .catch(() => null);

      await page.goto(url, {
        timeout: PAGE_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });

      let download = await Promise.race([
        autoDownloadPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), AUTO_DOWNLOAD_SETTLE_MS)
        ),
      ]);

      if (!download) {
        download = await tryClickDownload(page);
      }

      if (!download) {
        const title = await page.title().catch(() => "unknown");
        return {
          error:
            "No download triggered. Session may have expired or page requires CAPTCHA.",
          pageTitle: title,
          success: false as const,
        };
      }

      const tmpPath = await download.path();
      if (!tmpPath) {
        return {
          error: "Download path not available",
          success: false as const,
        };
      }

      const filename = download.suggestedFilename();
      const buffer = await readFile(tmpPath);

      try {
        await unlink(tmpPath);
      } catch {
        // Non-fatal
      }

      return {
        data: buffer.toString("base64"),
        name: filename,
        size: buffer.byteLength,
        success: true as const,
      };
    } finally {
      await page.close().catch(() => {
        // Non-fatal: page may already be closed
      });
    }
  });
}

export async function handleBuildingConnectedDownload(
  req: Request
): Promise<Response> {
  const status = bcSession.getStatus();
  if (!status.active) {
    return Response.json(
      {
        error: "No active browser session",
        success: false,
      },
      { status: 503 }
    );
  }
  if (!status.isLoggedIn) {
    return Response.json(
      {
        error: "Not logged in. Run auth bootstrap via VNC first.",
        success: false,
      },
      { status: 401 }
    );
  }

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return Response.json(
      { error: "Invalid JSON body", success: false },
      { status: 400 }
    );
  }

  if (!body?.url || typeof body.url !== "string") {
    return Response.json(
      { error: "url is required", success: false },
      { status: 400 }
    );
  }

  try {
    const result = await downloadFile(body.url);
    if (!result.success) {
      return Response.json(result, { status: 422 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bc-worker-download] failed: ${message}`);
    return Response.json({ error: message, success: false }, { status: 500 });
  }
}
