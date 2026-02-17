/**
 * Renew + Pay Permit Handler
 *
 * Gated multi-step flow: renew → submit → fill payment → pay.
 * Separated from permits.ts to keep file sizes manageable.
 */

import { persistDraftPermitRecord } from "@/lib/permit-records";
import { renewPermitFull } from "@/portal/create";
import {
  buildPaymentData,
  checkExpedited,
  checkpoint,
  clickPaymentContinue,
  confirmPayment,
  fillPaymentPage1,
  submitApplication,
  validatePaymentEnv,
} from "@/portal/payment";
import { withBrowserSessionOperation } from "@/portal/utils/browser";
import {
  ensureBrowserSession,
  jsonError,
  jsonSuccess,
  log,
  renewAndPayBodySchema,
} from "./permits-helpers";

/**
 * POST /api/permits/:id/renew-and-pay - Renew + submit + pay with operator checkpoints
 *
 * Full gated flow:
 * 1. renewPermitFull → Page 5 (checkpoint: before submit)
 * 2. Submit application (checkpoint: after redirect to Point & Pay)
 * 3. Fill payment (checkpoint: before paying)
 * 4. Pay
 *
 * Payment data comes from PAYMENT_* env vars (same every time).
 */
export async function handleRenewAndPay(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n💳 RENEW & PAY permit request: ${id}`);

  const parsed = renewAndPayBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { companyName, expedited } = parsed.data;

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const ctx = sessionResult.page;
    const { page } = ctx;

    // Phase 1: Renew to Page 5
    const renewResult = await withBrowserSessionOperation(
      `renew-and-pay:${id}`,
      async () => await renewPermitFull(page, ctx.context, id, companyName)
    );

    if (!renewResult.success) {
      return jsonError(renewResult.error || "Renew failed", 500);
    }

    const appId = renewResult.applicationId;
    log(`  Renewal created: ${appId}`);

    if (appId) {
      await persistDraftPermitRecord({
        applicationId: appId,
        companyName,
        flow: "renew",
        sourcePermitId: id,
      });
    }

    // Set expedited
    if (expedited) {
      await checkExpedited(page, true);
    }

    // Checkpoint: before submit
    const goSubmit = await checkpoint(
      `Submit ${appId}? This submits to Maricopa County.`,
      { appId, permit: id, step: "before-submit", expedited }
    );
    if (!goSubmit) {
      log("  Operator declined submit. Draft on Page 5.");
      return jsonSuccess({
        applicationId: appId,
        stage: "page5-ready",
        success: true,
      });
    }

    // Phase 2: Submit
    log("  Submitting...");
    const submitResult = await submitApplication(page);
    log(
      `  Submit: success=${submitResult.success}, redirect=${submitResult.redirectedToPayment}`
    );

    if (!submitResult.success) {
      return jsonError(`Submit failed: ${submitResult.error}`, 500);
    }

    if (!submitResult.redirectedToPayment) {
      return jsonSuccess({
        applicationId: appId,
        stage: "submitted-no-payment",
        success: true,
      });
    }

    // Phase 3: Fill payment from env
    const payEnv = validatePaymentEnv();
    if (!payEnv.valid) {
      return jsonError(
        `Payment env vars missing: ${payEnv.missing.join(", ")}`,
        500
      );
    }

    const paymentData = buildPaymentData();
    const fillReport = await fillPaymentPage1(page, paymentData);
    log(`  Filled: ${fillReport.filledFields.join(", ")}`);

    // Checkpoint: payment page 1 filled
    const goPay1 = await checkpoint(
      "Payment Page 1 filled. Continue to review?",
      {
        appId,
        step: "payment-page1-filled",
        filled: fillReport.filledFields.length,
      }
    );
    if (!goPay1) {
      return jsonSuccess({
        applicationId: appId,
        stage: "payment-page1",
        success: true,
      });
    }

    // Advance to page 2
    const continued = await clickPaymentContinue(page);
    if (!continued) {
      return jsonError("Failed to advance to payment review page", 500);
    }

    // Dry run to get amounts
    const dryRun = await confirmPayment(page, { dryRun: true });

    // Checkpoint: before charging card
    const goCharge = await checkpoint(
      `Pay ${dryRun.totalPaid ?? "unknown"} for ${appId}? THIS CHARGES THE CARD.`,
      {
        appId,
        permit: id,
        step: "before-pay",
        amount: dryRun.amount,
        fee: dryRun.convenienceFee,
        total: dryRun.totalPaid,
      }
    );
    if (!goCharge) {
      return jsonSuccess({
        applicationId: appId,
        amount: dryRun.amount,
        stage: "payment-review",
        success: true,
        total: dryRun.totalPaid,
      });
    }

    // Phase 4: Pay
    log("  Processing payment...");
    const payResult = await confirmPayment(page, { dryRun: false });
    log(
      `  Payment: success=${payResult.success}, total=${payResult.totalPaid}`
    );

    return jsonSuccess({
      amount: payResult.amount,
      applicationId: appId,
      cardLastFour: payResult.cardLastFour,
      convenienceFee: payResult.convenienceFee,
      stage: "paid",
      success: payResult.success,
      totalPaid: payResult.totalPaid,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Renew & Pay error: ${errorMsg}`);
    return jsonError(`Renew & Pay error: ${errorMsg}`, 500);
  }
}
