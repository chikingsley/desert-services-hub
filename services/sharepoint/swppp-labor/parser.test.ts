/**
 * SWPPP Labor Service Tests
 *
 * Tests the labor estimation functions and validates rates
 * against expected behaviors from the V4 model.
 */

import { describe, expect, test } from "bun:test";
import {
  determineStatus,
  estimateLabor,
  formatWorkItems,
  LABOR_RATES,
  type WorkItem,
} from "./parser";

// ============================================================================
// Rate Validation (sanity checks on V4 model coefficients)
// ============================================================================

describe("Labor Rate Sanity", () => {
  test("install panel rate is in reasonable range (8-25 min/panel)", () => {
    expect(LABOR_RATES.installPanel).toBeGreaterThanOrEqual(8);
    expect(LABOR_RATES.installPanel).toBeLessThanOrEqual(25);
  });

  test("remove panel rate is faster than install", () => {
    expect(LABOR_RATES.removePanel).toBeLessThan(LABOR_RATES.installPanel);
  });

  test("remove panel rate is in reasonable range (2-10 min/panel)", () => {
    expect(LABOR_RATES.removePanel).toBeGreaterThanOrEqual(2);
    expect(LABOR_RATES.removePanel).toBeLessThanOrEqual(10);
  });

  test("relocate panel rate is between install and remove", () => {
    expect(LABOR_RATES.relocatePanel).toBeGreaterThan(LABOR_RATES.removePanel);
    expect(LABOR_RATES.relocatePanel).toBeLessThanOrEqual(
      LABOR_RATES.installPanel * 1.5
    );
  });

  test("sock install rate is in reasonable range (0.1-0.5 min/LF)", () => {
    expect(LABOR_RATES.installSockPerLF).toBeGreaterThanOrEqual(0.1);
    expect(LABOR_RATES.installSockPerLF).toBeLessThanOrEqual(0.5);
  });

  test("inlet protection rate is in reasonable range (10-30 min/inlet)", () => {
    expect(LABOR_RATES.installInlet).toBeGreaterThanOrEqual(10);
    expect(LABOR_RATES.installInlet).toBeLessThanOrEqual(30);
  });

  test("base setup time is reasonable (20-60 min)", () => {
    expect(LABOR_RATES.baseSetup).toBeGreaterThanOrEqual(20);
    expect(LABOR_RATES.baseSetup).toBeLessThanOrEqual(60);
  });
});

// ============================================================================
// estimateLabor() Tests
// ============================================================================

describe("estimateLabor", () => {
  test("returns 0 for empty work items", () => {
    expect(estimateLabor([])).toBe(0);
  });

  test("small panel install job is ~2-3 hours", () => {
    const items: WorkItem[] = [
      {
        action: "install",
        quantity: 10,
        unit: "panels",
        description: "install panels",
      },
    ];
    const mins = estimateLabor(items);
    // 10 panels * 12.7 + 41.4 base = ~168 min = ~2.8 hours
    expect(mins).toBeGreaterThanOrEqual(120); // At least 2 hours
    expect(mins).toBeLessThanOrEqual(240); // At most 4 hours
  });

  test("large panel install job is reasonable", () => {
    const items: WorkItem[] = [
      {
        action: "install",
        quantity: 50,
        unit: "panels",
        description: "install panels",
      },
    ];
    const mins = estimateLabor(items);
    // 50 * 12.7 + 41.4 = ~676 min = ~11.3 hours
    expect(mins).toBeGreaterThanOrEqual(500);
    expect(mins).toBeLessThanOrEqual(900);
  });

  test("sock install job is reasonable", () => {
    const items: WorkItem[] = [
      {
        action: "install",
        quantity: 500,
        unit: "sock_lf",
        description: "install sock",
      },
    ];
    const mins = estimateLabor(items);
    // 500 * 0.22 + 41.4 = ~151 min = ~2.5 hours
    expect(mins).toBeGreaterThanOrEqual(100);
    expect(mins).toBeLessThanOrEqual(250);
  });

  test("removal job is faster than equivalent install", () => {
    const installItems: WorkItem[] = [
      {
        action: "install",
        quantity: 20,
        unit: "panels",
        description: "install",
      },
    ];
    const removeItems: WorkItem[] = [
      { action: "remove", quantity: 20, unit: "panels", description: "remove" },
    ];
    expect(estimateLabor(removeItems)).toBeLessThan(
      estimateLabor(installItems)
    );
  });

  test("delivery adds flat time", () => {
    const deliveryItems: WorkItem[] = [
      {
        action: "deliver",
        quantity: 1,
        unit: "other",
        description: "deliver materials",
      },
    ];
    const mins = estimateLabor(deliveryItems);
    // base setup + delivery flat = 41.4 + 45 = 86.4
    expect(mins).toBeCloseTo(
      LABOR_RATES.baseSetup + LABOR_RATES.deliveryOnly,
      1
    );
  });

  test("narrative adds flat time", () => {
    const narrativeItems: WorkItem[] = [
      {
        action: "narrative",
        quantity: 1,
        unit: "other",
        description: "write narrative",
      },
    ];
    const mins = estimateLabor(narrativeItems);
    expect(mins).toBeCloseTo(LABOR_RATES.baseSetup + LABOR_RATES.narrative, 1);
  });
});

