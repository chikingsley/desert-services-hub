/**
 * Reconciliation Schema
 *
 * Schema for comparing estimate vs contract with math verification.
 * Based on the working pattern from ground-truth notes.
 *
 * Key features:
 * - KEPT/REMOVED/ADDED/? status tracking for each line item
 * - Math check that must balance
 * - Notes for discrepancies
 */
import { z } from "zod";

// ============================================
// Line Item Status
// ============================================

export const LineItemStatusSchema = z.enum([
  "KEPT", // In estimate, also in contract
  "REMOVED", // In estimate, NOT in contract
  "ADDED", // NOT in estimate, IS in contract
  "?", // Unclear - needs manual review
]);

export type LineItemStatus = z.infer<typeof LineItemStatusSchema>;

// ============================================
// Line Item Schema
// ============================================

export const ReconciliationLineItemSchema = z.object({
  description: z.string().describe("Description of the line item"),
  status: LineItemStatusSchema.describe(
    "Status of this item in reconciliation"
  ),
  estimateAmount: z
    .number()
    .nullable()
    .describe("Amount from estimate (null if ADDED)"),
  contractAmount: z
    .number()
    .nullable()
    .describe("Amount from contract (null if REMOVED)"),
  quantity: z.number().nullable().describe("Quantity if applicable"),
  unitPrice: z.number().nullable().describe("Unit price if applicable"),
  note: z
    .string()
    .nullable()
    .describe("Explanation for removal, addition, or discrepancy"),
});

export type ReconciliationLineItem = z.infer<
  typeof ReconciliationLineItemSchema
>;

// ============================================
// Math Check Schema
// ============================================

export const MathCheckSchema = z.object({
  keptTotal: z.number().describe("Sum of all KEPT items"),
  removedTotal: z
    .number()
    .describe("Sum of all REMOVED items (positive number)"),
  addedTotal: z.number().describe("Sum of all ADDED items"),
  calculated: z
    .number()
    .describe("Estimate - Removed + Added (should equal contract)"),
  matches: z.boolean().describe("Whether calculated equals contract total"),
  variance: z.number().describe("Difference if any (calculated - contract)"),
});

export type MathCheck = z.infer<typeof MathCheckSchema>;

// ============================================
// Unit Rate Schema (for extras/changes)
// ============================================

export const UnitRateSchema = z.object({
  item: z.string().describe("Item description"),
  estimateRate: z.number().nullable().describe("Our quoted rate"),
  contractRate: z.number().nullable().describe("Rate in contract"),
  unit: z.string().describe("Unit of measure (e.g., 'ea', 'LF', 'mo')"),
  note: z.string().nullable().describe("Note about rate discrepancy"),
});

export type UnitRate = z.infer<typeof UnitRateSchema>;

// ============================================
// Reconciliation Output Schema
// ============================================

export const ReconciliationOutputSchema = z.object({
  // Summary
  estimateNumber: z.string().nullable().describe("Estimate number/ID"),
  estimateDate: z.string().nullable().describe("Date of estimate"),
  estimateTotal: z.number().describe("Total from estimate"),
  contractTotal: z.number().describe("Total from contract"),
  difference: z.number().describe("Contract - Estimate (can be negative)"),

  // Line Items
  lineItems: z
    .array(ReconciliationLineItemSchema)
    .describe("All line items with their status"),

  // Math Verification
  mathCheck: MathCheckSchema.describe("Verification that totals balance"),

  // Unit Rates (for extras)
  unitRates: z
    .array(UnitRateSchema)
    .describe("Unit rates for change orders/extras"),

  // Outcome
  outcome: z
    .enum(["RECONCILED", "MISMATCH", "NEEDS_CLARIFICATION"])
    .describe("Overall reconciliation result"),

  // Flags
  flags: z
    .array(
      z.object({
        type: z.enum([
          "MISSING_MOBILIZATION",
          "INSPECTION_QUANTITY_UNCLEAR",
          "RATE_DISCREPANCY",
          "SCOPE_AMBIGUITY",
          "MATH_ERROR",
          "OTHER",
        ]),
        description: z.string(),
        severity: z.enum(["error", "warning", "info"]),
      })
    )
    .describe("Issues found during reconciliation"),

  // Notes
  notes: z
    .array(z.string())
    .describe("Free-form notes about the reconciliation"),
});

export type ReconciliationOutput = z.infer<typeof ReconciliationOutputSchema>;

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate the math check from line items.
 */
export function calculateMathCheck(
  estimateTotal: number,
  contractTotal: number,
  lineItems: ReconciliationLineItem[]
): MathCheck {
  let keptTotal = 0;
  let removedTotal = 0;
  let addedTotal = 0;

  for (const item of lineItems) {
    switch (item.status) {
      case "KEPT":
        // Use contract amount if available, otherwise estimate
        keptTotal += item.contractAmount ?? item.estimateAmount ?? 0;
        break;
      case "REMOVED":
        removedTotal += item.estimateAmount ?? 0;
        break;
      case "ADDED":
        addedTotal += item.contractAmount ?? 0;
        break;
      case "?":
        // Unclear items - add to kept for calculation but flag
        keptTotal += item.contractAmount ?? item.estimateAmount ?? 0;
        break;
      default:
        // Unknown status - treat as kept
        keptTotal += item.contractAmount ?? item.estimateAmount ?? 0;
        break;
    }
  }

  const calculated = estimateTotal - removedTotal + addedTotal;
  const variance = calculated - contractTotal;

  // Allow for small floating point errors
  const matches = Math.abs(variance) < 0.01;

  return {
    keptTotal,
    removedTotal,
    addedTotal,
    calculated,
    matches,
    variance,
  };
}

