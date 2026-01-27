/**
 * DocuSign Document Downloader
 *
 * Downloads completed documents from DocuSign using Playwright.
 * Uses proper download event handling for headless mode.
 *
 * Handles:
 * - Expired link detection and "Send New Link" flow
 * - Consent/disclosure modals (checkbox + continue)
 * - AI summarize popup dismissal
 * - Proper download event capture (like auto-permit)
 *
 * Based on analysis of:
 * - Director AI reference scripts (flow patterns)
 * - Saved HTML (stable data-qa selectors)
 * - auto-permit project (download event handling)
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, chromium, type Page } from "playwright";

// DocuSign selectors (from saved HTML analysis - stable data-qa attributes)
const SELECTORS = {
  // Expired link page
  expiredMessage: 'text="This link from your email has expired"',
  sendNewLinkButton:
    'button:has-text("Send New Link"), input[value="Send New Link"]',
  linkSentMessage: 'text="Your New Link Has Been Sent"',

  // Consent/disclosure modal
  consentCheckbox: 'input[type="checkbox"]',
  otherOptionsButton: 'button:has-text("Other Options")',
  continueButton: 'button:has-text("Continue")',

  // AI summarize popup
  aiPanelClose: '[data-qa="tools-callout-panel-close-button"]',

  // Download controls (stable data-qa selectors)
  downloadButton: '[data-qa="toolbar-download-button"]',
  combinedPdfLink: '[data-qa="toolbar-download-combined-link"]',
  separatePdfsLink: '[data-qa="toolbar-download-separate-link"]',

  // Fallback selectors (for older DocuSign versions)
  downloadButtonFallback: 'button:has-text("Download")',
  combinedPdfFallback:
    'button:has-text("Combined PDF"), [role="menuitem"]:has-text("Combined PDF")',

  // Print (alternative - opens PDF in new tab)
  printButton: '[data-qa="toolbar-print-button"]',
} as const;

export interface DownloadOptions {
  url: string;
  outputDir?: string;
  headless?: boolean;
  timeout?: number;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  linkExpired?: boolean;
  newLinkSent?: boolean;
}

/**
 * Download a DocuSign document as Combined PDF.
 */
export async function downloadDocuSignDocument(
  options: DownloadOptions
): Promise<DownloadResult> {
  const {
    url,
    outputDir = tmpdir(),
    headless = true,
    timeout = 60_000,
  } = options;

  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-popup-blocking",
      "--disable-blink-features=AutomationControlled",
      ...(headless
        ? ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        : []),
    ],
  });

  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true, // Critical for download handling
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    console.log("[DocuSign] Opening URL...");
    await page.goto(url, { waitUntil: "networkidle" });

    // Check for expired link
    const expiredResult = await handleExpiredLink(page);
    if (expiredResult.expired) {
      if (expiredResult.newLinkSent) {
        return {
          success: false,
          linkExpired: true,
          newLinkSent: true,
          error: "Link expired. A new link has been sent to your email.",
        };
      }
      return {
        success: false,
        linkExpired: true,
        error: "Link expired and could not send new link.",
      };
    }

    // Handle consent modal if present
    await handleConsentModal(page);

    // Close AI summarize popup if present
    await closeAiPopup(page);

    // Click download and wait for file
    const filePath = await triggerDownload(page, outputDir);

    console.log(`[DocuSign] Downloaded: ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[DocuSign] Error: ${message}`);

    // Save debug screenshot
    if (context) {
      try {
        const pages = context.pages();
        if (pages.length > 0) {
          const debugPath = join(tmpdir(), `docusign-error-${Date.now()}.png`);
          await pages[0].screenshot({ path: debugPath, fullPage: true });
          console.error(`[DocuSign] Debug screenshot: ${debugPath}`);
        }
      } catch {
        // Ignore screenshot errors
      }
    }

    return { success: false, error: message };
  } finally {
    await browser.close();
  }
}

/**
 * Handle expired link - detect and optionally send new link.
 */
async function handleExpiredLink(
  page: Page
): Promise<{ expired: boolean; newLinkSent?: boolean }> {
  try {
    // Check for expired message
    const expiredVisible = await page
      .locator(SELECTORS.expiredMessage)
      .isVisible({ timeout: 3000 });

    if (!expiredVisible) {
      return { expired: false };
    }

    console.log("[DocuSign] Link expired, attempting to send new link...");

    // Try to click "Send New Link" button
    const sendButton = page.locator(SELECTORS.sendNewLinkButton);
    const sendButtonVisible = await sendButton.isVisible({ timeout: 2000 });

    if (sendButtonVisible) {
      await sendButton.click();
      await page.waitForTimeout(2000);

      // Check if new link was sent
      const sentMessage = await page
        .locator(SELECTORS.linkSentMessage)
        .isVisible({ timeout: 5000 });

      if (sentMessage) {
        console.log("[DocuSign] New link sent successfully");
        return { expired: true, newLinkSent: true };
      }
    }

    return { expired: true, newLinkSent: false };
  } catch {
    return { expired: false };
  }
}

