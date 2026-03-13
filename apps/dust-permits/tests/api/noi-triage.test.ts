import { describe, expect, test } from "bun:test";
import {
  isMaricopaCountyCode,
  normalizeNoiIdentifier,
} from "@/lib/noi-endpoints";
import {
  evaluateParcelAcreageDecision,
  getMaricopaPermitPricingTier,
} from "@/lib/noi-triage";

describe("NOI identifier parsing", () => {
  test("parses AZC identifiers", () => {
    const parsed = normalizeNoiIdentifier("AZC114575");
    expect(parsed.detectedFrom).toBe("azc");
    expect(parsed.ltfId).toBe("114575");
    expect(parsed.permitAuthCode).toBe("AZC114575");
  });

  test("parses LTF identifiers", () => {
    const parsed = normalizeNoiIdentifier("LTF#114575");
    expect(parsed.detectedFrom).toBe("ltf");
    expect(parsed.ltfId).toBe("114575");
    expect(parsed.permitAuthCode).toBeNull();
  });

  test("parses bare numeric identifiers", () => {
    const parsed = normalizeNoiIdentifier("114575");
    expect(parsed.detectedFrom).toBe("digits");
    expect(parsed.ltfId).toBe("114575");
  });
});

describe("NOI county + acreage triage", () => {
  test("accepts Maricopa county codes", () => {
    expect(isMaricopaCountyCode("04013")).toBe(true);
    expect(isMaricopaCountyCode("MARICOPA")).toBe(true);
  });

  test("rejects non-Maricopa county codes", () => {
    expect(isMaricopaCountyCode("PINAL")).toBe(false);
    expect(isMaricopaCountyCode("04021")).toBe(false);
  });

  test("approves when parcel is >= disturbed and same pricing tier", () => {
    const decision = evaluateParcelAcreageDecision(64, 65);
    expect(decision.approved).toBe(true);
    expect(decision.disturbedTier).toBe("50-100");
    expect(decision.parcelTier).toBe("50-100");
  });

  test("fails when parcel is larger but in different pricing tier", () => {
    const decision = evaluateParcelAcreageDecision(64, 120);
    expect(decision.approved).toBe(false);
    expect(decision.parcelAtLeastDisturbed).toBe(true);
    expect(decision.samePricingTier).toBe(false);
    expect(decision.parcelTier).toBe("100-500");
  });

  test("fails when parcel is smaller even if tier matches", () => {
    const decision = evaluateParcelAcreageDecision(64, 60);
    expect(decision.approved).toBe(false);
    expect(decision.parcelAtLeastDisturbed).toBe(false);
    expect(decision.samePricingTier).toBe(true);
    expect(decision.parcelTier).toBe("50-100");
  });
});

describe("Maricopa pricing range boundaries", () => {
  test("maps acreage to expected permit tiers", () => {
    expect(getMaricopaPermitPricingTier(0.05)).toBeNull();
    expect(getMaricopaPermitPricingTier(0.1)).toBe("0.1-<1");
    expect(getMaricopaPermitPricingTier(0.99)).toBe("0.1-<1");
    expect(getMaricopaPermitPricingTier(1)).toBe("1-10");
    expect(getMaricopaPermitPricingTier(10)).toBe("1-10");
    expect(getMaricopaPermitPricingTier(10.01)).toBe("10-50");
    expect(getMaricopaPermitPricingTier(50)).toBe("10-50");
    expect(getMaricopaPermitPricingTier(50.01)).toBe("50-100");
    expect(getMaricopaPermitPricingTier(100)).toBe("50-100");
    expect(getMaricopaPermitPricingTier(100.01)).toBe("100-500");
    expect(getMaricopaPermitPricingTier(500)).toBe("100-500");
    expect(getMaricopaPermitPricingTier(500.01)).toBe("500+");
  });
});
