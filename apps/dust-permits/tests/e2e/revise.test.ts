/**
 * Revise Application E2E Tests
 *
 * Tests the revise flow for modifying an existing active permit.
 * Requires an ACTIVE permit (not a draft) - the permit must appear
 * in the "Revision of Application Number" dropdown.
 *
 * Run with: bun test tests/e2e/revise.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { createReviseApplication, isOnDustAppsPage } from "@/portal/create";
import { deleteByApplicationId } from "@/portal/delete";
import { DUST_APPLICATION_ID_REGEX } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

// Must be an ACTIVE permit (not a draft) - must appear in revision dropdown
const TEST_PERMIT_ID = process.env.REVISE_TEST_PERMIT_ID ?? "";
const RUN_REVISE = TEST_PERMIT_ID !== "";

const APP_ID_PATTERN = DUST_APPLICATION_ID_REGEX;

// Track created revision for cleanup
let createdRevisionId: string | null = null;

const describeSuite = RUN_REVISE ? describe : describe.skip;

describeSuite("Revise Application Flow", () => {
  afterAll(async () => {
    // Teardown browser - cleanup is handled in the last test step
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
    "2. start revision via popup",
    async () => {
      const { page, context } = harness;

      const result = await createReviseApplication(
        page,
        context,
        TEST_PERMIT_ID,
        "E2E Test: Reducing project acreage for testing purposes"
      );

      expect(result.success).toBe(true);
      expect(result.applicationId).toMatch(APP_ID_PATTERN);
      expect(result.error).toBeUndefined();

      createdRevisionId = result.applicationId;
      console.log(`  Created revision: ${createdRevisionId}`);
    },
    TIMEOUTS.complex
  );

  test(
    "3. verify revision was created",
    async () => {
      const { page } = harness;

      // After creating revision, the application ID should be visible in the header
      const appIdElement = page.locator('[id="ThePage:applicationId"]');
      await appIdElement.waitFor({ state: "visible", timeout: 10_000 });
      const appId = await appIdElement.textContent();

      expect(appId?.trim()).toBe(createdRevisionId ?? undefined);

      // Verify we're in the application detail view (could be any page 1-5)
      const hasDetailForm = await page.isVisible(
        '[id*="dustApplicationDetail"]'
      );
      expect(hasDetailForm).toBe(true);
    },
    TIMEOUTS.standard
  );

  test(
    "4. cleanup: delete revision draft",
    async () => {
      if (!createdRevisionId) {
        return; // Nothing to clean up
      }

      const { page, context } = harness;
      const deleted = await deleteByApplicationId(
        page,
        context,
        createdRevisionId
      );
      expect(deleted).toBe(true);
      console.log(`  Cleaned up revision ${createdRevisionId}`);
    },
    TIMEOUTS.standard
  );
});
