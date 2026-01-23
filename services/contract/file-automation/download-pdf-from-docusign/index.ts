// Generated script for workflow 09eae4a0-e393-4aa3-a82a-87ee28eae03f
// Generated at 2026-01-23T06:51:33.511Z

import { Stagehand } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config.js";

async function runWorkflow() {
  let stagehand: Stagehand | null = null;

  try {
    // Initialize Stagehand
    console.log("Initializing Stagehand...");
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    console.log("Stagehand initialized successfully.");

    // Get the page instance
    const page = stagehand.context.pages()[0];
    if (!page) {
      throw new Error("Failed to get page instance from Stagehand");
    }

    // Step 1: Navigate to URL
    console.log(
      "Navigating to: https://apps.docusign.com/sign/app?ti=500c5057294547ba9602e024477ab368"
    );
    await page.goto(
      "https://apps.docusign.com/sign/app?ti=500c5057294547ba9602e024477ab368"
    );

    // Step 2: Navigate to URL
    console.log(
      "Navigating to: https://na4.docusign.net/signing/emails/v1-7019b66f680e4df28f4beb02b8d70cc86e73a24086294bcb91c698cbf21dc08e"
    );
    await page.goto(
      "https://na4.docusign.net/signing/emails/v1-7019b66f680e4df28f4beb02b8d70cc86e73a24086294bcb91c698cbf21dc08e"
    );

    // Step 3: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/div[4]/button[1]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 4: click the Combined PDF option
    console.log("Performing action: click the Combined PDF option");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click the Combined PDF option",
      method: "click",
      arguments: [],
    });

    console.log("Workflow completed successfully");
    return { success: true };
  } catch (error) {
    console.error("Workflow failed:", error);
    return { success: false, error };
  } finally {
    // Clean up
    if (stagehand) {
      console.log("Closing Stagehand connection.");
      try {
        await stagehand.close();
      } catch (err) {
        console.error("Error closing Stagehand:", err);
      }
    }
  }
}

// Single execution
runWorkflow().then((result) => {
  console.log("Execution result:", result);
  process.exit(result.success ? 0 : 1);
});

export default runWorkflow;
