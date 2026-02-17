/**
 * Spike: Submit Application (Page 5)
 *
 * Tests submitApplication() against a real draft that's ready on Page 5.
 * First runs in dry-run mode to verify, then optionally submits.
 *
 * After submit, captures what happens: Point & Pay redirect,
 * ADF confirmation, or error.
 *
 * Prerequisites:
 *   - SPIKE_APP_ID env var set to a draft permit number on Page 5
 *   - Draft must be fully filled (Pages 1-5 complete)
 *   - Set SPIKE_SUBMIT=1 to actually submit (default: dry run only)
 *
 * Run with: bun test tests/e2e/submit-spike.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { getCurrentPage } from "@/portal/create";
import { checkExpedited, submitApplication } from "@/portal/create/fill/page5";
import { navigateToPage } from "@/portal/resume";
import { sleep, waitForElement } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const SPIKE_APP_ID = process.env.SPIKE_APP_ID ?? "";
const SPIKE_SUBMIT = process.env.SPIKE_SUBMIT === "1";
const describeSuite = SPIKE_APP_ID ? describe : describe.skip;

const harness = new PortalHarness();

describeSuite("Spike: Submit Application", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and open draft on Page 5",
    async () => {
      await harness.setup();
      const myApps = await harness.navigateToDustApps();
      expect(myApps).toBe(true);

      // Open the draft
      const link = harness.page
        .locator(`a:has-text("${SPIKE_APP_ID}")`)
        .first();
      expect(await link.count()).toBeGreaterThan(0);
      await link.click();

      const loaded = await waitForElement(
        harness.page,
        portal.applicationDetail.detailForm,
        15_000
      );
      expect(loaded).toBe(true);

      // Navigate to Page 5
      const ok = await navigateToPage(harness.page, 5);
      expect(ok).toBe(true);
      console.log(`  On Page 5 for ${SPIKE_APP_ID}`);
    },
    TIMEOUTS.complex
  );

  test(
    "2. verify page 5 state",
    async () => {
      const { page } = harness;
      const current = await getCurrentPage(page);
      expect(current).toBe(5);

      // Check submit button is visible
      const submitVisible = await page
        .locator("text=Submit Application")
        .count();
      expect(submitVisible).toBeGreaterThan(0);
      console.log("  Submit button visible");

      // Screenshot
      await page.screenshot({
        fullPage: true,
        path: "tests/e2e/screenshots/submit-spike-page5.png",
      });
      console.log("  Screenshot: submit-spike-page5.png");
    },
    TIMEOUTS.standard
  );

  test(
    "3. set expedited processing",
    async () => {
      const ok = await checkExpedited(harness.page, true);
      expect(ok).toBe(true);
      console.log("  Expedited processing: ON");
    },
    TIMEOUTS.standard
  );

  test(
    "4. dry-run submit (verify without clicking)",
    async () => {
      const result = await submitApplication(harness.page, { dryRun: true });

      console.log("  Dry run result:");
      console.log(`    Success: ${result.success}`);
      console.log(`    App ID: ${result.applicationId}`);
      console.log(`    URL: ${result.finalUrl}`);

      expect(result.success).toBe(true);
      expect(result.applicationId).not.toBeNull();
    },
    TIMEOUTS.standard
  );

  test(
    "5. actual submit (if SPIKE_SUBMIT=1)",
    async () => {
      if (!SPIKE_SUBMIT) {
        console.log("  Skipping actual submit (set SPIKE_SUBMIT=1 to enable)");
        return;
      }

      console.log("  SUBMITTING APPLICATION...");
      const result = await submitApplication(harness.page);

      console.log("  Submit result:");
      console.log(`    Success: ${result.success}`);
      console.log(`    App ID: ${result.applicationId}`);
      console.log(`    Redirected to payment: ${result.redirectedToPayment}`);
      console.log(`    Final URL: ${result.finalUrl}`);

      expect(result.success).toBe(true);

      // Screenshot after submit
      await sleep(2000);
      await harness.page.screenshot({
        fullPage: true,
        path: "tests/e2e/screenshots/submit-spike-after-submit.png",
      });
      console.log("  Screenshot: submit-spike-after-submit.png");

      // Dump HTML for analysis
      const html = await harness.page.content();
      await Bun.write(
        "tests/e2e/screenshots/submit-spike-after-submit.html",
        html
      );
      console.log("  HTML dump: submit-spike-after-submit.html");
    },
    TIMEOUTS.complex
  );
});
