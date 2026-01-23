/**
 * DocuSign browser automation script
 * Downloads completed documents from DocuSign signing pages.
 *
 * @see https://docs.stagehand.dev/v3/basics/act
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { config } from "./config";

/**
 * Download a DocuSign document from a signing URL
 * @param signingUrl - The DocuSign signing/emails URL
 */
async function downloadDocuSignDocument(signingUrl: string): Promise<void> {
  const stagehand = new Stagehand({
    env: "LOCAL",
    modelName: "google/gemini-2.5-flash",
    modelClientOptions: {
      apiKey: config.geminiApiKey,
    },
    localBrowserLaunchOptions: {
      headless: config.headless,
      viewport: { width: 1280, height: 900 },
      downloadsPath: config.downloadDir,
      args: [
        `--user-data-dir=${config.browserProfileDir}`,
        "--disable-blink-features=AutomationControlled",
      ],
    },
  });

  try {
    await stagehand.init();
    const page = stagehand.page;

    // Navigate to the DocuSign signing page
    console.log(`Navigating to: ${signingUrl}`);
    await page.goto(signingUrl);

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Click the Download button using natural language
    console.log("Clicking the Download button...");
    const downloadResult = await stagehand.act("click the Download button");

    if (!downloadResult.success) {
      throw new Error(`Failed to click Download: ${downloadResult.message}`);
    }

    // Wait for download menu to appear
    await page.waitForTimeout(500);

    // Click the Combined PDF option
    console.log("Selecting Combined PDF option...");
    const pdfResult = await stagehand.act(
      "click the Combined PDF download option"
    );

    if (!pdfResult.success) {
      throw new Error(`Failed to select Combined PDF: ${pdfResult.message}`);
    }

    // Wait for download to start
    await page.waitForTimeout(2000);

    console.log(`Download initiated. Files saved to: ${config.downloadDir}`);
  } finally {
    await stagehand.close();
  }
}

// Main execution
const url = process.argv[2];

if (!url) {
  console.error("Usage: bun docusign/code.ts <docusign-signing-url>");
  console.error(
    "Example: bun docusign/code.ts https://na4.docusign.net/signing/emails/v1-..."
  );
  process.exit(1);
}

await downloadDocuSignDocument(url);
