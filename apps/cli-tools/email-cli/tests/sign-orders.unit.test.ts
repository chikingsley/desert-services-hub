import { describe, expect, test } from "bun:test";
import {
  buildSignOrderDetails,
  buildSignOrderSubject,
  formatSignOrderDate,
} from "@email/sign-orders";

describe("sign-order builder", () => {
  test("builds SWPPP sign details", () => {
    const details = buildSignOrderDetails({
      signType: "swppp-sign",
      projectName: "Lexington 420",
      companyName: "Bayley Construction",
      noiAzc: "AZC112779",
      quantity: 2,
    });

    expect(details).toContain("[SWPPP SIGN INFORMATION]");
    expect(details).toContain("Lexington 420");
    expect(details).toContain("AZC # AZC112779");
    expect(details).toContain("Quantity: 2");
  });

  test("requires NOI for SWPPP sign", () => {
    expect(() =>
      buildSignOrderDetails({
        signType: "swppp-sign",
        projectName: "Lexington 420",
      })
    ).toThrow("Missing required field: noiAzc");
  });

  test("builds Maricopa dust details with permit fallback", () => {
    const details = buildSignOrderDetails({
      signType: "dust-maricopa",
      projectName: "Shops H",
      companyName: "Bayley Construction",
      permitId: "D0064501",
      contactName: "Scott Turner",
      contactPhone: "623-202-5233",
      quantity: 1,
    });

    expect(details).toContain("[DUST SIGN INFORMATION MARICOPA]");
    expect(details).toContain("Facility ID: D0064501");
    expect(details).toContain("Scott Turner: 623-202-5233");
  });

  test("requires address for fire access sign", () => {
    expect(() =>
      buildSignOrderDetails({
        signType: "fire-access",
        projectName: "Shops H",
        contactName: "Scott Turner",
        contactPhone: "623-202-5233",
      })
    ).toThrow("Missing required field: address");
  });

  test("formats date and subject", () => {
    const date = new Date(Date.UTC(2026, 1, 12));
    expect(formatSignOrderDate(date)).toBe("02.12.26");

    const subject = buildSignOrderSubject({
      signType: "dust-maricopa",
      projectName: "Lexington 420",
      date,
    });

    expect(subject).toBe("02.12.26 Maricopa dust sign order - Lexington 420");
  });
});
