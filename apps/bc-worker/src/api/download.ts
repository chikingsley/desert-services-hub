/**
 * BuildingConnected file download via Playwright.
 *
 * Uses the stored auth state (from bc-worker auth bootstrap) to
 * download files from BuildingConnected's authenticated portal.
 * Called by the Trigger.dev body-link-intake task.
 */
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { chromium, type Download, type Page } from "playwright";

const STATE_PATH =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH?.trim() ||
  "/app/data/attachments/body-links-auth/state.json";

const PAGE_TIMEOUT_MS = 45_000;
const DOWNLOAD_WAIT_MS = 15_000;
const AUTO_DOWNLOAD_SETTLE_MS = 3000;

/** Selectors to find download buttons on BuildingConnected pages. */
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
      // Selector not found or click failed — try next selector.
    }
  }
  return null;
}

async function downloadFile(
  url: string
): Promise<DownloadResult | DownloadError> {
  const hasState = existsSync(STATE_PATH);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      storageState: hasState ? STATE_PATH : undefined,
      acceptDownloads: true,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Listen for download event from the start (some URLs auto-download on navigation)
    const autoDownloadPromise = page
      .waitForEvent("download", { timeout: PAGE_TIMEOUT_MS })
      .catch(() => null);

    await page.goto(url, {
      timeout: PAGE_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });

    // Wait briefly for auto-download (some BC /goto/ URLs redirect to direct downloads)
    let download = await Promise.race([
      autoDownloadPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), AUTO_DOWNLOAD_SETTLE_MS)
      ),
    ]);

    // If no auto-download, try clicking download buttons
    if (!download) {
      download = await tryClickDownload(page);
    }

    if (!download) {
      const title = await page.title().catch(() => "unknown");
      await context.close();
      return {
        error:
          "No download triggered. Page may require authentication or CAPTCHA.",
        pageTitle: title,
        success: false,
      };
    }

    // Read downloaded file
    const tmpPath = await download.path();
    if (!tmpPath) {
      await context.close();
      return { error: "Download path not available", success: false };
    }

    const filename = download.suggestedFilename();
    const buffer = await readFile(tmpPath);
    await context.close();

    // Clean up temp file
    try {
      await unlink(tmpPath);
    } catch {
      // Non-fatal
    }

    return {
      data: buffer.toString("base64"),
      name: filename,
      size: buffer.byteLength,
      success: true,
    };
  } finally {
    await browser.close();
  }
}

export async function handleBuildingConnectedDownload(
  req: Request
): Promise<Response> {
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
