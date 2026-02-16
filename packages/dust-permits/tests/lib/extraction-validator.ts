/**
 * Extraction Validator Utilities
 *
 * Tools for validating Claude Code skill extractions against expected outputs.
 * Used to test extract-noi and extract-plan skills.
 *
 * Usage:
 *   import { validateNoiExtraction, validatePlanExtraction } from './extraction-validator';
 *
 *   const extracted = { ... }; // Output from skill
 *   const expected = await Bun.file('tests/fixtures/expected/noi-xxx.json').json();
 *   const result = validateNoiExtraction(extracted, expected);
 */

// =============================================================================
// Types
// =============================================================================

export interface NoiExtraction {
  applicantName: string | null;
  applicantAddress1: string | null;
  applicantAddress2: string | null;
  applicantCity: string | null;
  applicantState: string | null;
  applicantZip: string | null;
  siteName: string | null;
  siteAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  acresDisturbed: number | null;
  swpppContactFirstName: string | null;
  swpppContactLastName: string | null;
  swpppContactEmail: string | null;
  swpppContactPhone: string | null;
  permitId: string | null;
  ltfNumber: string | null;
  _extraction?: {
    source: "noi";
    confidence: "high" | "medium" | "low";
    missingFields: string[];
    warnings: string[];
  };
}

