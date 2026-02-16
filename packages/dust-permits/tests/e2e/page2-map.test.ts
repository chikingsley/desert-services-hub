/**
 * Page 2 Map Popup E2E Test
 *
 * Tests the map popup functionality on page 2 (Project Location).
 * Uses existing company workflow with copy-from to create an application,
 * then navigates to page 2 and tests the map popup functions.
 *
 * Run with: bun test tests/e2e/page2-map.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import {
  createExistingCompanyApplication,
  getCurrentPage,
  goToPage,
  isOnDustAppsPage,
} from "@/portal/create";
import {
  findEsriFrame,
  handleMapPopup,
  openMapPopup,
} from "@/portal/create/fill/page2/map";
import { deleteByApplicationId } from "@/portal/delete";
import { DUST_APPLICATION_ID_REGEX } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const APP_ID_PATTERN = DUST_APPLICATION_ID_REGEX;

// Test data
const COMPANY_NAME = "Sundt Construction Inc";
const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER || "D0062461";

const harness = new PortalHarness();
let createdAppId: string | null = null;

describe("Page 2 Map Popup", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and navigate to My Dust Apps",
    async () => {
      await harness.setup();
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);

      const hasNewBtn = await isOnDustAppsPage(harness.page);
      expect(hasNewBtn).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "2. create application with existing company",
    async () => {
      const { page, context } = harness;

      const result = await createExistingCompanyApplication(
        page,
        context,
        COMPANY_NAME,
        COPY_FROM_APP
      );

      expect(result.success).toBe(true);
      expect(result.applicationId).toMatch(APP_ID_PATTERN);
      expect(result.error).toBeUndefined();

      createdAppId = result.applicationId;
      console.log(`  Created: ${createdAppId}`);
    },
    TIMEOUTS.complex
  );

  test(
    "3. navigate to page 2 (Project Location)",
    async () => {
      const { page } = harness;

      // Should be on page 1 after creation
      const currentPage = await getCurrentPage(page);
      console.log(`  Currently on page ${currentPage}`);

      // Navigate to page 2
      const { success } = await goToPage(page, 2);
      expect(success).toBe(true);

      const newPage = await getCurrentPage(page);
      expect(newPage).toBe(2);
      console.log(`  Successfully navigated to page ${newPage}`);
    },
    TIMEOUTS.standard
  );

  test(
    "4. open map popup",
    async () => {
      const { page, context } = harness;

      const mapPopup = await openMapPopup(page, context);
      expect(mapPopup).not.toBeNull();
      console.log("  Map popup opened successfully");

      // Store popup for next test
      (harness as unknown as { mapPopup: typeof mapPopup }).mapPopup = mapPopup;
    },
    TIMEOUTS.complex
  );

  test(
    "5. find ESRI iframe",
    async () => {
      const { mapPopup } = harness as unknown as {
        mapPopup: Awaited<ReturnType<typeof openMapPopup>>;
      };
      expect(mapPopup).not.toBeNull();

      if (!mapPopup) {
        throw new Error("Map popup not available from previous test");
      }

      const esriFrame = await findEsriFrame(mapPopup, 20_000);
      expect(esriFrame).not.toBeNull();
      console.log("  ESRI iframe found");

      // Store frame for next test
      (harness as unknown as { esriFrame: typeof esriFrame }).esriFrame =
        esriFrame;
    },
    TIMEOUTS.complex
  );

  test(
    "6. handle map popup (search, basemap, draw mode)",
    async () => {
      const { mapPopup } = harness as unknown as {
        mapPopup: Awaited<ReturnType<typeof openMapPopup>>;
      };
      expect(mapPopup).not.toBeNull();

      if (!mapPopup) {
        throw new Error("Map popup not available from previous test");
      }

      // Test with sample data (parcel and address can be adjusted)
      const result = await handleMapPopup(mapPopup, {
        parcelNumber: "123-45-678", // Sample parcel
        address: "2901 W Durango St, Phoenix, AZ", // Sample address
      });

      console.log("  Map handling result:");
      console.log(`    - Success: ${result.success}`);
      console.log(`    - Searched by: ${result.searchedBy ?? "none"}`);
      console.log(`    - Basemap changed: ${result.basemapChanged}`);
      console.log(`    - Drawing complete: ${result.drawingComplete}`);

      // Check that map handling succeeded overall
      expect(result.success).toBe(true);

      // Basemap switch is expected to work
      expect(result.basemapChanged).toBe(true);
    },
    TIMEOUTS.extended
  );

  test(
    "7. cleanup: delete draft",
    async () => {
      if (!createdAppId) {
        console.log("  No application to clean up");
        return;
      }

      const { page, context } = harness;
      const deleted = await deleteByApplicationId(page, context, createdAppId);
      expect(deleted).toBe(true);
      console.log(`  Cleaned up ${createdAppId}`);
    },
    TIMEOUTS.standard
  );
});
