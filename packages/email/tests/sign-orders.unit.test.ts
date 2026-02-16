import { describe, expect, test } from "bun:test";
import {
  buildSignOrderDetails,
  buildSignOrderSubject,
  formatSignOrderDate,
} from "@email/sign-orders";

const EMAIL_TESTS_ENABLED = process.env.ENABLE_EMAIL_TESTS === "1";
const describeEmailTests = EMAIL_TESTS_ENABLED ? describe : describe.skip;

describeEmailTests("sign-order builder", () => {
  test("builds SWPPP sign details", () => {
    const details = buildSignOrderDetails({
      companyName: "Bayley Construction",
      noiAzc: "AZC112779",
      projectName: "Lexington 420",
      quantity: 2,
      signType: "swppp-sign",
    });

    expect(details).toContain("[SWPPP SIGN INFORMATION]");
    expect(details).toContain("Lexington 420");
    expect(details).toContain("AZC # AZC112779");
    expect(details).toContain("Quantity: 2");
  });

  test("requires NOI for SWPPP sign", () => {
    expect(() =>
      buildSignOrderDetails({
        projectName: "Lexington 420",
        signType: "swppp-sign",
      })
    ).toThrow("Missing required field: noiAzc");
  });

  test("builds Maricopa dust details with permit fallback", () => {
    const details = buildSignOrderDetails({
      companyName: "Bayley Construction",
      contactName: "Scott Turner",
      contactPhone: "623-202-5233",
      permitId: "D0064501",
      projectName: "Shops H",
      quantity: 1,
      signType: "dust-maricopa",
    });

    expect(details).toContain("[DUST SIGN INFORMATION MARICOPA]");
    expect(details).toContain("Facility ID: D0064501");
    expect(details).toContain("Scott Turner: 623-202-5233");
  });

  test("requires address for fire access sign", () => {
    expect(() =>
      buildSignOrderDetails({
        contactName: "Scott Turner",
        contactPhone: "623-202-5233",
        projectName: "Shops H",
        signType: "fire-access",
      })
    ).toThrow("Missing required field: address");
  });

  test("formats date and subject", () => {
    const date = new Date(Date.UTC(2026, 1, 12));
    expect(formatSignOrderDate(date)).toBe("02.12.26");

    const subject = buildSignOrderSubject({
      date,
      projectName: "Lexington 420",
      signType: "dust-maricopa",
    });

    expect(subject).toBe("02.12.26 Maricopa dust sign order - Lexington 420");
  });
});
