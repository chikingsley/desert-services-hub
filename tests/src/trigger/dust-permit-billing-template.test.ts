import { describe, expect, test } from "bun:test";

import {
  renderDustPermitBillingTemplate,
  type DustPermitBillingTemplateType,
  type DustPermitBillingTemplateVars,
} from "../../../apps/trigger-dev/src/trigger/dust-permit-billing-template";

const baseVars: DustPermitBillingTemplateVars = {
  acceleratedFee: "$1,130",
  acceleratedProcessing: "Yes",
  accountName: "NRP Contractors II LLC",
  address: "1517 S SIGNAL BUTTE RD, MESA",
  adminFee: "$500",
  applicationNumber: "D0065332",
  cardLastFour: "8113",
  cardholderName: "Company Card (ending 8113)",
  changesHtml: "<li><div>Expanded work area</div></li>",
  confirmationId: "193027887",
  invoiceDate: "03/04/2026 03:15 PM US Arizona",
  invoiceNumber: "IV089120",
  paymentDate: "03/04/2026 03:15 PM US Arizona",
  paymentMethod: "Credit Card",
  paymentMovedFromInvoiceNumber: "IV089000",
  permitCost: "$2,260.00",
  permitNumber: "F056454",
  projectName: "Medina Station Apartments",
  recipientName: "Team",
  scheduleValue: "$2,760",
  supersededApplicationNumber: "D0065000",
  vendorName: "Maricopa County ADEQ",
};

function separatorCount(body: string): number {
  return body.match(/<li><div>----<\/div><\/li>/g)?.length ?? 0;
}

describe("dust permit billing template layout", () => {
  test.each([
    "billing",
    "billing-renewed",
    "billing-revised",
  ] as const)(
    "uses the same sectioned layout for %s",
    (type: DustPermitBillingTemplateType) => {
      const { body } = renderDustPermitBillingTemplate(type, baseVars);

      expect(separatorCount(body)).toBe(2);
      expect(body).toContain("<b>Customer:</b> NRP Contractors II LLC");
      expect(body).toContain("<b>Vendor Paid:</b> Maricopa County ADEQ");
      expect(body).toContain("<b>Payment Method:</b> Credit Card");
    }
  );

  test("includes revision changes after the shared billing sections", () => {
    const { body } = renderDustPermitBillingTemplate(
      "billing-revised",
      baseVars
    );

    expect(body).toContain("<div><b>Changes Made:</b></div>");
    expect(body).toContain("Expanded work area");
  });

  test("supports manual label overrides for non-Maricopa billing", () => {
    const { body } = renderDustPermitBillingTemplate("billing", {
      ...baseVars,
      applicationLabel: "Record #",
      introText:
        "A fugitive dust activity permit has been submitted to Pima County. Please prepare for billing.",
      invoiceLabel: "Record #",
      permitCostLabel: "Permit Cost (County)",
      permitLabel: "Permit #",
    });

    expect(body).toContain(
      "A fugitive dust activity permit has been submitted to Pima County"
    );
    expect(body).toContain("<b>Record #:</b> D0065332");
    expect(body).toContain("<b>Permit #:</b> F056454");
    expect(body).toContain("<b>Permit Cost (County):</b> $2,260.00");
  });
});