export interface PlanExtraction {
  projectName: string | null;
  projectLocation: string | null;
  acreage: number | null;
  owner: string | null;
  engineer: string | null;
  contractor: string | null;
  dustControlMeasures: Record<string, unknown>;
  sedimentControls?: {
    bmp: string;
    name: string;
    location?: string;
  }[];
  _extraction?: {
    source: "plan";
    confidence: "high" | "medium" | "low";
    documentType: string;
    pages: number;
    missingCategories: string[];
    warnings: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  matchedFields: string[];
  mismatchedFields: {
    field: string;
    expected: unknown;
    actual: unknown;
  }[];
  missingFields: string[];
  extraFields: string[];
}

// =============================================================================
// NOI Validation
// =============================================================================

const NOI_REQUIRED_FIELDS = [
  "applicantName",
  "siteName",
  "swpppContactEmail",
] as const;

const NOI_ALL_FIELDS = [
  "applicantName",
  "applicantAddress1",
  "applicantAddress2",
  "applicantCity",
  "applicantState",
  "applicantZip",
  "siteName",
  "siteAddress",
  "latitude",
  "longitude",
  "acresDisturbed",
  "swpppContactFirstName",
  "swpppContactLastName",
  "swpppContactEmail",
  "swpppContactPhone",
  "permitId",
  "ltfNumber",
] as const;

/**
 * Validate an NOI extraction against expected output
 */
export function validateNoiExtraction(
  actual: Partial<NoiExtraction>,
  expected: NoiExtraction
): ValidationResult {
  const matchedFields: string[] = [];
  const mismatchedFields: ValidationResult["mismatchedFields"] = [];
  const missingFields: string[] = [];
  const extraFields: string[] = [];

  // Check all expected fields
  for (const field of NOI_ALL_FIELDS) {
    const expectedValue = expected[field];
    const actualValue = actual[field];

    if (expectedValue === undefined) {
      if (actualValue !== undefined && actualValue !== null) {
        extraFields.push(field);
      }
      continue;
    }

    if (actualValue === undefined) {
      missingFields.push(field);
      continue;
    }

    if (valuesMatch(actualValue, expectedValue, field)) {
      matchedFields.push(field);
    } else {
      mismatchedFields.push({
        actual: actualValue,
        expected: expectedValue,
        field,
      });
    }
  }

  // Calculate score
  const totalFields = NOI_ALL_FIELDS.length;
  const score = Math.round((matchedFields.length / totalFields) * 100);

  // Valid if all required fields match and score >= 80
  const requiredFieldsMatch = NOI_REQUIRED_FIELDS.every(
    (f) =>
      matchedFields.includes(f) || (expected[f] === null && actual[f] === null)
  );
  const valid = requiredFieldsMatch && score >= 80;

  return {
    extraFields,
    matchedFields,
    mismatchedFields,
    missingFields,
    score,
    valid,
  };
}

// =============================================================================
// Plan Validation
// =============================================================================

const PLAN_REQUIRED_FIELDS = ["projectName", "dustControlMeasures"] as const;

/**
 * Validate a plan extraction against expected output
 */
export function validatePlanExtraction(
  actual: Partial<PlanExtraction>,
  expected: PlanExtraction
): ValidationResult {
  const matchedFields: string[] = [];
  const mismatchedFields: ValidationResult["mismatchedFields"] = [];
  const missingFields: string[] = [];
  const extraFields: string[] = [];

  // Simple fields
  const simpleFields = [
    "projectName",
    "projectLocation",
    "acreage",
    "owner",
    "engineer",
    "contractor",
  ] as const;

  for (const field of simpleFields) {
    const expectedValue = expected[field];
    const actualValue = actual[field];

    if (expectedValue === undefined || expectedValue === null) {
      if (actualValue !== undefined && actualValue !== null) {
        extraFields.push(field);
      }
      continue;
    }

    if (actualValue === undefined || actualValue === null) {
      missingFields.push(field);
      continue;
    }

    if (valuesMatch(actualValue, expectedValue, field)) {
      matchedFields.push(field);
    } else {
      mismatchedFields.push({
        actual: actualValue,
        expected: expectedValue,
        field,
      });
    }
  }

  // Dust control measures - check if categories exist
  if (expected.dustControlMeasures && actual.dustControlMeasures) {
    const expectedCategories = Object.keys(expected.dustControlMeasures);
    const actualCategories = Object.keys(actual.dustControlMeasures);

    const matchingCategories = expectedCategories.filter((c) =>
      actualCategories.includes(c)
    );

    if (matchingCategories.length === expectedCategories.length) {
      matchedFields.push("dustControlMeasures");
    } else {
      mismatchedFields.push({
        actual: actualCategories,
        expected: expectedCategories,
        field: "dustControlMeasures",
      });
    }
  } else if (expected.dustControlMeasures && !actual.dustControlMeasures) {
    missingFields.push("dustControlMeasures");
  }

  // Calculate score
  const totalFields = simpleFields.length + 1; // +1 for dustControlMeasures
  const score = Math.round((matchedFields.length / totalFields) * 100);

  // Valid if required fields match and score >= 70
  const requiredFieldsMatch = PLAN_REQUIRED_FIELDS.every((f) =>
    matchedFields.includes(f)
  );
  const valid = requiredFieldsMatch && score >= 70;

  return {
    extraFields,
    matchedFields,
    mismatchedFields,
    missingFields,
    score,
    valid,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compare two values with field-specific logic
 */
function valuesMatch(
  actual: unknown,
  expected: unknown,
  field: string
): boolean {
  // Null handling
  if (expected === null) {
    return actual === null;
  }
  if (actual === null) {
    return false;
  }

  // Phone number normalization
  if (field.toLowerCase().includes("phone")) {
    return normalizePhone(String(actual)) === normalizePhone(String(expected));
  }

  // Numeric fields - allow small tolerance
  if (typeof expected === "number" && typeof actual === "number") {
    // Coordinates
    if (field === "latitude" || field === "longitude") {
      return Math.abs(actual - expected) < 0.0001;
    }
    // Acreage
    if (field.includes("acre") || field.includes("Acre")) {
      return Math.abs(actual - expected) < 0.01;
    }
    return actual === expected;
  }

  // String comparison - case insensitive, trim whitespace
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.toLowerCase().trim() === expected.toLowerCase().trim();
  }

  // Default strict comparison
  return actual === expected;
}

/**
 * Normalize phone number to digits only
 */
function normalizePhone(phone: string): string {
  return phone.replaceAll(/\D/g, "");
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`Validation ${result.valid ? "PASSED" : "FAILED"}`);
  lines.push(`Score: ${result.score}%`);
  lines.push("");

  if (result.matchedFields.length > 0) {
    lines.push(`Matched (${result.matchedFields.length}):`);
    for (const f of result.matchedFields) {
      lines.push(`  - ${f}`);
    }
  }

  if (result.mismatchedFields.length > 0) {
    lines.push("");
    lines.push(`Mismatched (${result.mismatchedFields.length}):`);
    for (const m of result.mismatchedFields) {
      lines.push(`  - ${m.field}:`);
      lines.push(`      expected: ${JSON.stringify(m.expected)}`);
      lines.push(`      actual:   ${JSON.stringify(m.actual)}`);
    }
  }

  if (result.missingFields.length > 0) {
    lines.push("");
    lines.push(`Missing (${result.missingFields.length}):`);
    for (const f of result.missingFields) {
      lines.push(`  - ${f}`);
    }
  }

  return lines.join("\n");
}
