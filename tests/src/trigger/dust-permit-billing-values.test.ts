import { describe, expect, test } from "bun:test";

import {
  extractBillingEmailDetails,
  extractPointAndPayBillingDetails,
  lookupBillingScheduleValue,
  resolveBillingDraftDetails,
} from "../../../apps/trigger-dev/src/trigger/dust-permit-billing-values";

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

  test("parses Pima payment confirmation emails", () => {
    const details = extractBillingEmailDetails(`Dear Customer,

This email is to confirm the successful processing of a one-time payment for your PIMA County Public Works - Online Permitting record number 26TMP-003740.

A one-time payment of $1,500.00 that was scheduled with a date of 03/06/2026 has been processed. The funding source that was debited for this payment is your funding account number ending XXXX8113.

The unique confirmation number for this payment is I8V3BY7CM3.`);

    expect(details).toEqual({
      cardLastFour: "8113",
      confirmationId: "I8V3BY7CM3",
      invoiceNumber: "26TMP-003740",
      paymentDate: "03/06/2026",
      permitCost: "$1,500.00",
    });
  });

  test("lets manual overrides drive a billing draft when payment email data is partial", () => {
    const details = resolveBillingDraftDetails({
      parsedPaymentDetails: {
        cardLastFour: "8113",
        confirmationId: "192975073",
        invoiceNumber: "IV089062",
        paymentDate: "03/03/2026 07:03 PM US Arizona",
        permitCost: "$2,260.00",
      },
      overrides: {
        invoiceDate: "03/05/2026",
        invoiceNumber: "IV089182",
        paymentMovedFromInvoiceNumber: "IV089062",
        permitCost: "$1,130.00",
      },
    });

    expect(details).toEqual({
      cardLastFour: "8113",
      cardholderName: "Company Card (ending 8113)",
      confirmationId: "192975073",
      invoiceDate: "03/05/2026",
      invoiceNumber: "IV089182",
      paymentDate: "03/03/2026 07:03 PM US Arizona",
      paymentMethod: "Credit Card",
      paymentMovedFromInvoiceNumber: "IV089062",
      permitCost: "$1,130.00",
      vendorName: "Maricopa County ADEQ",
    });
  });

  test("requires invoice number and permit cost for manual billing drafts", () => {
    expect(() =>
      resolveBillingDraftDetails({
        overrides: {
          paymentDate: "03/16/2026",
        },
      })
    ).toThrow("invoiceNumber");
  });

  test("maps standard county fees to schedule values", () => {
    expect(lookupBillingScheduleValue("$570.00")).toBe("$1,070");
    expect(lookupBillingScheduleValue("$6,870.00")).toBe("$7,870");
  });

  test("maps expedited county fees by doubling county cost only", () => {
    expect(lookupBillingScheduleValue("$1,140.00")).toBe("$1,640");
    expect(lookupBillingScheduleValue("$2,260.00")).toBe("$2,760");
  });
});
