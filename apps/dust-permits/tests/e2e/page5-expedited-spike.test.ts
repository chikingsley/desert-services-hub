/**
 * Spike: Page 5 Expedited Checkbox
 *
 * Tests the checkExpedited() function against a real draft application
 * that's already on Page 5.
 *
 * Prerequisites:
 *   - SPIKE_APP_ID env var set to a draft permit number on Page 5 (e.g. "D0065000")
 *   - Portal credentials configured
 *
 * Run with: bun test tests/e2e/page5-expedited-spike.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { getCurrentPage } from "@/portal/create";
import { checkExpedited } from "@/portal/payment/page5";
import { navigateToPage } from "@/portal/resume";
import { waitForElement } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const SPIKE_APP_ID = process.env.SPIKE_APP_ID ?? "";
const describeSuite = SPIKE_APP_ID ? describe : describe.skip;

const harness = new PortalHarness();

describeSuite("Spike: Page 5 Expedited Checkbox", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and navigate to draft",
    async () => {
      await harness.setup();
      const myApps = await harness.navigateToDustApps();
      expect(myApps).toBe(true);

      // Click on the draft application
      const link = harness.page
        .locator(`a:has-text("${SPIKE_APP_ID}")`)
        .first();
      expect(await link.count()).toBeGreaterThan(0);
      await link.click();

      // Wait for detail form to load
      const loaded = await waitForElement(
        harness.page,
        portal.applicationDetail.detailForm,
        15_000
      );
      expect(loaded).toBe(true);
      console.log(`  Opened draft: ${SPIKE_APP_ID}`);
    },
    TIMEOUTS.complex
  );

  test(
    "2. navigate to Page 5",
    async () => {
      const ok = await navigateToPage(harness.page, 5);
      expect(ok).toBe(true);

      const current = await getCurrentPage(harness.page);
      expect(current).toBe(5);
      console.log("  On Page 5");
    },
    TIMEOUTS.standard
  );

  test(
    "3. check expedited = true",
    async () => {
      const ok = await checkExpedited(harness.page, true);
      expect(ok).toBe(true);
      console.log("  Expedited checked ON");
    },
    TIMEOUTS.standard
  );

  test(
    "4. uncheck expedited = false",
    async () => {
      const ok = await checkExpedited(harness.page, false);
      expect(ok).toBe(true);
      console.log("  Expedited checked OFF");
    },
    TIMEOUTS.standard
  );

  test(
    "5. set expedited back to desired state",
    async () => {
      // Leave it checked — this is a real permit we're about to submit
      const ok = await checkExpedited(harness.page, true);
      expect(ok).toBe(true);
      console.log("  Expedited set to ON (final state)");
    },
    TIMEOUTS.standard
  );
});
