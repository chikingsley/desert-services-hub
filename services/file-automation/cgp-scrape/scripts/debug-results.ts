/**
 * Debug Script - Save Results Page HTML
 *
 * Run this to capture the actual results page HTML for refining selectors.
 *
 * Run with: bun run scripts/debug-results.ts
 */

import { writeFileSync } from "node:fs";
import {
    closeBrowser,
    createBrowser,
    navigateToSearchPage,
} from "../src/browser";
import { fillSearchForm, submitSearchForm } from "../src/search";
import type { SearchCriteria } from "../src/types";

async function main() {
    console.log("Creating browser...");
    const instance = await createBrowser({ headless: true });

    try {
        console.log("Navigating to search page...");
        await navigateToSearchPage(instance);

        console.log("Filling search form...");
        const criteria: SearchCriteria = {
            applicationType: "General Construction",
            county: "Maricopa",
            // Use a very recent start date to limit results
            startDate: "01/01/2025",
        };
        await fillSearchForm(instance.page, criteria);

        console.log("Submitting search form...");
        await submitSearchForm(instance.page);

        // Wait a bit more for full page render
        await instance.page.waitForTimeout(2000);

        console.log("Saving page HTML...");
        const html = await instance.page.content();
        writeFileSync("debug-results.html", html);
        console.log("Saved to debug-results.html");

        // Also take a screenshot
        await instance.page.screenshot({ path: "debug-results.png", fullPage: true });
        console.log("Screenshot saved to debug-results.png");

        // Print the page URL
        console.log("Current URL:", instance.page.url());

    } finally {
        await closeBrowser(instance);
        console.log("Done!");
    }
}

main().catch(console.error);
