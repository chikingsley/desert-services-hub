/**
 * reconcilePostK Tests
 *
 * Verifies that buildFormData's reconcilePostK step correctly enforces
 * category-to-postK consistency: acreage resolution, water tier derivation,
 * inactive section nulling, and special cases (D4, F1).
 */

import { describe, expect, test } from "bun:test";
import { buildFormData, getWaterTier } from "@/form-data";

describe("getWaterTier", () => {
  test("0-2 acres", () => {
    expect(getWaterTier(0)).toBe("0-2");
    expect(getWaterTier(1)).toBe("0-2");
    expect(getWaterTier(2)).toBe("0-2");
  });

  test("2-10 acres", () => {
    expect(getWaterTier(2.1)).toBe("2-10");
    expect(getWaterTier(5)).toBe("2-10");
    expect(getWaterTier(10)).toBe("2-10");
  });

  test("10-100 acres", () => {
    expect(getWaterTier(10.1)).toBe("10-100");
    expect(getWaterTier(50)).toBe("10-100");
    expect(getWaterTier(100)).toBe("10-100");
  });

  test("100+ acres", () => {
    expect(getWaterTier(100.1)).toBe("100+");
    expect(getWaterTier(500)).toBe("100+");
  });
});

describe("reconcilePostK", () => {
  test("site.acresDisturbed flows to active postK sections", () => {
    const data = buildFormData({
      overrides: { site: { acresDisturbed: 25 } },
    });

    // B1 applies by default -> should get 25 acres, tier "10-100"
    expect(data.postK.b1.avgDailyDisturbedAcres).toBe(25);
    expect(data.postK.b1.waterTier).toBe("10-100");

    // B2 applies by default -> should get 25 acres
    expect(data.postK.b2.avgDailyDisturbedAcres).toBe(25);
    expect(data.postK.b2.waterTier).toBe("10-100");
  });

  test("inactive categories get null postK acreage", () => {
    const data = buildFormData({
      overrides: { site: { acresDisturbed: 25 } },
    });

    // H applies=false by default -> postK.h should be null
    expect(data.categoryH.applies).toBe(false);
    expect(data.postK.h.avgDailyDisturbedAcres).toBeNull();

    // G1 applies=false by default -> postK.g1 should be null
    expect(data.categoryG1.applies).toBe(false);
    expect(data.postK.g1.avgDailyDisturbedAcres).toBeNull();

    // I1 applies=false by default -> postK.i1 should be null
    expect(data.categoryI1.applies).toBe(false);
    expect(data.postK.i1.avgDailyDisturbedAcres).toBeNull();

    // J applies=false by default -> postK.j should be null
    expect(data.categoryJ.applies).toBe(false);
    expect(data.postK.j.avgDailyDisturbedAcres).toBeNull();
  });

  test("always-on sections (c2, c3, i2) get acreage regardless", () => {
    const data = buildFormData({
      overrides: { site: { acresDisturbed: 8 } },
    });

    // C2, C3, I2 have no applies flag -> always active
    expect(data.postK.c2.avgDailyDisturbedAcres).toBe(8);
    expect(data.postK.c2.waterTier).toBe("2-10");

    expect(data.postK.c3.avgDailyDisturbedAcres).toBe(8);
    expect(data.postK.c3.waterTier).toBe("2-10");

    expect(data.postK.i2.avgDailyDisturbedAcres).toBe(8);
    expect(data.postK.i2.waterTier).toBe("2-10");
  });

  test("explicit postK acreage takes priority over site acreage", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 25 },
        postK: { b1: { avgDailyDisturbedAcres: 5 } },
      },
    });

    // Explicit postK value wins
    expect(data.postK.b1.avgDailyDisturbedAcres).toBe(5);
    expect(data.postK.b1.waterTier).toBe("2-10");

    // Other sections still use site fallback
    expect(data.postK.b2.avgDailyDisturbedAcres).toBe(25);
  });

  test("category-specific acreage wins over site fallback", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 25 },
        categoryB1: { applies: true, avgDailyDisturbedAcres: 3 },
      },
    });

    // Category acreage (3) wins over site (25)
    expect(data.postK.b1.avgDailyDisturbedAcres).toBe(3);
    expect(data.postK.b1.waterTier).toBe("2-10");
  });

  test("explicit postK acreage wins over category acreage", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 25 },
        categoryB1: { applies: true, avgDailyDisturbedAcres: 3 },
        postK: { b1: { avgDailyDisturbedAcres: 1 } },
      },
    });

    // Explicit postK (1) > category (3) > site (25)
    expect(data.postK.b1.avgDailyDisturbedAcres).toBe(1);
    expect(data.postK.b1.waterTier).toBe("0-2");
  });

  test("turning category on activates its postK section", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 50 },
        categoryH: { applies: true },
      },
    });

    // H is now active -> should get site acreage
    expect(data.postK.h.avgDailyDisturbedAcres).toBe(50);
    expect(data.postK.h.waterTier).toBe("10-100");
  });

  test("turning category off nulls its postK section", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 50 },
        categoryB1: { applies: false },
        // Even with explicit postK override, inactive means null
        postK: { b1: { avgDailyDisturbedAcres: 10 } },
      },
    });

    // B1 turned off -> postK.b1 nulled regardless of override
    expect(data.postK.b1.avgDailyDisturbedAcres).toBeNull();
  });

  test("D4 cubic yards nulled when categoryD4 inactive", () => {
    const data = buildFormData({
      overrides: {
        categoryD4: { applies: false },
        postK: { d4: { cubicYardsImport: 100, cubicYardsExport: 200 } },
      },
    });

    expect(data.postK.d4.cubicYardsImport).toBeNull();
    expect(data.postK.d4.cubicYardsExport).toBeNull();
  });

  test("D4 cubic yards preserved when categoryD4 active", () => {
    const data = buildFormData({
      overrides: {
        postK: { d4: { cubicYardsImport: 100, cubicYardsExport: 200 } },
      },
    });

    // D4 applies=true by default
    expect(data.categoryD4.applies).toBe(true);
    expect(data.postK.d4.cubicYardsImport).toBe(100);
    expect(data.postK.d4.cubicYardsExport).toBe(200);
  });

  test("D4 defaults are populated when categoryD4 active and values missing", () => {
    const data = buildFormData({
      overrides: {
        categoryD4: { applies: true },
        postK: { d4: { cubicYardsImport: null, cubicYardsExport: null } },
      },
    });

    expect(data.postK.d4.cubicYardsImport).toBe(20);
    expect(data.postK.d4.cubicYardsExport).toBe(20);
  });

  test("F1 seasonal split resolved from category acreage", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 25 },
        categoryF1: {
          applies: true,
          avgDailyDisturbanceNovFeb: 15,
          avgDailyDisturbanceMarOct: 20,
        },
      },
    });

    // Category-specific seasonal values win over site fallback
    expect(data.postK.f1NovFeb.avgDailyDisturbedAcres).toBe(15);
    expect(data.postK.f1MarOct.avgDailyDisturbedAcres).toBe(20);
  });

  test("F1 falls back to site acreage when no category acreage", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 30 },
        categoryF1: { applies: true },
      },
    });

    // No category-specific values -> site fallback
    expect(data.postK.f1NovFeb.avgDailyDisturbedAcres).toBe(30);
    expect(data.postK.f1MarOct.avgDailyDisturbedAcres).toBe(30);
  });

  test("F1 nulled when categoryF1 inactive", () => {
    const data = buildFormData({
      overrides: {
        site: { acresDisturbed: 30 },
        categoryF1: { applies: false },
      },
    });

    expect(data.postK.f1NovFeb.avgDailyDisturbedAcres).toBeNull();
    expect(data.postK.f1MarOct.avgDailyDisturbedAcres).toBeNull();
  });

  test("zero site acreage means no fallback (null stays null)", () => {
    const data = buildFormData({
      overrides: { site: { acresDisturbed: 0 } },
    });

    // B1 applies by default, but site is 0 and no category/postK override -> null
    expect(data.postK.b1.avgDailyDisturbedAcres).toBeNull();
  });

  test("water tier derived correctly for various acreage values", () => {
    const small = buildFormData({
      overrides: { site: { acresDisturbed: 1.5 } },
    });
    expect(small.postK.c2.waterTier).toBe("0-2");

    const medium = buildFormData({
      overrides: { site: { acresDisturbed: 7 } },
    });
    expect(medium.postK.c2.waterTier).toBe("2-10");

    const large = buildFormData({
      overrides: { site: { acresDisturbed: 50 } },
    });
    expect(large.postK.c2.waterTier).toBe("10-100");

    const huge = buildFormData({
      overrides: { site: { acresDisturbed: 200 } },
    });
    expect(huge.postK.c2.waterTier).toBe("100+");
  });
});
