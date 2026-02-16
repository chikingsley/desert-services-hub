/**
 * Scrape + PDF E2E Tests
 *
 * Tests scraping permit data and generating PDFs via the API handlers.
 *
 * Run with: bun test tests/e2e/scrape-pdf.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { extractPermitData, selectFiltersAndSubmit } from "@/portal/scrape";
import {
  clickDustApplicationLinkById,
  waitForDustApplicationDetailPage,
} from "@/portal/utils/helpers";
import { searchPermits } from "@/portal/utils/search";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

// Test permit ID - use D0056297 as default, or set via environment
const TEST_PERMIT_ID = process.env.SCRAPE_TEST_PERMIT_ID || "D0056297";

// Output directory for test PDFs
const OUTPUT_DIR = join(process.cwd(), "tests", "output", "pdfs");

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

describe("Scrape + PDF Flow", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. setup: login and navigate to search",
    async () => {
      await harness.setup();
      await harness.navigateToDustApps();
      await harness.navigateToSearch();

      // Set filter to show all statuses
      await selectFiltersAndSubmit(harness.page, [
        "Active",
        "Closed",
        "Submitted",
        "Rejected",
      ]);

      expect(harness.currentState).toBe("dust_search");
    },
    TIMEOUTS.complex
  );

  test(
    "2. search and open permit",
    async () => {
      const searchResult = await searchPermits(harness.page, {
        permitId: TEST_PERMIT_ID,
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.permitIds).toContain(TEST_PERMIT_ID);

      // Click to open detail page
      const clicked = await clickDustApplicationLinkById(
        harness.page,
        TEST_PERMIT_ID
      );
      expect(clicked).toBe(true);

      // Wait for detail page
      const loaded = await waitForDustApplicationDetailPage(harness.page, {
        midwayFallbackAppNum: TEST_PERMIT_ID,
        timeout: 30_000,
      });
      expect(loaded).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "3. extract permit data",
    async () => {
      const data = await extractPermitData(harness.page);

      expect(data.applicationId).toBe(TEST_PERMIT_ID);
      expect(data.projectName).toBeTruthy();
      expect(data.companyName).toBeTruthy();
      expect(data.status).toBeTruthy();

      console.log(`  ✓ Extracted: ${data.projectName}`);
      console.log(`  ✓ Company: ${data.companyName}`);
      console.log(`  ✓ Status: ${data.status}`);
      console.log(`  ✓ Disturbed Area: ${data.disturbedArea}`);
    },
    TIMEOUTS.complex
  );

  test(
    "4. generate PDF",
    async () => {
      const outputPath = join(OUTPUT_DIR, `${TEST_PERMIT_ID}-scrape.pdf`);

      // Clean up any existing file
      if (existsSync(outputPath)) {
        await unlink(outputPath);
      }

      // Generate PDF directly using page.pdf()
      await harness.page.pdf({
        format: "A4",
        margin: {
          top: "0.5in",
          bottom: "0.5in",
          left: "0.5in",
          right: "0.5in",
        },
        path: outputPath,
        printBackground: true,
      });

      // Verify file was created
      expect(existsSync(outputPath)).toBe(true);
      console.log(`  ✓ PDF created: ${outputPath}`);
    },
    TIMEOUTS.complex
  );

  test(
    "5. handle non-existent permit gracefully",
    async () => {
      // Navigate back to search page
      await harness.navigateToSearch();
      await selectFiltersAndSubmit(harness.page, [
        "Active",
        "Closed",
        "Submitted",
        "Rejected",
      ]);

      const searchResult = await searchPermits(harness.page, {
        permitId: "D9999999",
      });

      // Search should succeed but not find the permit
      expect(searchResult.permitIds).not.toContain("D9999999");
    },
    TIMEOUTS.complex
  );
});
