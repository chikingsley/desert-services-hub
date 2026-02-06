/**
 * Extraction Validator Tests
 *
 * Tests for the extraction validation utilities.
 * Run with: bun test tests/lib/extraction-validator.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  formatValidationResult,
  type NoiExtraction,
  type PlanExtraction,
  validateNoiExtraction,
  validatePlanExtraction,
} from "./extraction-validator";

// =============================================================================
// Test: NOI Validation
// =============================================================================

describe("validateNoiExtraction", () => {
  const expectedNoi: NoiExtraction = {
    applicantName: "BJERK BUILDERS, LLC",
    applicantAddress1: "1383 N TECH BLVD",
    applicantAddress2: "STE 101",
    applicantCity: "GILBERT",
    applicantState: "AZ",
    applicantZip: "85233",
    siteName: "Innovative Commercial Building",
    siteAddress: null,
    latitude: 33.866_685,
    longitude: -112.148_648,
    acresDisturbed: 1.22,
    swpppContactFirstName: "Scott",
    swpppContactLastName: "Bjerk",
    swpppContactEmail: "scott@bjerkbuilders.com",
    swpppContactPhone: "(602) 291-9255",
    permitId: "AZC113509",
    ltfNumber: "113509",
    _extraction: {
      source: "noi",
      confidence: "high",
      missingFields: ["siteAddress"],
      warnings: [],
    },
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
      field: "applicantCity",
      expected: "GILBERT",
      actual: "Phoenix",
    });
  });
});

// =============================================================================
// Test: Plan Validation
// =============================================================================

describe("validatePlanExtraction", () => {
  const expectedPlan: PlanExtraction = {
    projectName: "Southwest Gas Corporation Surprise Operation Center",
    projectLocation: "Section 13, T4N, R2W, Maricopa County, Arizona",
    acreage: 7.2743,
    owner: "Southwest Gas Corporation",
    engineer: "Bowman Consulting",
    contractor: "Summit Construction of Nevada, Inc.",
    dustControlMeasures: {
      categoryA: {},
      categoryB: {},
      categoryC: {},
      categoryE: {},
      categoryK: {},
    },
    sedimentControls: [],
    _extraction: {
      source: "plan",
      confidence: "high",
      documentType: "SWPPP",
      pages: 5,
      missingCategories: [],
      warnings: [],
    },
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
      valid: true,
      score: 100,
      matchedFields: ["applicantName", "siteName"],
      mismatchedFields: [],
      missingFields: [],
      extraFields: [],
    });
    expect(output).toContain("PASSED");
    expect(output).toContain("100%");
  });

  test("formats failing result with details", () => {
    const output = formatValidationResult({
      valid: false,
      score: 50,
      matchedFields: ["applicantName"],
      mismatchedFields: [{ field: "siteName", expected: "A", actual: "B" }],
      missingFields: ["latitude"],
      extraFields: [],
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
