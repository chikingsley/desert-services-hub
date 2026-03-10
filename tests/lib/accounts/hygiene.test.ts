import { describe, expect, test } from "bun:test";
import {
  isLowSignalAccountName,
  repairAccountDomain,
} from "@accounts/hygiene";

describe("repairAccountDomain", () => {
  test("trims appended body text after a valid domain", () => {
    expect(repairAccountDomain("willmeng.comreply")).toBe("willmeng.com");
    expect(repairAccountDomain("bprcompanies.com.an")).toBe("bprcompanies.com");
    expect(repairAccountDomain("https://www.mycon.comthanks/path")).toBe(
      "mycon.com"
    );
  });

  test("rejects malformed values without a valid domain prefix", () => {
    expect(repairAccountDomain("8...client")).toBeNull();
    expect(repairAccountDomain("not-a-domain")).toBeNull();
  });
});

describe("isLowSignalAccountName", () => {
  test("flags known junk account names", () => {
    expect(isLowSignalAccountName("Contracts")).toBe(true);
    expect(isLowSignalAccountName("Construction Accounting")).toBe(true);
    expect(isLowSignalAccountName("Please Sign Bid Package")).toBe(true);
  });

  test("keeps real company names", () => {
    expect(isLowSignalAccountName("Willmeng Construction")).toBe(false);
    expect(isLowSignalAccountName("Embree Construction Group")).toBe(false);
  });
});
