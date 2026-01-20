/**
 *  DocuSign browser automation script
 *  @see https://docs.stagehand.dev/v3/first-steps/introduction
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { config } from "./config";

const stagehand = new Stagehand({
  env: "LOCAL",
  model: {
    modelName: "google/gemini-3-flash-preview",
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

await stagehand.init();
const page = stagehand.context.pages()[0];

// Step 1: Navigate to URL
console.log(
  "Navigating to: https://na4.docusign.net/signing/emails/v1-7019b66f680e4df28f4beb02b8d70cc86e73a24086294bcb91c698cbf21dc08e"
);
await page?.goto(
  "https://na4.docusign.net/signing/emails/v1-7019b66f680e4df28f4beb02b8d70cc86e73a24086294bcb91c698cbf21dc08e"
);

// Step 2: Perform action
console.log("Performing action: click the Download button");
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/div[4]/button[1]",
  description: "click the Download button",
  method: "click",
  arguments: [],
});

// Step 3: Perform action
console.log("Performing action: click the Combined PDF option");
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
  description: "click the Combined PDF option",
  method: "click",
  arguments: [],
});

// Cleanup
await stagehand.close();
