/**
 * Cross-Document Validation
 *
 * Validate extraction output against business rules from PATTERNS.md.
 * Catches common issues before reconciliation and email drafting.
 */
import type {
  ContractExtractionOutput,
  ReconciliationOutput,
} from "../schemas";

// ============================================
// Types
// ============================================

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  /** Unique rule ID */
  ruleId: string;
  /** Human-readable rule name */
  ruleName: string;
  /** Severity level */
  severity: ValidationSeverity;
  /** Description of the issue */
  message: string;
  /** Which field(s) are affected */
  fields: string[];
  /** Suggested action */
  suggestion: string;
  /** Whether this requires human review */
  requiresReview: boolean;
}

export interface ValidationResult {
  /** Whether validation passed (no errors) */
  passed: boolean;
  /** Total issues found */
  totalIssues: number;
  /** Issues by severity */
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

// ============================================
// Validation Rules
// ============================================

type ValidationRule = (
  extraction: ContractExtractionOutput,
  reconciliation?: ReconciliationOutput
) => ValidationIssue | null;

/**
 * Rule: Tucson projects cannot have rock entrances.
 */
const ruleTucsonNoRock: ValidationRule = (extraction, reconciliation) => {
  const location = extraction.location.value?.toLowerCase() || "";
  const isTucson = location.includes("tucson") || location.includes("pima");

  if (!isTucson) return null;

  // Check reconciliation for rock entrance items
  if (reconciliation) {
    const hasRockEntrance = reconciliation.lineItems.some(
      (item) =>
        item.status !== "REMOVED" &&
        (item.description.toLowerCase().includes("rock entrance") ||
          item.description.toLowerCase().includes("stabilized entrance") ||
          item.description.toLowerCase().includes("track out grate"))
    );

    if (hasRockEntrance) {
      return {
        ruleId: "TUCSON_NO_ROCK",
        ruleName: "Tucson Rock Entrance",
        severity: "error",
        message:
          "Tucson project includes rock entrance - rock cannot be delivered to Tucson",
        fields: ["location", "reconciliation.lineItems"],
        suggestion: "Strike rock entrance items or flag as OUT OF SCOPE",
        requiresReview: true,
      };
    }
  }

  return null;
};

/**
 * Rule: Never agree to "assume responsibility for fines" language.
 */
const ruleNoFinesLiability: ValidationRule = (extraction) => {
  // Check notable terms for fines language
  for (const term of extraction.notableTerms) {
    const termLower = term.term.toLowerCase();
    const quoteLower = term.source.quote.toLowerCase();

    if (
      termLower.includes("responsibility for fines") ||
      termLower.includes("liable for fines") ||
      quoteLower.includes("assume responsibility for fines") ||
      quoteLower.includes("responsible for any fines")
    ) {
      return {
        ruleId: "NO_FINES_LIABILITY",
        ruleName: "Fines Liability",
        severity: "error",
        message:
          "Contract contains 'assume responsibility for fines' language - NEVER AGREE",
        fields: ["notableTerms"],
        suggestion:
          "Strike this language - Desert Services never accepts liability for GC fines",
        requiresReview: true,
      };
    }
  }

  return null;
};

/**
 * Rule: Inspection quantity must be specified.
 */
const ruleInspectionQuantity: ValidationRule = (extraction, reconciliation) => {
  if (!reconciliation) return null;

  // Find inspection line items
  const inspectionItems = reconciliation.lineItems.filter(
    (item) =>
      item.status !== "REMOVED" &&
      item.description.toLowerCase().includes("inspection")
  );

  for (const item of inspectionItems) {
    // Check if quantity is specified
    if (item.quantity === null || item.quantity === undefined) {
      return {
        ruleId: "INSPECTION_QUANTITY",
        ruleName: "Inspection Quantity",
        severity: "warning",
        message: `Inspection line item "${item.description}" has no quantity specified`,
        fields: ["reconciliation.lineItems"],
        suggestion:
          "Add redline with specific inspection count (e.g., '12 inspections included, extras at unit rate')",
        requiresReview: true,
      };
    }
  }

  return null;
};

/**
 * Rule: BMP install items require at least one mobilization.
 */
const ruleBMPMobilization: ValidationRule = (extraction, reconciliation) => {
  if (!reconciliation) return null;

  // Check for BMP install items
  const bmpKeywords = [
    "filter sock",
    "rock entrance",
    "inlet protection",
    "curb protection",
    "ccw",
    "concrete washout",
    "silt fence",
    "wattle",
  ];

  const hasBMPInstall = reconciliation.lineItems.some(
    (item) =>
      item.status !== "REMOVED" &&
      bmpKeywords.some((kw) => item.description.toLowerCase().includes(kw))
  );

  if (!hasBMPInstall) return null;

  // Check for mobilization
  const hasMobilization = reconciliation.lineItems.some(
    (item) =>
      item.status !== "REMOVED" &&
      item.description.toLowerCase().includes("mobilization")
  );

  if (!hasMobilization) {
    return {
      ruleId: "BMP_MOBILIZATION",
      ruleName: "BMP Mobilization",
      severity: "warning",
      message: "Contract includes BMP install items but no mobilization",
      fields: ["reconciliation.lineItems"],
      suggestion:
        "BMP installation requires at least 1 mobilization - flag with GC or add to scope",
      requiresReview: true,
    };
  }

  return null;
};

/**
 * Rule: Retention percentage should be explicit.
 */
const ruleExplicitRetention: ValidationRule = (extraction) => {
  if (extraction.retention.value === null) {
    return {
      ruleId: "EXPLICIT_RETENTION",
      ruleName: "Retention",
      severity: "info",
      message: "Retention percentage not specified in contract",
      fields: ["retention"],
      suggestion: "Confirm retention terms with GC before starting work",
      requiresReview: false,
    };
  }

  return null;
};

/**
 * Rule: Owner should be explicitly identified.
 */
const ruleExplicitOwner: ValidationRule = (extraction) => {
  if (extraction.owner.value === null) {
    return {
      ruleId: "EXPLICIT_OWNER",
      ruleName: "Owner Identity",
      severity: "info",
      message: "Owner not explicitly identified in contract",
      fields: ["owner"],
      suggestion:
        "May need owner info for dust permit filing - confirm with GC if needed",
      requiresReview: false,
    };
  }

  return null;
};

/**
 * Rule: Contact information should be complete.
 */
const ruleContactInfo: ValidationRule = (extraction) => {
  if (extraction.contacts.length === 0) {
    return {
      ruleId: "NO_CONTACTS",
      ruleName: "Contact Info",
      severity: "warning",
      message: "No contacts extracted from contract",
      fields: ["contacts"],
      suggestion: "Request PM and Superintendent contact info from GC",
      requiresReview: true,
    };
  }

  // Check for key roles
  const roles = new Set(extraction.contacts.map((c) => c.contact.role));

  if (!(roles.has("superintendent") || roles.has("project_manager"))) {
    return {
      ruleId: "MISSING_KEY_CONTACT",
      ruleName: "Key Contact Missing",
      severity: "info",
      message: "No PM or Superintendent contact in contract",
      fields: ["contacts"],
      suggestion: "Request site contact info from GC before work starts",
      requiresReview: false,
    };
  }

  return null;
};

/**
 * Rule: Certified payroll requirements must be clear.
 */
const ruleCertifiedPayroll: ValidationRule = (extraction) => {
  // If certified payroll is required, make sure type is specified
  if (
    extraction.certifiedPayroll.value?.required &&
    !extraction.certifiedPayroll.value.type
  ) {
    return {
      ruleId: "CERT_PAYROLL_TYPE",
      ruleName: "Certified Payroll Type",
      severity: "warning",
      message: "Certified payroll required but type not specified",
      fields: ["certifiedPayroll"],
      suggestion:
        "Confirm type (Davis-Bacon, HUD, State Prevailing Wage) with GC",
      requiresReview: true,
    };
  }

  return null;
};

/**
 * Rule: Rate discrepancies should be flagged.
 */
const ruleRateDiscrepancy: ValidationRule = (extraction, reconciliation) => {
  if (!reconciliation) return null;

  // Check unit rates for discrepancies
  for (const rate of reconciliation.unitRates) {
    if (
      rate.estimateRate !== null &&
      rate.contractRate !== null &&
      rate.estimateRate !== rate.contractRate
    ) {
      return {
        ruleId: "RATE_DISCREPANCY",
        ruleName: "Rate Discrepancy",
        severity: "warning",
        message: `Unit rate discrepancy for "${rate.item}": estimate $${rate.estimateRate}/${rate.unit} vs contract $${rate.contractRate}/${rate.unit}`,
        fields: ["reconciliation.unitRates"],
        suggestion: "Verify which rate applies and update estimate if needed",
        requiresReview: true,
      };
    }
  }

  return null;
};

/**
 * Rule: Textura/GCPay requirement should match billing platform.
 */
const ruleBillingPlatform: ValidationRule = (extraction, reconciliation) => {
  if (!reconciliation) return null;

  // Check if Textura/GCPay line item was removed
  const texturRemoved = reconciliation.lineItems.some(
    (item) =>
      item.status === "REMOVED" &&
      (item.description.toLowerCase().includes("textura") ||
        item.description.toLowerCase().includes("gcpay") ||
        item.description.toLowerCase().includes("procore"))
  );

  // Check billing platform
  const hasPlatform = extraction.billing.value?.platform !== null;

  if (texturRemoved && hasPlatform) {
    return {
      ruleId: "BILLING_PLATFORM_MISMATCH",
      ruleName: "Billing Platform",
      severity: "info",
      message:
        "Billing platform fee removed but platform specified in contract",
      fields: ["billing", "reconciliation.lineItems"],
      suggestion: "Verify whether portal fees should be included",
      requiresReview: false,
    };
  }

  return null;
};

// ============================================
// All Rules
// ============================================

const ALL_RULES: ValidationRule[] = [
  ruleTucsonNoRock,
  ruleNoFinesLiability,
  ruleInspectionQuantity,
  ruleBMPMobilization,
  ruleExplicitRetention,
  ruleExplicitOwner,
  ruleContactInfo,
  ruleCertifiedPayroll,
  ruleRateDiscrepancy,
  ruleBillingPlatform,
];

// ============================================
// Main Validation Function
// ============================================

/**
 * Run all validation rules against extraction output.
 */
export function validateExtraction(
  extraction: ContractExtractionOutput,
  reconciliation?: ReconciliationOutput
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  for (const rule of ALL_RULES) {
    const issue = rule(extraction, reconciliation);
    if (issue) {
      switch (issue.severity) {
        case "error":
          errors.push(issue);
          break;
        case "warning":
          warnings.push(issue);
          break;
        case "info":
          info.push(issue);
          break;
      }
    }
  }

  return {
    passed: errors.length === 0,
    totalIssues: errors.length + warnings.length + info.length,
    errors,
    warnings,
    info,
  };
}

/**
 * Check if OCR text contains specific red flag patterns.
 */
export function scanForRedFlags(ocrText: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const textLower = ocrText.toLowerCase();

  // Fines liability
  if (
    textLower.includes("assume responsibility for fines") ||
    textLower.includes("responsible for any fines") ||
    textLower.includes("liable for fines")
  ) {
    issues.push({
      ruleId: "RED_FLAG_FINES",
      ruleName: "Fines Liability Language",
      severity: "error",
      message: "Document contains fines liability language",
      fields: ["raw_text"],
      suggestion:
        "Review contract for 'assume responsibility for fines' and strike",
      requiresReview: true,
    });
  }

  // Indemnification concerns
  if (
    textLower.includes("indemnify and hold harmless") &&
    textLower.includes("negligence")
  ) {
    issues.push({
      ruleId: "RED_FLAG_INDEMNITY",
      ruleName: "Broad Indemnification",
      severity: "warning",
      message: "Contract contains broad indemnification language",
      fields: ["raw_text"],
      suggestion: "Review indemnification clause with legal if concerning",
      requiresReview: false,
    });
  }

  // No inspection quantity
  if (
    (textLower.includes("inspection") || textLower.includes("swppp")) &&
    !textLower.match(/\d+\s*(inspection|visit)/i)
  ) {
    issues.push({
      ruleId: "RED_FLAG_INSPECTION_QTY",
      ruleName: "Inspection Quantity Missing",
      severity: "warning",
      message: "Inspections mentioned but quantity not specified",
      fields: ["raw_text"],
      suggestion: "Redline to add specific inspection count",
      requiresReview: true,
    });
  }

  return issues;
}

// ============================================
// Format Helpers
// ============================================

/**
 * Format validation result as markdown.
 */
export function formatValidationMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push("## Validation Results");
  lines.push("");

