/**
 * Scrape E2E Tests
 *
 * Tests the complete scrape flow with step-by-step visibility.
 * Each step is a separate test so you can see exactly where failures occur.
 *
 * Run with: bun test tests/e2e/scrape.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import {
  deleteRecentPermits,
  permitExists,
  upsertPermit,
} from "@dust-permits/db/dust-permit";
import type { PermitData } from "@/portal/scrape";
import { runScrapeFlow } from "@/portal/scrape";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

const TARGET_COUNT = 3;

describe("Scrape Flow", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login",
    async () => {
      await deleteRecentPermits(TARGET_COUNT);
      await harness.setup();
      expect(harness.currentState).toBe("logged_in");
    },
    TIMEOUTS.standard
  );

  test(
    "2. navigate to dust apps",
    async () => {
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);
      expect(harness.currentState).toBe("dust_apps");
    },
    TIMEOUTS.quick
  );

  test(
    "3. navigate to search",
    async () => {
      const success = await harness.navigateToSearch();
      expect(success).toBe(true);
      expect(harness.currentState).toBe("dust_search");
    },
    TIMEOUTS.quick
  );

  test(
    "4. scrape new applications",
    async () => {
      const result = await runScrapeFlow(harness.page, {
        existsInDb: (id: string) => permitExists(id),
        saveToDb: (data: PermitData) =>
          upsertPermit({
            id: data.applicationId,
            projectName: data.projectName,
            companyName: data.companyName,
            status: data.status,
            address: data.locations[0]?.address ?? null,
            city: null,
            parcel: null,
            portalCompanyId: null,
            submittedDate: null,
            effectiveDate: null,
            expirationDate: null,
            closedDate: null,
            previousAppId: null,
            projectStartDate: null,
            projectEndDate: null,
            isBlockPermit: false,
            isAccelerated: false,
          }),
        statuses: ["Active", "Submitted"],
        targetCount: TARGET_COUNT,
      });

      expect(result.success).toBe(true);
      expect(result.scraped.length).toBe(TARGET_COUNT);
      expect(result.errors.length).toBe(0);
    },
    TIMEOUTS.extended
  );
});
