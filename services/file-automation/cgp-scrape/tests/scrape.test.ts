/**
 * Full Scrape Flow E2E Tests
 *
 * Tests the complete scrape workflow end-to-end.
 * Each step is a separate test so you can see exactly where failures occur.
 *
 * Run with: bun test tests/scrape.test.ts
 */

import { describe, expect, test } from "bun:test";
import { scrape, scrapeMaricopaGeneral } from "../src/scrape";
import type { SearchCriteria } from "../src/types";
import { TIMEOUTS } from "./timeouts";

describe("Full Scrape Flow", () => {
  test(
    "1. can run basic scrape with minimal criteria",
    async () => {
      const criteria: SearchCriteria = {
        applicationType: "General Construction",
        county: "Maricopa",
        // Limit to recent dates to keep results manageable
        startDate: "01/01/2025",
      };

      const result = await scrape(criteria, {
        headless: true,
        maxPages: 2, // Limit pages for testing
      });

      console.log("Scrape result:", {
        success: result.success,
        totalCount: result.totalCount,
        pageCount: result.pageCount,
        errorCount: result.errors.length,
        errors: result.errors,
      });

      expect(result.success).toBe(true);
      expect(result.pageCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.permits)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    },
    TIMEOUTS.extended,
  );

  test(
    "2. convenience function scrapeMaricopaGeneral works",
    async () => {
      const result = await scrapeMaricopaGeneral({
        headless: true,
        maxPages: 1,
        startDate: "01/01/2025",
      });

      console.log("Maricopa General scrape result:", {
        success: result.success,
        totalCount: result.totalCount,
        pageCount: result.pageCount,
      });

      expect(result.success).toBe(true);
      expect(result.pageCount).toBeGreaterThanOrEqual(0);
    },
    TIMEOUTS.extended,
  );

  test(
    "3. handles no results gracefully",
    async () => {
      // Use a very specific search that should return no results
      const criteria: SearchCriteria = {
        azpdesNumber: "DEFINITELY_NOT_A_REAL_PERMIT_NUMBER_12345",
      };

      const result = await scrape(criteria, {
        headless: true,
        maxPages: 1,
      });

      console.log("No results scrape:", {
        success: result.success,
        totalCount: result.totalCount,
      });

      // Should succeed but with 0 permits
      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(0);
      expect(result.permits.length).toBe(0);
    },
    TIMEOUTS.complex,
  );
});
