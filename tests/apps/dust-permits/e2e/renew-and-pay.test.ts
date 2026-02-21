/**
 * E2E: Renew + Submit + Pay
 *
 * Single end-to-end test: login → renew pages 1-5 → expedited →
 * submit → fill payment → continue → review → pay.
 *
 * Prerequisites:
 *   - RENEW_PERMIT_ID env var (e.g. "D0059617")
 *   - RENEW_COMPANY_NAME env var (e.g. "Ryan Companies US Inc")
 *   - PAYMENT_* env vars (card + billing info)
 *
 * Run: bun test tests/e2e/renew-and-pay.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { DEFAULTS } from "@/form-data";
import { getCurrentPage } from "@/portal/create";
import {
  checkExpedited,
  clickPaymentContinue,
  confirmPayment,
  fillPaymentPage1,
  submitApplication,
} from "@/portal/create/fill";
import { renewPermitFull } from "@/portal/create/flow";
import { PortalHarness } from "./utils/harness";

const PERMIT_ID = process.env.RENEW_PERMIT_ID ?? "";
const COMPANY_NAME = process.env.RENEW_COMPANY_NAME ?? "";
const EXPEDITED = process.env.RENEW_EXPEDITED === "true";

const hasPaymentData = !!DEFAULTS.payment.card.cardNumber;
const canRun = PERMIT_ID && COMPANY_NAME && hasPaymentData;
const describeSuite = canRun ? describe : describe.skip;

if (!canRun) {
  if (!PERMIT_ID) {
    console.log("Skipping renew-and-pay: RENEW_PERMIT_ID not set");
  }
  if (!COMPANY_NAME) {
    console.log("Skipping renew-and-pay: RENEW_COMPANY_NAME not set");
  }
  if (!hasPaymentData) {
    console.log("Skipping renew-and-pay: PAYMENT_* env vars not set");
  }
}

const harness = new PortalHarness();
const SCREENSHOTS = "tests/e2e/screenshots";

describeSuite("E2E: Renew + Submit + Pay", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test("renew, submit, and pay", async () => {
    // ── Setup: browser + login ──────────────────────────────────────
    await harness.setup();

    // ── Phase 1: Renew through pages 1-5 ────────────────────────────
    console.log(`\n── Renewing ${PERMIT_ID} (${COMPANY_NAME}) ──`);

    const renewResult = await renewPermitFull(
      harness.page,
      harness.context,
      PERMIT_ID,
      COMPANY_NAME
    );

    console.log(
      `  Renew: success=${renewResult.success}, appId=${renewResult.applicationId}`
    );
    if (renewResult.error) {
      console.log(`  Error: ${renewResult.error}`);
    }

    await harness.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOTS}/renew-pay-01-page5.png`,
    });

    expect(renewResult.success).toBe(true);
    expect(renewResult.applicationId).toBeTruthy();

    const currentPage = await getCurrentPage(harness.page);
    console.log(`  On page: ${currentPage}`);
    expect(currentPage).toBe(5);

    // ── Phase 2: Expedited + Submit ────────────────────────────────────

    if (EXPEDITED) {
      const expeditedOk = await checkExpedited(harness.page, true);
      console.log(`  Expedited: ${expeditedOk ? "enabled" : "failed"}`);
    }

    const submitResult = await submitApplication(harness.page);
    console.log(
      `  Submit: success=${submitResult.success}, redirect=${submitResult.redirectedToPayment}`
    );
    console.log(`  URL: ${submitResult.finalUrl}`);

    await harness.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOTS}/renew-pay-02-submitted.png`,
    });

    expect(submitResult.success).toBe(true);
    expect(submitResult.redirectedToPayment).toBe(true);

    // ── Phase 3: Fill payment ───────────────────────────────────────
    const fillReport = await fillPaymentPage1(harness.page, DEFAULTS.payment);
    console.log(`  Filled: ${fillReport.filledFields.join(", ")}`);
    if (fillReport.failedFields.length > 0) {
      console.log(`  Failed: ${fillReport.failedFields.join(", ")}`);
    }

    await harness.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOTS}/renew-pay-03-payment-filled.png`,
    });

    expect(fillReport.success).toBe(true);

    // Continue to review page
    const advanced = await clickPaymentContinue(harness.page);
    expect(advanced).toBe(true);
    console.log("  Advanced to review page");

    // ── Phase 4: Review + Pay ───────────────────────────────────────
    const review = await confirmPayment(harness.page, { dryRun: true });
    console.log("  Payment review:");
    console.log(`    Amount: ${review.amount ?? "N/A"}`);
    console.log(`    Fee: ${review.convenienceFee ?? "N/A"}`);
    console.log(`    Total: ${review.totalPaid ?? "N/A"}`);
    console.log(`    Card: ****${review.cardLastFour ?? "????"}`);

    await harness.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOTS}/renew-pay-04-review.png`,
    });

    expect(review.success).toBe(true);

    const payResult = await confirmPayment(harness.page, { dryRun: false });
    console.log("  Payment result:");
    console.log(`    Success: ${payResult.success}`);
    console.log(`    Total: ${payResult.totalPaid ?? "N/A"}`);
    console.log(`    Card: ****${payResult.cardLastFour ?? "????"}`);

    await harness.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOTS}/renew-pay-05-paid.png`,
    });

    expect(payResult.success).toBe(true);

    console.log(
      `\n── DONE: ${PERMIT_ID} renewed and paid (${payResult.totalPaid}) ──\n`
    );
  }, 600_000);
});
