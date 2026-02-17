/**
 * Point & Pay - Page 1 Fill
 *
 * Fills credit card and billing information on the Point & Pay
 * payment portal (Vaadin-based, public.pointandpay.net).
 *
 * Each field fill is independent and logged. Returns a detailed
 * report of which fields succeeded and which failed.
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import type { PaymentFillReport } from "@/portal/types";
import { fillTextSafe, selectCombo } from "@/portal/utils/helpers";
import { paymentPage1 } from "@/portal/utils/selectors/pointandpay";

/**
 * Fill all payment fields on Point & Pay Page 1.
 *
 * @param page - Playwright Page instance (must already be on Point & Pay)
 * @param data - Payment data (card + billing) — typically DEFAULTS.payment
 * @returns Detailed report of which fields were filled
 */
export async function fillPaymentPage1(
  page: Page,
  data: FormData["payment"]
): Promise<PaymentFillReport> {
  console.log("[PAYMENT PAGE 1] Filling credit card + billing info...");

  const filledFields: string[] = [];
  const failedFields: string[] = [];

  const track = (fieldName: string, ok: boolean) => {
    if (ok) {
      filledFields.push(fieldName);
    } else {
      failedFields.push(fieldName);
    }
  };

  // --- Credit Card Fields ---
  console.log("  Card info:");

  track(
    "nameOnCard",
    await fillTextSafe(page, paymentPage1.card.nameOnCard, data.card.nameOnCard)
  );

  track(
    "cardNumber",
    await fillTextSafe(page, paymentPage1.card.cardNumber, data.card.cardNumber)
  );

  track(
    "expiryMonth",
    await selectCombo(
      page,
      paymentPage1.card.expiryMonth,
      data.card.expiryMonth,
      "Expiry Month"
    )
  );

  track(
    "expiryYear",
    await selectCombo(
      page,
      paymentPage1.card.expiryYear,
      data.card.expiryYear,
      "Expiry Year"
    )
  );

  track("cvv", await fillTextSafe(page, paymentPage1.card.cvv, data.card.cvv));

  // --- Billing Fields ---
  console.log("  Billing info:");

  track(
    "firstName",
    await fillTextSafe(
      page,
      paymentPage1.billing.firstName,
      data.billing.firstName
    )
  );

  track(
    "lastName",
    await fillTextSafe(
      page,
      paymentPage1.billing.lastName,
      data.billing.lastName
    )
  );

  track(
    "addressLine1",
    await fillTextSafe(
      page,
      paymentPage1.billing.addressLine1,
      data.billing.addressLine1
    )
  );

  // Address Line 2 is optional
  if (data.billing.addressLine2) {
    track(
      "addressLine2",
      await fillTextSafe(
        page,
        paymentPage1.billing.addressLine2,
        data.billing.addressLine2
      )
    );
  }

  // Country is a combo-box (defaults to "United States")
  track(
    "country",
    await selectCombo(
      page,
      paymentPage1.billing.country,
      data.billing.country,
      "Country"
    )
  );

  track(
    "city",
    await fillTextSafe(page, paymentPage1.billing.city, data.billing.city)
  );

  // State is a combo-box
  track(
    "state",
    await selectCombo(
      page,
      paymentPage1.billing.state,
      data.billing.state,
      "State"
    )
  );

  track(
    "postalCode",
    await fillTextSafe(
      page,
      paymentPage1.billing.postalCode,
      data.billing.postalCode
    )
  );

  track(
    "email",
    await fillTextSafe(page, paymentPage1.billing.email, data.billing.email)
  );

  track(
    "phone",
    await fillTextSafe(page, paymentPage1.billing.phone, data.billing.phone)
  );

  // --- Summary ---
  const success = failedFields.length === 0;
  console.log(
    `  ${success ? "All" : `${filledFields.length}/${filledFields.length + failedFields.length}`} fields filled successfully`
  );
  if (failedFields.length > 0) {
    console.log(`  Failed: ${failedFields.join(", ")}`);
  }

  return { failedFields, filledFields, success };
}
