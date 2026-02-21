/**
 * PDF Generation E2E Tests
 *
 * Tests PDF generation for permit pages:
 * - Full-page PDF generation
 * - Page 2 map section PDF extraction
 *
 * Run with: bun test tests/e2e/pdf.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { generatePartBPdf, generatePermitPdf } from "@/portal/pdf";
import { selectFiltersAndSubmit } from "@/portal/scrape";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

// Test permit ID - use D0056297 as requested, or fallback to a known test permit
const TEST_PERMIT_ID = process.env.PDF_TEST_PERMIT_ID || "D0056297";

// Output directory for test PDFs
const OUTPUT_DIR = join(process.cwd(), "tests", "output", "pdfs");

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

describe("PDF Generation", () => {
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
    },
    TIMEOUTS.complex
  );

  test(
    "2. generate full-page PDF for permit",
    async () => {
      const outputPath = join(OUTPUT_DIR, `${TEST_PERMIT_ID}-full.pdf`);

      // Clean up any existing file
      if (existsSync(outputPath)) {
        await unlink(outputPath);
      }

      const result = await generatePermitPdf(
        harness.page,
        TEST_PERMIT_ID,
        outputPath
      );

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(result.error).toBeUndefined();

      // Verify file was created
      expect(existsSync(outputPath)).toBe(true);
      console.log(`  ✓ Full-page PDF created: ${outputPath}`);
    },
    TIMEOUTS.complex
  );

  test(
    "3. generate Part B PDF section",
    async () => {
      // First, ensure we're on the permit detail page
      // Re-open the permit if needed
      await harness.navigateToSearch();
      await selectFiltersAndSubmit(harness.page, [
        "Active",
        "Closed",
        "Submitted",
        "Rejected",
      ]);

      const { searchAndOpenPermit } = await import("@/portal/close");
      const opened = await searchAndOpenPermit(harness.page, TEST_PERMIT_ID);
      expect(opened).toBe(true);

      const outputPath = join(OUTPUT_DIR, `${TEST_PERMIT_ID}-partb.pdf`);

      // Clean up any existing file
      if (existsSync(outputPath)) {
        await unlink(outputPath);
      }

      const result = await generatePartBPdf(harness.page, outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(result.error).toBeUndefined();

      // Verify file was created
      expect(existsSync(outputPath)).toBe(true);
      console.log(`  ✓ Part B PDF created: ${outputPath}`);
    },
    TIMEOUTS.complex
  );

  test(
    "4. handle non-existent permit gracefully",
    async () => {
      // Navigate back to search page (we might be on detail page from previous test)
      await harness.navigateToSearch();
      await selectFiltersAndSubmit(harness.page, [
        "Active",
        "Closed",
        "Submitted",
        "Rejected",
      ]);

      const outputPath = join(OUTPUT_DIR, "nonexistent-permit.pdf");

      const result = await generatePermitPdf(
        harness.page,
        "D9999999",
        outputPath
      );

      expect(result.success).toBe(false);
      // Error could be "not found" or "Search failed" if search field isn't available
      expect(result.error).toBeDefined();
      expect(result.path).toBeUndefined();

      // Verify file was NOT created
      expect(existsSync(outputPath)).toBe(false);
    },
    TIMEOUTS.complex
  );
});
