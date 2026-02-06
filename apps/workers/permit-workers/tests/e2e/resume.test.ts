/**
 * Resume Flow E2E Tests
 *
 * Tests the resume flow: human handles Page 2 (map/location),
 * automation takes over for Pages 3-5.
 *
 * The test simulates the human part by drawing a polygon on the map
 * using coordinates from the FeatureServer API, then verifies the
 * resume flow can read the acreage and complete the remaining pages.
 *
 * Run with: bun test tests/e2e/resume.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { buildFormData } from "@/form-data";
import {
  type PermitMapData,
  queryPermitMapFeatures,
} from "@/lib/dust-features";
import {
  createExistingCompanyApplication,
  getCurrentPage,
  goToPage,
} from "@/portal/create";
import { fillPage2WithMapData } from "@/portal/create/fill/page2/page2";
import { fillPostK } from "@/portal/create/fill/page4/category-post-k";
import { deleteByApplicationId } from "@/portal/delete";
import { fillPage3, navigateToPage, readDisturbedAcres } from "@/portal/resume";
import { clickNext } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER ?? "";
const COMPANY_NAME = "Sundt Construction Inc";

const describeSuite = COPY_FROM_APP ? describe : describe.skip;

let createdAppId: string | null = null;
let mapData: PermitMapData | null = null;
let disturbedAcres: number | null = null;

describeSuite("Resume Flow", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and navigate to dust apps",
    async () => {
      await harness.setup();
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "2. query map data from FeatureServer",
    async () => {
      // Public REST API - no portal session needed
      mapData = await queryPermitMapFeatures(COPY_FROM_APP);
      expect(mapData.disturbedArea).not.toBeNull();
      console.log(
        `  Polygon: ${mapData.disturbedArea?.latLngCoordinates.length} vertices`
      );
      console.log(`  Access points: ${mapData.accessPoints.length}`);
    },
    TIMEOUTS.quick
  );

  test(
    "3. create app and simulate human Page 2 (draw map)",
    async () => {
      const { page, context } = harness;

      // Create existing company app (copies form structure from source)
      const result = await createExistingCompanyApplication(
        page,
        context,
        COMPANY_NAME,
        COPY_FROM_APP
      );
      expect(result.success).toBe(true);
      expect(result.applicationId).not.toBeNull();
      createdAppId = result.applicationId;
      console.log(`  Created: ${createdAppId}`);

      // Navigate to Page 2
      const { success } = await goToPage(page, 2);
      expect(success).toBe(true);
      expect(await getCurrentPage(page)).toBe(2);

      // Draw the polygon and advance to Page 3
      // This simulates the human doing the map work
      expect(mapData).not.toBeNull();
      if (!mapData) {
        throw new Error("mapData is null");
      }

      const page2Ok = await fillPage2WithMapData(page, context, mapData);
      expect(page2Ok).toBe(true);

      const currentPage = await getCurrentPage(page);
      console.log(`  After Page 2: now on Page ${currentPage}`);
      expect(currentPage).toBe(3);
    },
    TIMEOUTS.extended
  );

  test(
    "4. read disturbed acreage from Page 2",
    async () => {
      const { page } = harness;

      // Navigate back to Page 2 to read the acreage that was set by the map
      disturbedAcres = await readDisturbedAcres(page);
      console.log(`  Disturbed acres: ${disturbedAcres}`);
      expect(disturbedAcres).not.toBeNull();
      expect(disturbedAcres).toBeGreaterThan(0);
    },
    TIMEOUTS.standard
  );

  test(
    "5. resume flow: fill Pages 3-5",
    async () => {
      const { page } = harness;

      // We're on Page 2 after reading acreage, navigate to Page 3
      const navOk = await navigateToPage(page, 3);
      expect(navOk).toBe(true);

      // Fill Page 3 (coordinator and demolition questions)
      const page3Ok = await fillPage3(page);
      expect(page3Ok).toBe(true);

      // Click Next to advance from Page 3 → Page 4
      await clickNext(page);
      const afterPage3 = await getCurrentPage(page);
      console.log(`  After Page 3 Next: now on Page ${afterPage3}`);
      expect(afterPage3).toBe(4);

      // Fill post-K water tier sections with actual disturbed acreage
      // Main categories are pre-filled from copied app, but postK needs real acreage
      expect(disturbedAcres).not.toBeNull();
      if (disturbedAcres === null) {
        throw new Error("disturbedAcres is null");
      }
      const acres = disturbedAcres;
      const formData = buildFormData({
        overrides: { site: { acresDisturbed: acres } },
      });

      await fillPostK(page, formData);
      console.log(`  Filled post-K sections with ${acres} acres`);

      // Click Next to advance to Page 5
      await clickNext(page);
      const afterPage4 = await getCurrentPage(page);
      console.log(`  After Page 4 Next: now on Page ${afterPage4}`);
      expect(afterPage4).toBe(5);

      console.log("\n  RESUME FLOW COMPLETE");
      console.log(`    Application: ${createdAppId}`);
      console.log(`    Disturbed Acres: ${disturbedAcres}`);
      console.log("    Reached Page 5 (Submit)");
    },
    TIMEOUTS.extended
  );

  test("6. module imports correctly", () => {
    expect(typeof fillPage3).toBe("function");
    expect(typeof readDisturbedAcres).toBe("function");
    expect(typeof navigateToPage).toBe("function");
  });

  test(
    "7. cleanup: delete created draft",
    async () => {
      if (!createdAppId) {
        return;
      }
      const deleted = await deleteByApplicationId(
        harness.page,
        harness.context,
        createdAppId
      );
      console.log(
        `  ${deleted ? "Cleaned up" : "Could not clean up"} ${createdAppId}`
      );
    },
    TIMEOUTS.complex
  );
});