/**
 * Handle the electronic records consent modal.
 * Pattern from Director AI reference: "Other Options" → "Continue"
 * or direct checkbox → "Continue"
 */
async function handleConsentModal(page: Page): Promise<void> {
  try {
    // Check if consent checkbox exists
    const checkbox = page.locator(SELECTORS.consentCheckbox);
    const isVisible = await checkbox.isVisible({ timeout: 3000 });

    if (isVisible) {
      console.log("[DocuSign] Accepting consent...");

      // Click checkbox via JavaScript (more reliable for custom checkboxes)
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el && !el.checked) {
          el.click();
        }
      }, SELECTORS.consentCheckbox);

      await page.waitForTimeout(500);

      // Try "Continue" button first
      const continueBtn = page.locator(SELECTORS.continueButton);
      if (await continueBtn.isVisible({ timeout: 1000 })) {
        await continueBtn.click();
        await page.waitForTimeout(1000);
        console.log("[DocuSign] Consent accepted via Continue");
        return;
      }

      // Fallback: "Other Options" → "Continue" pattern (from reference script)
      const otherOptions = page.locator(SELECTORS.otherOptionsButton);
      if (await otherOptions.isVisible({ timeout: 1000 })) {
        console.log("[DocuSign] Using Other Options flow...");
        await otherOptions.click();
        await page.waitForTimeout(500);

        // Now click Continue
        await page.click(SELECTORS.continueButton);
        await page.waitForTimeout(1000);
        console.log("[DocuSign] Consent accepted via Other Options");
      }
    }
  } catch {
    // No consent modal, continue
  }
}

/**
 * Close the AI summarize popup if present.
 */
async function closeAiPopup(page: Page): Promise<void> {
  try {
    const closeBtn = page.locator(SELECTORS.aiPanelClose);
    const isVisible = await closeBtn.isVisible({ timeout: 2000 });

    if (isVisible) {
      console.log("[DocuSign] Closing AI popup...");
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // No AI popup, continue
  }
}

/**
 * Trigger download and capture the file.
 * Uses page.waitForEvent("download") pattern from auto-permit for proper download handling.
 */
async function triggerDownload(page: Page, outputDir: string): Promise<string> {
  // Try primary selector, then fallback
  let downloadButton = page.locator(SELECTORS.downloadButton);
  let buttonVisible = await downloadButton
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!buttonVisible) {
    console.log(
      "[DocuSign] Primary download button not found, trying fallback..."
    );
    downloadButton = page.locator(SELECTORS.downloadButtonFallback);
    buttonVisible = await downloadButton
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
  }

  if (!buttonVisible) {
    throw new Error("Download button not found on page");
  }

  console.log("[DocuSign] Clicking download...");
  await downloadButton.click();
  await page.waitForTimeout(500);

  // Try primary Combined PDF selector, then fallback
  let combinedPdf = page.locator(SELECTORS.combinedPdfLink);
  let combinedVisible = await combinedPdf
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (!combinedVisible) {
    console.log(
      "[DocuSign] Primary Combined PDF not found, trying fallback..."
    );
    combinedPdf = page.locator(SELECTORS.combinedPdfFallback);
    combinedVisible = await combinedPdf
      .isVisible({ timeout: 5000 })
      .catch(() => false);
  }

  if (!combinedVisible) {
    throw new Error("Combined PDF option not found in download menu");
  }

  // Set up download listener BEFORE clicking (critical for headless)
  console.log("[DocuSign] Setting up download listener...");
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

  console.log("[DocuSign] Selecting Combined PDF...");
  await combinedPdf.click();

  // Wait for download to complete
  console.log("[DocuSign] Waiting for download...");
  const download = await downloadPromise;

  // Generate output filename
  const suggestedName = download.suggestedFilename() || "document.pdf";
  const outputPath = join(outputDir, `docusign-${Date.now()}-${suggestedName}`);

  // Save the file
  await download.saveAs(outputPath);
  console.log("[DocuSign] File saved successfully");

  return outputPath;
}

// CLI support
if (import.meta.main) {
  const url = process.argv[2];
  const outputDir = process.argv[3] || tmpdir();

  if (!url) {
    console.error("Usage: bun download.ts <docusign-url> [output-dir]");
    process.exit(1);
  }

  const result = await downloadDocuSignDocument({
    url,
    outputDir,
    headless: process.env.HEADLESS !== "false",
  });

  if (result.success) {
    console.log(`\n✓ Downloaded: ${result.filePath}`);
  } else {
    console.error(`\n✗ Failed: ${result.error}`);
    process.exit(1);
  }
}
