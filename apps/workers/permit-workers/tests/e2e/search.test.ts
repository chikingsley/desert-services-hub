/**
 * Search Integration Tests
 *
 * Run with: bun test tests/e2e/search.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { selectFiltersAndSubmit } from "@/portal/scrape";
import { searchPermits } from "@/portal/utils/search";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

// Test configuration - use real permit IDs from the database
const TEST_PERMIT_ID = "D0055285"; // Active permit: Go99 Offsites - North and South
const TEST_COMPANY_NAME = "Chasse Building Team Inc"; // Full company name for autocomplete match
const TEST_PROJECT_NAME_PARTIAL = "Battery"; // Partial project name for wildcard search
const NONEXISTENT_PERMIT_ID = "D9999999"; // High number that doesn't exist

const harness = new PortalHarness();

describe("Portal Search", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and navigate to search",
    async () => {
      await harness.setupForSearch();
      expect(harness.currentState).toBe("dust_search");

      // Set filter to show all statuses for testing
      await selectFiltersAndSubmit(harness.page, [
        "Active",
        "Closed",
        "Submitted",
        "Rejected",
      ]);
    },
    TIMEOUTS.complex
  );

  describe("searchPermits", () => {
    test("returns error when no criteria provided", async () => {
      const result = await searchPermits(harness.page, {});

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toBe("No search criteria provided");
      expect(result.permitIds).toEqual([]);
    });

    test(
      "finds permit by exact ID",
      async () => {
        const result = await searchPermits(harness.page, {
          permitId: TEST_PERMIT_ID,
        });

        expect(result.success).toBe(true);
        expect(result.count).toBeGreaterThanOrEqual(1);
        expect(result.permitIds).toContain(TEST_PERMIT_ID);
      },
      TIMEOUTS.standard
    );

    test(
      "returns not found for invalid permit ID",
      async () => {
        const result = await searchPermits(harness.page, {
          permitId: NONEXISTENT_PERMIT_ID,
        });

        expect(result.success).toBe(false);
        expect(result.count).toBe(0);
        expect(result.error).toBe("Permit not found");
      },
      TIMEOUTS.standard
    );

    test(
      "finds permits by project name (wildcard)",
      async () => {
        const result = await searchPermits(harness.page, {
          projectName: TEST_PROJECT_NAME_PARTIAL,
        });

        expect(result.success).toBe(true);
        expect(result.count).toBeGreaterThanOrEqual(1);
        expect(result.permitIds.length).toBeGreaterThanOrEqual(1);
      },
      TIMEOUTS.standard
    );

    test(
      "finds permits by company name (autocomplete)",
      async () => {
        const result = await searchPermits(harness.page, {
          companyName: TEST_COMPANY_NAME,
        });

        expect(result.success).toBe(true);
        expect(result.count).toBeGreaterThanOrEqual(1);
        expect(result.permitIds.length).toBeGreaterThanOrEqual(1);
      },
      TIMEOUTS.standard
    );
  });
});
