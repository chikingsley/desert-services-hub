/**
 * Spike: Payment Form Fill (Point & Pay)
 *
 * Tests fillPaymentPage1(), clickPaymentContinue(), and confirmPayment()
 * against the real Point & Pay Vaadin portal.
 *
 * This test assumes the browser has already been submitted and redirected
 * to Point & Pay. It walks through:
 * 1. Login → open draft → navigate to Page 5
 * 2. Submit application (redirect to Point & Pay)
 * 3. Fill credit card + billing on Page 1
 * 4. Click Continue to Page 2
 * 5. Dry-run confirm (verify TOS, amounts — don't click Pay)
 *
 * Prerequisites:
 *   - SPIKE_APP_ID env var set to a draft ready on Page 5
 *   - PAYMENT_* env vars set (card + billing info)
 *   - Set SPIKE_PAY=1 to actually click Pay (default: dry run)
 *
 * Run with: bun test tests/e2e/payment-fill-spike.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { getCurrentPage } from "@/portal/create";
import {
  clickPaymentContinue,
  confirmPayment,
  fillPaymentPage1,
} from "@/portal/payment";
import { checkExpedited } from "@/portal/payment/page5";
import {
  buildPaymentData,
  validatePaymentEnv,
} from "@/portal/payment/payment-data";
import { submitApplication } from "@/portal/payment/submit";
import { navigateToPage } from "@/portal/resume";
import { waitForElement } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const SPIKE_APP_ID = process.env.SPIKE_APP_ID ?? "";
const SPIKE_PAY = process.env.SPIKE_PAY === "1";

// Skip if no app ID or payment env vars aren't set
const paymentEnv = validatePaymentEnv();
const canRun = SPIKE_APP_ID && paymentEnv.valid;
const describeSuite = canRun ? describe : describe.skip;

if (!canRun) {
  if (!SPIKE_APP_ID) {
    console.log("Skipping payment-fill-spike: SPIKE_APP_ID not set");
  }
  if (!paymentEnv.valid) {
    console.log(
      `Skipping payment-fill-spike: missing env vars: ${paymentEnv.missing.join(", ")}`
    );
  }
}

const harness = new PortalHarness();

describeSuite("Spike: Payment Fill + Review", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and open draft on Page 5",
    async () => {
      await harness.setup();
      const myApps = await harness.navigateToDustApps();
      expect(myApps).toBe(true);

      // Open draft
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
      expect(await getCurrentPage(harness.page)).toBe(5);
      console.log(`  On Page 5 for ${SPIKE_APP_ID}`);
    },
    TIMEOUTS.complex
  );

  test(
    "2. set expedited and submit to Point & Pay",
    async () => {
      const { page } = harness;

      // Set expedited
      const expedited = await checkExpedited(page, true);
      expect(expedited).toBe(true);

      // Submit (not dry run — we need the redirect)
      console.log("  Submitting application...");
      const result = await submitApplication(page);

      console.log(`  Submit success: ${result.success}`);
      console.log(`  Redirected to payment: ${result.redirectedToPayment}`);
      console.log(`  Final URL: ${result.finalUrl}`);

      expect(result.success).toBe(true);
      expect(result.redirectedToPayment).toBe(true);

      // Screenshot of Point & Pay page
      await page.screenshot({
        fullPage: true,
        path: "tests/e2e/screenshots/payment-spike-page1-empty.png",
      });
      console.log("  Screenshot: payment-spike-page1-empty.png");
    },
    TIMEOUTS.complex
  );

  test(
    "3. fill credit card and billing info",
    async () => {
      const { page } = harness;
      const paymentData = buildPaymentData();

      const report = await fillPaymentPage1(page, paymentData);

      console.log(`  Filled: ${report.filledFields.join(", ")}`);
      if (report.failedFields.length > 0) {
        console.log(`  Failed: ${report.failedFields.join(", ")}`);
      }

      // Screenshot of filled form
      await page.screenshot({
        fullPage: true,
        path: "tests/e2e/screenshots/payment-spike-page1-filled.png",
      });
      console.log("  Screenshot: payment-spike-page1-filled.png");

      expect(report.success).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "4. click Continue to review page",
    async () => {
      const { page } = harness;

      const advanced = await clickPaymentContinue(page);
      expect(advanced).toBe(true);
      console.log("  Advanced to review page");

      // Screenshot of review page
      await page.screenshot({
        fullPage: true,
        path: "tests/e2e/screenshots/payment-spike-page2-review.png",
      });
      console.log("  Screenshot: payment-spike-page2-review.png");
    },
    TIMEOUTS.standard
  );

  test(
    "5. review and confirm payment (dry run by default)",
    async () => {
      const { page } = harness;
      const dryRun = !SPIKE_PAY;

      const result = await confirmPayment(page, { dryRun });

      console.log(`  ${dryRun ? "[DRY RUN] " : ""}Payment result:`);
      console.log(`    Success: ${result.success}`);
      console.log(`    Amount: ${result.amount ?? "N/A"}`);
      console.log(`    Fee: ${result.convenienceFee ?? "N/A"}`);
      console.log(`    Total: ${result.totalPaid ?? "N/A"}`);
      console.log(`    Card: ****${result.cardLastFour ?? "????"}`);

      if (dryRun) {
        console.log("    Set SPIKE_PAY=1 to actually pay");
      }

      // Screenshot
      await page.screenshot({
        fullPage: true,
        path: "tests/e2e/screenshots/payment-spike-page2-confirmed.png",
      });
      console.log("  Screenshot: payment-spike-page2-confirmed.png");

      expect(result.success).toBe(true);
    },
    TIMEOUTS.complex
  );
});
