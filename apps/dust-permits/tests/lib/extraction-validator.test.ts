/**
 * Extraction Validator Tests
 *
 * Tests for the extraction validation utilities.
 * Run with: bun test tests/lib/extraction-validator.test.ts
 */

import { describe, expect, test } from "bun:test";
import type { NoiExtraction, PlanExtraction } from "./extraction-validator";
import {
  formatValidationResult,
  validateNoiExtraction,
  validatePlanExtraction,
} from "./extraction-validator";

// =============================================================================
// Test: NOI Validation
// =============================================================================

describe("validateNoiExtraction", () => {
  const expectedNoi: NoiExtraction = {
    _extraction: {
      source: "noi",
      confidence: "high",
      missingFields: ["siteAddress"],
      warnings: [],
    },
    acresDisturbed: 1.22,
    applicantAddress1: "1383 N TECH BLVD",
    applicantAddress2: "STE 101",
    applicantCity: "GILBERT",
    applicantName: "BJERK BUILDERS, LLC",
    applicantState: "AZ",
    applicantZip: "85233",
    latitude: 33.866_685,
    longitude: -112.148_648,
    ltfNumber: "113509",
    permitId: "AZC113509",
    siteAddress: null,
    siteName: "Innovative Commercial Building",
    swpppContactEmail: "scott@bjerkbuilders.com",
    swpppContactFirstName: "Scott",
    swpppContactLastName: "Bjerk",
    swpppContactPhone: "(602) 291-9255",
  };

  test("perfect match returns 100% score", () => {
    const result = validateNoiExtraction(expectedNoi, expectedNoi);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
    expect(result.mismatchedFields).toHaveLength(0);
    expect(result.missingFields).toHaveLength(0);
  });

  test("phone numbers match regardless of formatting", () => {
    const extracted = {
      ...expectedNoi,
      swpppContactPhone: "6022919255", // No formatting
    };
    const result = validateNoiExtraction(extracted, expectedNoi);
    expect(result.matchedFields).toContain("swpppContactPhone");
  });

  test("coordinates match with small tolerance", () => {
    const extracted = {
      ...expectedNoi,
      latitude: 33.866_685_1, // Slightly different
      longitude: -112.148_647_9,
    };
    const result = validateNoiExtraction(extracted, expectedNoi);
    expect(result.matchedFields).toContain("latitude");
    expect(result.matchedFields).toContain("longitude");
  });

  test("case-insensitive string matching", () => {
    const extracted = {
      ...expectedNoi,
      applicantName: "bjerk builders, llc", // lowercase
      applicantCity: "gilbert",
    };
    const result = validateNoiExtraction(extracted, expectedNoi);
    expect(result.matchedFields).toContain("applicantName");
    expect(result.matchedFields).toContain("applicantCity");
  });

  test("missing required field fails validation", () => {
    const extracted = {
      ...expectedNoi,
      applicantName: null, // Required field missing
    };
    const result = validateNoiExtraction(extracted, expectedNoi);
    expect(result.valid).toBe(false);
  });

  test("reports mismatched values correctly", () => {
    const extracted = {
      ...expectedNoi,
      applicantCity: "Phoenix", // Wrong city
    };
    const result = validateNoiExtraction(extracted, expectedNoi);
    expect(result.mismatchedFields).toContainEqual({
      actual: "Phoenix",
      expected: "GILBERT",
      field: "applicantCity",
    });
  });
});

// =============================================================================
// Test: Plan Validation
// =============================================================================

describe("validatePlanExtraction", () => {
  const expectedPlan: PlanExtraction = {
    _extraction: {
      source: "plan",
      confidence: "high",
      documentType: "SWPPP",
      pages: 5,
      missingCategories: [],
      warnings: [],
    },
    acreage: 7.2743,
    contractor: "Summit Construction of Nevada, Inc.",
    dustControlMeasures: {
      categoryA: {},
      categoryB: {},
      categoryC: {},
      categoryE: {},
      categoryK: {},
    },
    engineer: "Bowman Consulting",
    owner: "Southwest Gas Corporation",
    projectLocation: "Section 13, T4N, R2W, Maricopa County, Arizona",
    projectName: "Southwest Gas Corporation Surprise Operation Center",
    sedimentControls: [],
  };

  test("perfect match returns valid result", () => {
    const result = validatePlanExtraction(expectedPlan, expectedPlan);
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  test("requires projectName", () => {
    const extracted = {
      ...expectedPlan,
      projectName: null,
    };
    const result = validatePlanExtraction(extracted, expectedPlan);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("projectName");
  });

  test("requires dustControlMeasures", () => {
    const extracted = {
      ...expectedPlan,
      dustControlMeasures: undefined,
    };
    const result = validatePlanExtraction(
      extracted as Partial<PlanExtraction>,
      expectedPlan
    );
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Test: Format Validation Result
// =============================================================================

describe("formatValidationResult", () => {
  test("formats passing result", () => {
    const output = formatValidationResult({
      extraFields: [],
      matchedFields: ["applicantName", "siteName"],
      mismatchedFields: [],
      missingFields: [],
      score: 100,
      valid: true,
    });
    expect(output).toContain("PASSED");
    expect(output).toContain("100%");
  });

  test("formats failing result with details", () => {
    const output = formatValidationResult({
      extraFields: [],
      matchedFields: ["applicantName"],
      mismatchedFields: [{ field: "siteName", expected: "A", actual: "B" }],
      missingFields: ["latitude"],
      score: 50,
      valid: false,
    });
    expect(output).toContain("FAILED");
    expect(output).toContain("50%");
    expect(output).toContain("siteName");
    expect(output).toContain("latitude");
  });
});

// =============================================================================
// Test: Load Expected Fixtures
// =============================================================================

describe("Expected Fixtures", () => {
  test("NOI fixture loads and has required fields", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/expected/noi-bjerk-builders-113509.json"
    ).json();

    expect(fixture.applicantName).toBe("BJERK BUILDERS, LLC");
    expect(fixture.siteName).toBe("Innovative Commercial Building");
    expect(fixture.swpppContactEmail).toBe("scott@bjerkbuilders.com");
    expect(fixture.latitude).toBe(33.866_685);
    expect(fixture.ltfNumber).toBe("113509");
  });

  test("Plan fixture loads and has required fields", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/expected/plan-southwest-gas-surprise.json"
    ).json();

    expect(fixture.projectName).toBe(
      "Southwest Gas Corporation Surprise Operation Center"
    );
    expect(fixture.acreage).toBe(7.2743);
    expect(fixture.dustControlMeasures).toBeDefined();
    expect(fixture.dustControlMeasures.categoryE).toBeDefined();
  });
});
