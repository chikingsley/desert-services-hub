/**
 * Point & Pay - Page 2 Review & Confirm
 *
 * Handles the review/confirmation page on Point & Pay:
 * - Reads amount summary (subtotal, fee, total)
 * - Checks TOS checkbox
 * - Clicks "Pay $X now" (or stops in dry-run mode)
 *
 * Default is dry-run (dryRun: true) — verifies everything
 * is ready without clicking Pay.
 */

import type { Page } from "playwright";
import type { PaymentResult } from "@/portal/types";
import { sleep } from "@/portal/utils/helpers";
import {
  paymentPage1,
  paymentPage2,
} from "@/portal/utils/selectors/pointandpay";
import {
  checkVaadinCheckbox,
  clickVaadinButton,
  readVaadinText,
} from "./vaadin-helpers";

/**
 * Click the Continue button on Page 1 to advance to Page 2.
 *
 * @param page - Playwright Page instance (on Point & Pay Page 1)
 * @returns true if we advanced to Page 2
 */
export async function clickPaymentContinue(page: Page): Promise<boolean> {
  console.log("[PAYMENT] Clicking Continue to review page...");

  const clicked = await clickVaadinButton(
    page,
    paymentPage1.continueButton,
    "Continue"
  );

  if (!clicked) {
    console.log("  ✗ Failed to click Continue");
    return false;
  }

  // Wait for Page 2 TOS checkbox with retry
  for (const attempt of [1, 2]) {
    await sleep(2000);
    const tosVisible = await page
      .locator(paymentPage2.tosCheckbox)
      .isVisible()
      .catch(() => false);

    if (tosVisible) {
      console.log(
        `  On review page (TOS checkbox visible${attempt > 1 ? " after retry" : ""})`
      );
      return true;
    }
  }

  console.log("  ✗ Could not confirm we're on the review page");
  return false;
}

/**
 * Read payment amounts from the review page.
 */
async function readAmounts(page: Page): Promise<{
  subTotal: string | null;
  convenienceFee: string | null;
  total: string | null;
}> {
  const subTotal = await readVaadinText(page, paymentPage2.subTotal);
  const convenienceFee = await readVaadinText(
    page,
    paymentPage2.convenienceFee
  );
  const total = await readVaadinText(page, paymentPage2.total);
  return { convenienceFee, subTotal, total };
}

/**
 * Read the last 4 digits of the card from the review page.
 */
async function readCardLastFour(page: Page): Promise<string | null> {
  const mask = await readVaadinText(page, paymentPage2.cardMask);
  if (!mask) {
    return null;
  }
  return mask.trim().slice(-4);
}

/**
 * Review and optionally confirm payment on Point & Pay Page 2.
 *
 * @param page - Playwright Page instance (on Point & Pay Page 2)
 * @param options.dryRun - If true (default), don't click Pay — just verify everything is ready
 * @returns PaymentResult with amounts and confirmation status
 */
export async function confirmPayment(
  page: Page,
  options?: { dryRun?: boolean }
): Promise<PaymentResult> {
  const dryRun = options?.dryRun ?? true;

  console.log(
    `[PAYMENT PAGE 2] ${dryRun ? "(DRY RUN) " : ""}Review & confirm...`
  );

  // Read amounts and card info
  const amounts = await readAmounts(page);
  console.log(`  Subtotal: ${amounts.subTotal ?? "not found"}`);
  console.log(`  Convenience fee: ${amounts.convenienceFee ?? "not found"}`);
  console.log(`  Total: ${amounts.total ?? "not found"}`);

  const cardLastFour = await readCardLastFour(page);
  if (cardLastFour) {
    console.log(`  Card: ****${cardLastFour}`);
  }

  // Shared base fields for all result paths
  const base = {
    amount: amounts.subTotal ?? undefined,
    cardLastFour: cardLastFour ?? undefined,
    convenienceFee: amounts.convenienceFee ?? undefined,
    totalPaid: amounts.total ?? undefined,
  };

  // Check TOS checkbox
  const tosOk = await checkVaadinCheckbox(
    page,
    paymentPage2.tosCheckbox,
    true,
    "Terms of Service"
  );

  if (!tosOk) {
    return {
      ...base,
      dryRun,
      error: "Failed to check TOS checkbox",
      success: false,
    };
  }

  if (dryRun) {
    console.log(
      `  [DRY RUN] Ready to pay ${amounts.total ?? "unknown amount"} — stopping here`
    );
    return { ...base, dryRun: true, success: true };
  }

  // Click Pay Now
  console.log(`  Clicking Pay Now (${amounts.total ?? "unknown amount"})...`);
  const payOk = await clickVaadinButton(
    page,
    paymentPage2.payNowButton,
    "Pay Now"
  );

  if (!payOk) {
    return {
      ...base,
      dryRun: false,
      error: "Failed to click Pay Now button",
      success: false,
    };
  }

  // Wait for payment to process
  console.log("  Waiting for payment to process...");
  await sleep(5000);

  console.log("  Payment submitted");
  return { ...base, dryRun: false, success: true };
}
