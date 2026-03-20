import { describe, expect, test } from "bun:test";

import { resolveManualBillingPermitBaseVars } from "../../../apps/trigger-dev/src/trigger/dust-permit-manual-billing";

describe("manual permit billing base vars", () => {
  test("builds billing vars without requiring a permit row", () => {
    expect(
      resolveManualBillingPermitBaseVars({
        accountName: "Desert Services",
        acceleratedProcessing: "No",
        address: "1 E CONGRESS ST, TUCSON, AZ 85701",
        applicationLabel: "Record #",
        applicationNumber: "26TMP-003740",
        introText:
          "A fugitive dust activity permit has been submitted to Pima County. Please prepare for billing.",
        invoiceLabel: "Record #",
        permitNumber: "P26FD0064",
        permitCostLabel: "Permit Cost (County)",
        permitLabel: "Permit #",
        projectName: "1 E CONGRESS ST - TUCSON",
        recipientName: "Team",
        scheduleLabel: "Schedule Charge",
      })
    ).toEqual({
      acceleratedProcessing: "No",
      accountName: "Desert Services",
      address: "1 E CONGRESS ST, TUCSON, AZ 85701",
      applicationLabel: "Record #",
      applicationNumber: "26TMP-003740",
      introText:
        "A fugitive dust activity permit has been submitted to Pima County. Please prepare for billing.",
      invoiceLabel: "Record #",
      permitNumber: "P26FD0064",
      permitCostLabel: "Permit Cost (County)",
      permitLabel: "Permit #",
      projectName: "1 E CONGRESS ST - TUCSON",
      recipientName: "Team",
      scheduleLabel: "Schedule Charge",
      supersededApplicationNumber: "N/A",
    });
  });
});
