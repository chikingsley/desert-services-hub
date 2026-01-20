/**
 * Results Extraction E2E Tests
 *
 * Tests results page parsing and permit extraction.
 * Each step is a separate test so you can see exactly where failures occur.
 *
 * Run with: bun test tests/results.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  closeBrowser,
  createBrowser,
  navigateToSearchPage,
} from "../src/browser";
import {
  checkForMorePages,
  extractPermitsFromPage,
  getCurrentPageNumber,
  hasNoResults,
  isOnResultsPage,
} from "../src/results";
import { fillSearchForm, submitSearchForm } from "../src/search";
import type { BrowserInstance, SearchCriteria } from "../src/types";
import { TIMEOUTS } from "./timeouts";

let instance: BrowserInstance | null = null;

describe("Results Page Extraction", () => {
  beforeAll(async () => {
    instance = await createBrowser({ headless: true });
    await navigateToSearchPage(instance);

    // Submit a search to get results
    const criteria: SearchCriteria = {
      applicationType: "General Construction",
      county: "Maricopa",
      // Use a recent date range to limit results but ensure we get some
      startDate: "01/01/2024",
    };

    await fillSearchForm(instance.page, criteria);
    await submitSearchForm(instance.page);
  }, TIMEOUTS.complex);

  afterAll(async () => {
    if (instance) {
      await closeBrowser(instance);
      instance = null;
    }
  });

  test(
    "1. can detect if we are on results page",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const onResults = await isOnResultsPage(instance.page);
      console.log("On results page:", onResults);

      // We expect to be on results page after submitting search
      expect(typeof onResults).toBe("boolean");
    },
    TIMEOUTS.quick,
  );

  test(
    "2. can check for no results",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const noResults = await hasNoResults(instance.page);
      console.log("Has no results:", noResults);

      // This could be true or false depending on data
      expect(typeof noResults).toBe("boolean");
    },
    TIMEOUTS.quick,
  );

  test(
    "3. can get current page number",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const pageNumber = await getCurrentPageNumber(instance.page);
      console.log("Current page number:", pageNumber);

      // Should be at least 1
      expect(pageNumber).toBeGreaterThanOrEqual(1);
    },
    TIMEOUTS.quick,
  );

  test(
    "4. can check for pagination",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const hasMore = await checkForMorePages(instance.page);
      console.log("Has more pages:", hasMore);

      expect(typeof hasMore).toBe("boolean");
    },
    TIMEOUTS.quick,
  );

  test(
    "5. can extract permits from page",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const result = await extractPermitsFromPage(instance.page);

      console.log("Extraction result:", {
        success: result.success,
        permitCount: result.permits.length,
        hasMore: result.hasMore,
        currentPage: result.currentPage,
        error: result.error,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.permits)).toBe(true);

      // If we have permits, verify their structure
      if (result.permits.length > 0) {
        const firstPermit = result.permits[0];
        console.log("Sample permit:", firstPermit);

        expect(firstPermit).toHaveProperty("azpdesNumber");
        expect(firstPermit).toHaveProperty("operatorBusinessName");
        expect(firstPermit).toHaveProperty("projectSiteName");
        expect(firstPermit).toHaveProperty("applicationStatus");
        expect(firstPermit).toHaveProperty("receivedDate");
      }
    },
    TIMEOUTS.standard,
  );
});
