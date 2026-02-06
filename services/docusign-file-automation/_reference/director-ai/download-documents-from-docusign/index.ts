// Generated script for workflow fefe81cd-cb07-4e86-ade5-34c7e63867a9
// Generated at 2026-01-23T06:51:58.567Z

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
      "Navigating to: https://na3.docusign.net/Signing/EmailStart.aspx?a=88a25daa-458e-42a6-8837-d62b983e6341&etti=24&acct=2cb78a09-2b68-4374-b275-69c64173ef8e&er=722b82f2-7618-40b5-9a8a-9cff2722f513"
    );
    await page.goto(
      "https://na3.docusign.net/Signing/EmailStart.aspx?a=88a25daa-458e-42a6-8837-d62b983e6341&etti=24&acct=2cb78a09-2b68-4374-b275-69c64173ef8e&er=722b82f2-7618-40b5-9a8a-9cff2722f513"
    );

    // Step 2: click the Send New Link button
    console.log("Performing action: click the Send New Link button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/form[1]/div[4]/div[3]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/input[1]",
      description: "click the Send New Link button",
      method: "click",
      arguments: [],
    });

    // Step 3: Navigate to URL
    console.log(
      "Navigating to: https://na3.docusign.net/Signing/EmailStart.aspx?a=fc440cde-39f6-4c07-a18f-f7c367d013d5&etti=24&acct=2cb78a09-2b68-4374-b275-69c64173ef8e&er=722b82f2-7618-40b5-9a8a-9cff2722f513"
    );
    await page.goto(
      "https://na3.docusign.net/Signing/EmailStart.aspx?a=fc440cde-39f6-4c07-a18f-f7c367d013d5&etti=24&acct=2cb78a09-2b68-4374-b275-69c64173ef8e&er=722b82f2-7618-40b5-9a8a-9cff2722f513"
    );

    // Step 4: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 5: click the Other Options dropdown
    console.log("Performing action: click the Other Options dropdown");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[4]/div[2]/div[2]/div[1]/div[1]/div[3]/div[1]/div[2]/div[2]/button[1]",
      description: "click the Other Options dropdown",
      method: "click",
      arguments: [],
    });

    // Step 6: click the Continue button to proceed
    console.log("Performing action: click the Continue button to proceed");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[4]/div[2]/div[2]/div[1]/div[1]/div[3]/div[1]/div[2]/div[2]/button[2]",
      description: "click the Continue button to proceed",
      method: "click",
      arguments: [],
    });

    // Step 7: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 8: click the Combined PDF option
    console.log("Performing action: click the Combined PDF option");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click the Combined PDF option",
      method: "click",
      arguments: [],
    });

    // Step 9: click Combined PDF
    console.log("Performing action: click Combined PDF");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click Combined PDF",
      method: "click",
      arguments: [],
    });

    // Step 10: click the Download button in the panel
    console.log("Performing action: click the Download button in the panel");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[4]/div[1]/div[1]/button[3]",
      description: "click the Download button in the panel",
      method: "click",
      arguments: [],
    });

    // Step 11: click on Combined PDF text
    console.log("Performing action: click on Combined PDF text");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click on Combined PDF text",
      method: "click",
      arguments: [],
    });

    // Step 12: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[4]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 13: Scrolled down sm (25%) in element at coordinates (1100, 150)
    await page.mouse.move(1100, 150);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(500);

    // Step 14: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 15: click Combined PDF option
    console.log("Performing action: click Combined PDF option");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click Combined PDF option",
      method: "click",
      arguments: [],
    });

    // Step 16: Scrolled down sm (25%) in element at coordinates (1130, 150)
    await page.mouse.move(1130, 150);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(500);

    // Step 17: click the download arrow icon
    console.log("Performing action: click the download arrow icon");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the download arrow icon",
      method: "click",
      arguments: [],
    });

    // Step 18: click on Combined PDF text in the download panel
    console.log(
      "Performing action: click on Combined PDF text in the download panel"
    );
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click on Combined PDF text in the download panel",
      method: "click",
      arguments: [],
    });

    // Step 19: Scrolled down sm (25%) in element at coordinates (1100, 150)
    await page.mouse.move(1100, 150);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(500);

    // Step 20: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 21: click Combined PDF
    console.log("Performing action: click Combined PDF");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click Combined PDF",
      method: "click",
      arguments: [],
    });

    // Step 22: Scrolled down sm (25%) in element at coordinates (1100, 200)
    await page.mouse.move(1100, 200);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(500);

    // Step 23: Scrolled up sm (25%) in element at coordinates (1100, 200)
    await page.mouse.move(1100, 200);
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(500);

    // Step 24: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 25: click Combined PDF
    console.log("Performing action: click Combined PDF");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click Combined PDF",
      method: "click",
      arguments: [],
    });

    // Step 26: Scrolled down sm (25%) in element at coordinates (1130, 150)
    await page.mouse.move(1130, 150);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(500);

    // Step 27: click the Download button
    console.log("Performing action: click the Download button");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/button[3]",
      description: "click the Download button",
      method: "click",
      arguments: [],
    });

    // Step 28: click Combined PDF option
    console.log("Performing action: click Combined PDF option");
    await stagehand.act({
      selector:
        "xpath=/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/button[1]",
      description: "click Combined PDF option",
      method: "click",
      arguments: [],
    });

    // Step 29: Scrolled down sm (25%) in element at coordinates (1100, 150)
    await page.mouse.move(1100, 150);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(500);

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
