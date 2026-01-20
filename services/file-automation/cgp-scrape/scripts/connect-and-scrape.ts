/**
 * Connect to Existing Browser
 *
 * This script connects to an existing Chrome browser (that you've already
 * opened and solved the CAPTCHA in) and scrapes the results.
 *
 * STEP 1: Launch Chrome with remote debugging:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 * STEP 2: In that Chrome browser:
 *   - Navigate to: https://legacy.azdeq.gov/databases/azpdessearch_drupal.html
 *   - Fill in: General Construction + Maricopa + start date
 *   - Submit the form
 *   - Solve the CAPTCHA if it appears
 *   - Once you see results, come back here
 *
 * STEP 3: Run this script:
 *   bun run scripts/connect-and-scrape.ts
 */

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { extractPermitsFromPage, goToNextPage } from "../src/results";
import type { PermitRecord } from "../src/types";

const CDP_URL = "http://127.0.0.1:9222";

async function main() {
    console.log("Connecting to Chrome at", CDP_URL);
    console.log("=".repeat(60));

    try {
        // Connect to existing browser via CDP
        const browser = await chromium.connectOverCDP(CDP_URL);
        console.log("✓ Connected to browser");

        // Get existing contexts and pages
        const contexts = browser.contexts();
        console.log(`  Found ${contexts.length} context(s)`);

        if (contexts.length === 0) {
            console.error("No browser contexts found!");
            return;
        }

        // Get the first context's pages
        const pages = contexts[0].pages();
        console.log(`  Found ${pages.length} page(s)`);

        if (pages.length === 0) {
            console.error("No pages found!");
            return;
        }

        // Find a page that looks like results (or use the first one)
        let targetPage = pages[0];
        for (const page of pages) {
            const url = page.url();
            console.log(`  - Page: ${url}`);
            if (url.includes("azpdes")) {
                targetPage = page;
            }
        }

        console.log(`\nUsing page: ${targetPage.url()}`);
        console.log("=".repeat(60));

        // Save the current page HTML first
        console.log("\n1. Saving current page HTML...");
        const html = await targetPage.content();
        writeFileSync("connected-page.html", html);
        console.log("   Saved to connected-page.html");

        // Take a screenshot
        console.log("\n2. Taking screenshot...");
        await targetPage.screenshot({ path: "connected-page.png", fullPage: true });
        console.log("   Saved to connected-page.png");

        // Check if this looks like a results page
        const pageContent = html.toLowerCase();
        const hasCloudflare = pageContent.includes("cloudflare") || pageContent.includes("verify you are human");
        const hasTable = pageContent.includes("<table");

        if (hasCloudflare) {
            console.log("\n⚠️  Page appears to be a Cloudflare challenge page!");
            console.log("   Please solve the CAPTCHA in Chrome and run this script again.");
            return;
        }

        if (!hasTable) {
            console.log("\n⚠️  No table found on page - may not be results page");
            console.log("   Check connected-page.html to see what we got");
            return;
        }

        console.log("\n3. Extracting permits...");
        const allPermits: PermitRecord[] = [];
        let pageCount = 0;
        const maxPages = 10;

        let hasMore = true;
        while (hasMore && pageCount < maxPages) {
            pageCount += 1;
            console.log(`   Processing page ${pageCount}...`);

            const result = await extractPermitsFromPage(targetPage);

            if (!result.success) {
                console.error(`   Error: ${result.error}`);
                break;
            }

            console.log(`   Found ${result.permits.length} permits on this page`);
            allPermits.push(...result.permits);

            if (result.hasMore) {
                console.log("   Navigating to next page...");
                const navigated = await goToNextPage(targetPage);
                if (!navigated) {
                    hasMore = false;
                } else {
                    await targetPage.waitForTimeout(2000);
                }
            } else {
                hasMore = false;
            }
        }

        console.log("\n4. Results:");
        console.log(`   Total permits: ${allPermits.length}`);
        console.log(`   Pages scraped: ${pageCount}`);

        if (allPermits.length > 0) {
            const outputFile = "scraped-permits.json";
            writeFileSync(outputFile, JSON.stringify(allPermits, null, 2));
            console.log(`   Saved to ${outputFile}`);

            console.log("\n   Sample permits:");
            for (const permit of allPermits.slice(0, 5)) {
                console.log(`   - ${permit.azpdesNumber}: ${permit.projectSiteName}`);
            }
        } else {
            console.log("\n   No permits extracted. Check connected-page.html to debug.");
        }

        // Don't close the browser - user is still using it
        console.log("\nDone! (Browser left open)");

    } catch (error) {
        if (String(error).includes("ECONNREFUSED")) {
            console.error("\n❌ Could not connect to Chrome!");
            console.error("\nMake sure you started Chrome with remote debugging:");
            console.error("");
            console.error("  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222");
            console.error("");
        } else {
            console.error("Error:", error);
        }
    }
}

main();