  if (result.passed) {
    lines.push("✓ Validation passed (no errors)");
  } else {
    lines.push(`✗ Validation failed (${result.errors.length} errors)`);
  }

  lines.push(`Total issues: ${result.totalIssues}`);
  lines.push("");

  if (result.errors.length > 0) {
    lines.push("### Errors (must fix)");
    lines.push("");
    for (const issue of result.errors) {
      lines.push(`- **[${issue.ruleId}]** ${issue.message}`);
      lines.push(`  - ${issue.suggestion}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("### Warnings (should review)");
    lines.push("");
    for (const issue of result.warnings) {
      lines.push(`- **[${issue.ruleId}]** ${issue.message}`);
      lines.push(`  - ${issue.suggestion}`);
    }
    lines.push("");
  }

  if (result.info.length > 0) {
    lines.push("### Info");
    lines.push("");
    for (const issue of result.info) {
      lines.push(`- [${issue.ruleId}] ${issue.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get issues that require human review.
 */
export function getReviewRequired(result: ValidationResult): ValidationIssue[] {
  return [
    ...result.errors.filter((i) => i.requiresReview),
    ...result.warnings.filter((i) => i.requiresReview),
  ];
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  console.log(`
Validation Rules:

  TUCSON_NO_ROCK      - Tucson projects cannot have rock entrances
  NO_FINES_LIABILITY  - Never agree to fines liability language
  INSPECTION_QUANTITY - Inspection count must be specified
  BMP_MOBILIZATION    - BMP installs require mobilization
  EXPLICIT_RETENTION  - Retention should be explicit
  EXPLICIT_OWNER      - Owner should be identified
  NO_CONTACTS         - Contact info should be present
  CERT_PAYROLL_TYPE   - Certified payroll type should be specified
  RATE_DISCREPANCY    - Unit rate discrepancies should be flagged
  BILLING_PLATFORM    - Billing platform should match line items

Usage:
  Import and use validateExtraction() with extraction output.
  `);
}
