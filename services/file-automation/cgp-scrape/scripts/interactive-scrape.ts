/**
 * Interactive Scrape Script
 *
 * Runs the scraper in non-headless mode so you can manually solve
 * any CAPTCHA challenges that appear.
 *
 * Run with: bun run scripts/interactive-scrape.ts
 */

import { writeFileSync } from "node:fs";
import {
    closeBrowser,
    createBrowser,
    navigateToSearchPage,
} from "../src/browser";
import { extractPermitsFromPage, goToNextPage } from "../src/results";
import { fillSearchForm, submitSearchForm } from "../src/search";
import type { PermitRecord, SearchCriteria } from "../src/types";

async function main() {
    console.log("Creating browser (non-headless)...");
    console.log("=".repeat(60));
    console.log("IMPORTANT: If you see a Cloudflare CAPTCHA, solve it manually!");
    console.log("=".repeat(60));

    const instance = await createBrowser({ headless: false });

    try {
        console.log("\n1. Navigating to search page...");
        await navigateToSearchPage(instance);

        // Give time for any initial CAPTCHA
        console.log("   Waiting 5 seconds for page to load...");
        await instance.page.waitForTimeout(5000);

        console.log("\n2. Filling search form...");
        const criteria: SearchCriteria = {
            applicationType: "General Construction",
            county: "Maricopa",
            startDate: "01/01/2025",
        };
        await fillSearchForm(instance.page, criteria);

        console.log("\n3. Submitting search form...");
        console.log("   (You may need to solve a CAPTCHA here)");
        await submitSearchForm(instance.page);

        // Wait for any CAPTCHA to be solved
        console.log("\n4. Waiting for results page...");
        console.log("   Press Enter in this terminal once you see the results...");

        // Wait for user input
        await new Promise<void>((resolve) => {
            process.stdin.resume();
            process.stdin.once("data", () => {
                process.stdin.pause();
                resolve();
            });
        });

        console.log("\n5. Extracting permits...");
        const allPermits: PermitRecord[] = [];
        let pageCount = 0;
        const maxPages = 10;

        let hasMore = true;
        while (hasMore && pageCount < maxPages) {
            pageCount += 1;
            console.log(`   Processing page ${pageCount}...`);

            const result = await extractPermitsFromPage(instance.page);

            if (!result.success) {
                console.error(`   Error: ${result.error}`);
                break;
            }

            console.log(`   Found ${result.permits.length} permits on this page`);
            allPermits.push(...result.permits);

            if (result.hasMore) {
                console.log("   Navigating to next page...");
                const navigated = await goToNextPage(instance.page);
                if (!navigated) {
                    hasMore = false;
                } else {
                    await instance.page.waitForTimeout(2000);
                }
            } else {
                hasMore = false;
            }
        }

        console.log("\n6. Results:");
        console.log(`   Total permits: ${allPermits.length}`);
        console.log(`   Pages scraped: ${pageCount}`);

        if (allPermits.length > 0) {
            // Save results
            const outputFile = "scraped-permits.json";
            writeFileSync(outputFile, JSON.stringify(allPermits, null, 2));
            console.log(`   Saved to ${outputFile}`);

            // Show first few
            console.log("\n   Sample permits:");
            for (const permit of allPermits.slice(0, 5)) {
                console.log(`   - ${permit.azpdesNumber}: ${permit.projectSiteName}`);
            }
        }

        // Save the results page HTML for debugging
        const html = await instance.page.content();
        writeFileSync("results-page.html", html);
        console.log("\n   Saved page HTML to results-page.html");

    } finally {
        console.log("\nClosing browser...");
        await closeBrowser(instance);
        console.log("Done!");
    }
}

main().catch(console.error);