// ============================================================================
// determineStatus() Tests
// ============================================================================

describe("determineStatus", () => {
  test("returns 'Not started' by default", () => {
    expect(determineStatus(null, [])).toBe("Not started");
    expect(determineStatus("", [])).toBe("Not started");
    expect(determineStatus(0, [])).toBe("Not started");
  });

  test("returns 'In progress' when has scheduled date", () => {
    expect(determineStatus("2025-01-15", [])).toBe("In progress");
    expect(determineStatus(45_678, [])).toBe("In progress"); // Excel serial
  });

  test("returns 'In progress' when notes contain 'ready now'", () => {
    expect(determineStatus("", ["Ready now"])).toBe("In progress");
    expect(determineStatus("", ["READY NOW"])).toBe("In progress");
  });

  test("returns 'Done' when notes contain 'complete'", () => {
    expect(determineStatus("", ["Job complete"])).toBe("Done");
    expect(determineStatus("", ["Work completed"])).toBe("Done");
  });

  test("returns 'Done' when notes contain 'finished'", () => {
    expect(determineStatus("", ["All work finished"])).toBe("Done");
  });

  test("'complete' takes precedence over scheduled date", () => {
    expect(determineStatus("2025-01-15", ["Job complete"])).toBe("Done");
  });
});

// ============================================================================
// formatWorkItems() Tests
// ============================================================================

describe("formatWorkItems", () => {
  test("returns empty string for empty array", () => {
    expect(formatWorkItems([])).toBe("");
  });

  test("formats single item correctly", () => {
    const items: WorkItem[] = [
      {
        action: "install",
        quantity: 20,
        unit: "panels",
        description: "install panels",
      },
    ];
    expect(formatWorkItems(items)).toBe("install 20 panels");
  });

  test("formats multiple items with comma separation", () => {
    const items: WorkItem[] = [
      { action: "install", quantity: 20, unit: "panels", description: "" },
      { action: "install", quantity: 500, unit: "sock_lf", description: "" },
    ];
    expect(formatWorkItems(items)).toBe(
      "install 20 panels, install 500 sock lf"
    );
  });

  test("handles items without quantity", () => {
    const items: WorkItem[] = [
      {
        action: "deliver",
        quantity: null,
        unit: "other",
        description: "deliver materials",
      },
    ];
    expect(formatWorkItems(items)).toBe("deliver other");
  });

  test("replaces underscores with spaces in units", () => {
    const items: WorkItem[] = [
      { action: "install", quantity: 100, unit: "fence_lf", description: "" },
    ];
    expect(formatWorkItems(items)).toBe("install 100 fence lf");
  });
});
