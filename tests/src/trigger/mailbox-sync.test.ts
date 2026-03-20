import { describe, expect, test } from "bun:test";
import {
  detectDustPermitAutoDraftSeed,
  htmlToText,
} from "@/apps/trigger-dev/src/trigger/mailbox-sync";

describe("htmlToText", () => {
  test("preserves separators between adjacent HTML nodes", () => {
    const html =
      "<div>Drew Butler <a>dbutler@willmeng.com</a><span>Willmeng Construction</span></div>";

    expect(htmlToText(html)).toBe(
      "Drew Butler dbutler@willmeng.com Willmeng Construction"
    );
  });

  test("normalizes repeated whitespace and nbsp entities", () => {
    const html = "<p>Contracts&nbsp;<strong>contracts@constructable.pro</strong></p>";

    expect(htmlToText(html)).toBe("Contracts contracts@constructable.pro");
  });
});

describe("detectDustPermitAutoDraftSeed", () => {
  test("detects point and pay billing emails", () => {
    expect(
      detectDustPermitAutoDraftSeed({
        bodyText: `Please see below for the details of your payment:

Product: Invoices - Account Number: IV089541 - Amount: $570.00

Sub Total: $570.00`,
        fromEmail: "noreply@pointandpay.com",
        subject: "Your Maricopa Air Quality payment has been approved",
      })
    ).toEqual({ kind: "billing" });
  });

  test("detects maricopa issued emails with permit id", () => {
    expect(
      detectDustPermitAutoDraftSeed({
        bodyText: `The Maricopa County Air Quality dust control permit application D0065403 has been processed and approved.

Facility ID#: F056473
Facility Name: GSQ Buildings B1-1, B1-2, & D1-2`,
        fromEmail: "no-reply@maricopa.gov",
        subject: "Dust Permit Issued",
      })
    ).toEqual({ kind: "issued", permitId: "D0065403" });
  });
});
