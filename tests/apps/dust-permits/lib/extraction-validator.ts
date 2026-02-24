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
  _extraction?: {
    source: "noi";
    confidence: "high" | "medium" | "low";
    missingFields: string[];
    warnings: string[];
  };
  acresDisturbed: number | null;
  applicantAddress1: string | null;
  applicantAddress2: string | null;
  applicantCity: string | null;
  applicantName: string | null;
  applicantState: string | null;
  applicantZip: string | null;
  latitude: number | null;
  longitude: number | null;
  ltfNumber: string | null;
  permitId: string | null;
  siteAddress: string | null;
  siteName: string | null;
  swpppContactEmail: string | null;
  swpppContactFirstName: string | null;
  swpppContactLastName: string | null;
  swpppContactPhone: string | null;
}

export interface PlanExtraction {
  _extraction?: {
    source: "plan";
    confidence: "high" | "medium" | "low";
    documentType: string;
    pages: number;
    missingCategories: string[];
    warnings: string[];
  };
  acreage: number | null;
  contractor: string | null;
  dustControlMeasures: Record<string, unknown>;
  engineer: string | null;
  owner: string | null;
  projectLocation: string | null;
  projectName: string | null;
  sedimentControls?: {
    bmp: string;
    name: string;
    location?: string;
  }[];
}

export interface ValidationResult {
  extraFields: string[];
  matchedFields: string[];
  mismatchedFields: {
    field: string;
    expected: unknown;
    actual: unknown;
  }[];
  missingFields: string[];
  score: number; // 0-100
  valid: boolean;
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
/** Compare a single field between actual and expected, categorizing the result. */
function compareField(
  field: string,
  actualValue: unknown,
  expectedValue: unknown
): {
  matched?: string;
  mismatched?: { field: string; actual: unknown; expected: unknown };
  missing?: string;
  extra?: string;
} {
  if (expectedValue === undefined || expectedValue === null) {
    if (actualValue !== undefined && actualValue !== null) {
      return { extra: field };
    }
    return {};
  }

  if (actualValue === undefined || actualValue === null) {
    return { missing: field };
  }

  if (valuesMatch(actualValue, expectedValue, field)) {
    return { matched: field };
  }

  return {
    mismatched: { field, actual: actualValue, expected: expectedValue },
  };
}

/** Compare dust control measures categories. */
function compareDustControlMeasures(
  actual: PlanExtraction["dustControlMeasures"],
  expected: PlanExtraction["dustControlMeasures"]
): {
  matched?: string;
  mismatched?: { field: string; actual: unknown; expected: unknown };
  missing?: string;
} {
  if (!expected) {
    return {};
  }
  if (!actual) {
    return { missing: "dustControlMeasures" };
  }

  const expectedCategories = Object.keys(expected);
  const actualCategories = Object.keys(actual);
  const allMatch = expectedCategories.every((c) =>
    actualCategories.includes(c)
  );

  if (allMatch) {
    return { matched: "dustControlMeasures" };
  }
  return {
    mismatched: {
      field: "dustControlMeasures",
      actual: actualCategories,
      expected: expectedCategories,
    },
  };
}

export function validatePlanExtraction(
  actual: Partial<PlanExtraction>,
  expected: PlanExtraction
): ValidationResult {
  const matchedFields: string[] = [];
  const mismatchedFields: ValidationResult["mismatchedFields"] = [];
  const missingFields: string[] = [];
  const extraFields: string[] = [];

  const simpleFields = [
    "projectName",
    "projectLocation",
    "acreage",
    "owner",
    "engineer",
    "contractor",
  ] as const;

  // Compare simple fields
  for (const field of simpleFields) {
    const result = compareField(field, actual[field], expected[field]);
    if (result.matched) {
      matchedFields.push(result.matched);
    }
    if (result.mismatched) {
      mismatchedFields.push(result.mismatched);
    }
    if (result.missing) {
      missingFields.push(result.missing);
    }
    if (result.extra) {
      extraFields.push(result.extra);
    }
  }

  // Compare dust control measures
  const dcResult = compareDustControlMeasures(
    actual.dustControlMeasures,
    expected.dustControlMeasures
  );
  if (dcResult.matched) {
    matchedFields.push(dcResult.matched);
  }
  if (dcResult.mismatched) {
    mismatchedFields.push(dcResult.mismatched);
  }
  if (dcResult.missing) {
    missingFields.push(dcResult.missing);
  }

  // Calculate score
  const totalFields = simpleFields.length + 1; // +1 for dustControlMeasures
  const score = Math.round((matchedFields.length / totalFields) * 100);
  const requiredFieldsMatch = PLAN_REQUIRED_FIELDS.every((f) =>
    matchedFields.includes(f)
  );

  return {
    extraFields,
    matchedFields,
    mismatchedFields,
    missingFields,
    score,
    valid: requiredFieldsMatch && score >= 70,
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