/**
 * Validate that a reconciliation output is internally consistent.
 */
export function validateReconciliation(output: ReconciliationOutput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Verify math check
  const recalculated = calculateMathCheck(
    output.estimateTotal,
    output.contractTotal,
    output.lineItems
  );

  if (Math.abs(recalculated.keptTotal - output.mathCheck.keptTotal) > 0.01) {
    errors.push(
      `Kept total mismatch: reported ${output.mathCheck.keptTotal}, calculated ${recalculated.keptTotal}`
    );
  }

  if (
    Math.abs(recalculated.removedTotal - output.mathCheck.removedTotal) > 0.01
  ) {
    errors.push(
      `Removed total mismatch: reported ${output.mathCheck.removedTotal}, calculated ${recalculated.removedTotal}`
    );
  }

  if (Math.abs(recalculated.addedTotal - output.mathCheck.addedTotal) > 0.01) {
    errors.push(
      `Added total mismatch: reported ${output.mathCheck.addedTotal}, calculated ${recalculated.addedTotal}`
    );
  }

  // Check that outcome matches math result
  if (output.mathCheck.matches && output.outcome === "MISMATCH") {
    errors.push("Outcome is MISMATCH but math check passes");
  }

  if (!output.mathCheck.matches && output.outcome === "RECONCILED") {
    errors.push(
      `Outcome is RECONCILED but math check fails (variance: ${output.mathCheck.variance})`
    );
  }

  // Check for missing mobilization if BMP items exist
  const hasBMPInstall = output.lineItems.some(
    (item) =>
      item.status !== "REMOVED" &&
      (item.description.toLowerCase().includes("filter sock") ||
        item.description.toLowerCase().includes("rock entrance") ||
        item.description.toLowerCase().includes("inlet protection") ||
        item.description.toLowerCase().includes("ccw") ||
        item.description.toLowerCase().includes("curb protection"))
  );

  const hasMobilization = output.lineItems.some(
    (item) =>
      item.status !== "REMOVED" &&
      item.description.toLowerCase().includes("mobilization")
  );

  if (hasBMPInstall && !hasMobilization) {
    const alreadyFlagged = output.flags.some(
      (f) => f.type === "MISSING_MOBILIZATION"
    );
    if (!alreadyFlagged) {
      errors.push(
        "BMP install items present but no mobilization - should be flagged"
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format reconciliation as markdown for notes.md style output.
 */
export function formatReconciliationMarkdown(
  output: ReconciliationOutput
): string {
  const lines: string[] = [];

  lines.push("## Reconciliation");
  lines.push("");
  lines.push(`Estimate: $${output.estimateTotal.toLocaleString()}`);
  lines.push(`Contract: $${output.contractTotal.toLocaleString()}`);
  lines.push(`Difference: $${output.difference.toLocaleString()}`);
  lines.push("");

  // Line items
  for (const item of output.lineItems) {
    const amount = item.contractAmount ?? item.estimateAmount ?? 0;
    const sign = item.status === "REMOVED" ? "-" : "+";
    const prefix = `(${item.status}${item.status === "REMOVED" ? ` ${sign}$${Math.abs(amount).toLocaleString()}` : ""})`;

    let line = `${prefix} ${item.description}`;
    if (item.quantity && item.unitPrice) {
      line += ` — ${item.quantity} @ $${item.unitPrice}`;
    } else if (amount && item.status !== "REMOVED") {
      line += ` — $${amount.toLocaleString()}`;
    }
    if (item.note) {
      line += ` — ${item.note}`;
    }
    lines.push(line);
  }

  lines.push("");
  lines.push(`Kept total: $${output.mathCheck.keptTotal.toLocaleString()}`);
  lines.push(
    `Removed total: -$${output.mathCheck.removedTotal.toLocaleString()}`
  );
  lines.push(`Added total: +$${output.mathCheck.addedTotal.toLocaleString()}`);
  lines.push(
    `$${output.estimateTotal.toLocaleString()} - $${output.mathCheck.removedTotal.toLocaleString()} + $${output.mathCheck.addedTotal.toLocaleString()} = $${output.mathCheck.calculated.toLocaleString()} ${output.mathCheck.matches ? "✓ RECONCILES" : `✗ MISMATCH ($${output.mathCheck.variance.toLocaleString()} off)`}`
  );

  // Flags
  if (output.flags.length > 0) {
    lines.push("");
    lines.push("### Flags");
    for (const flag of output.flags) {
      lines.push(
        `- [${flag.severity.toUpperCase()}] ${flag.type}: ${flag.description}`
      );
    }
  }

  // Notes
  if (output.notes.length > 0) {
    lines.push("");
    lines.push("### Notes");
    for (const note of output.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}
