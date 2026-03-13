import { describe, expect, test } from "bun:test";

const popupModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/create/popup.ts"
);

describe("companyRowMatchesName", () => {
  test("matches existing companies despite punctuation and case differences", async () => {
    const { companyRowMatchesName } = await import(
      `${popupModuleUrl}?company-row-match-${Date.now()}`
    );

    expect(
      companyRowMatchesName(
        "Stevens Leinweber Construction Inc",
        "STEVENS LEINWEBER CONSTRUCTION, INC."
      )
    ).toBe(true);
  });

  test("does not match unrelated company rows", async () => {
    const { companyRowMatchesName } = await import(
      `${popupModuleUrl}?company-row-miss-${Date.now()}`
    );

    expect(
      companyRowMatchesName(
        "True North Builders Inc",
        "STEVENS LEINWEBER CONSTRUCTION, INC."
      )
    ).toBe(false);
  });
});
