import { describe, expect, test } from "bun:test";

import { extractPointAndPayBillingDetails } from "../../../apps/trigger-dev/src/trigger/dust-permit-billing-values";

describe("point and pay billing helpers", () => {
  test("prefers subtotal when duplicate invoice line items are present", () => {
    const details = extractPointAndPayBillingDetails(`Your Maricopa County Air Quality Department payment has been authorized and will be processed soon.

Please see below for the details of your payment:

Product: Invoices - Account Number: IV089483 - Amount: $1,130.00
Product: Invoices - Account Number: IV089483 - Amount: $1,130.00

Sub Total: $2,260.00

Fee: $0.00

Total: $2,260.00

Confirmation ID: 193411689
Payment Date: 03/11/2026 12:09 PM US Arizona
Account Last Four: 8113`);

    expect(details).toEqual({
      cardLastFour: "8113",
      confirmationId: "193411689",
      invoiceNumber: "IV089483",
      paymentDate: "03/11/2026 12:09 PM US Arizona",
      permitCost: "$2,260.00",
    });
  });

  test("falls back to the first product amount when subtotal is missing", () => {
    const details = extractPointAndPayBillingDetails(`Product: Invoices - Account Number: IV089427 - Amount: $1,130.00
Confirmation ID: 193340441
Payment Date: 03/10/2026 03:08 PM US Arizona
Account Last Four: 8113`);

    expect(details).toEqual({
      cardLastFour: "8113",
      confirmationId: "193340441",
      invoiceNumber: "IV089427",
      paymentDate: "03/10/2026 03:08 PM US Arizona",
      permitCost: "$1,130.00",
    });
  });
});
