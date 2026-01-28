/**
 * Contract Reconciliation
 *
 * Compare estimate vs contract with KEPT/REMOVED/ADDED tracking
 * and math verification.
 *
 * Based on the working pattern from ground-truth notes.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculateMathCheck,
  formatReconciliationMarkdown,
  type ReconciliationLineItem,
  type ReconciliationOutput,
  ReconciliationOutputSchema,
  type UnitRate,
  validateReconciliation,
} from "../schemas";

// ============================================================================
// Regex Patterns (module-level for performance)
// ============================================================================

const RE_AMOUNT_MATCH = /\$?\s*([\d,]+\.?\d*)\s*$/;

// ============================================
// Types
// ============================================

export interface EstimateLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
}

export interface ContractLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
}

export interface ReconciliationInput {
  /** Estimate number/ID */
  estimateNumber: string | null;
  /** Estimate date */
  estimateDate: string | null;
  /** Estimate total */
  estimateTotal: number;
  /** Estimate line items */
  estimateItems: EstimateLineItem[];
  /** Contract total */
  contractTotal: number;
  /** Contract line items (from SOV or scope) */
  contractItems: ContractLineItem[];
  /** Contract unit rates for extras */
  contractUnitRates?: UnitRate[];
}

// ============================================
// Matching Functions
// ============================================

/**
 * Normalize description for matching.
 */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate similarity between two descriptions.
 */
function descriptionSimilarity(desc1: string, desc2: string): number {
  const norm1 = normalizeDescription(desc1);
  const norm2 = normalizeDescription(desc2);

  // Simple word overlap
  const words1 = new Set(norm1.split(" "));
  const words2 = new Set(norm2.split(" "));

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Find matching contract item for an estimate item.
 */
function findMatchingContractItem(
  estimateItem: EstimateLineItem,
  contractItems: ContractLineItem[],
  usedIndices: Set<number>
): { item: ContractLineItem; index: number } | null {
  let bestMatch: {
    item: ContractLineItem;
    index: number;
    score: number;
  } | null = null;

  for (let i = 0; i < contractItems.length; i++) {
    if (usedIndices.has(i)) {
      continue;
    }

    const score = descriptionSimilarity(
      estimateItem.description,
      contractItems[i].description
    );

    if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { item: contractItems[i], index: i, score };
    }
  }

  return bestMatch ? { item: bestMatch.item, index: bestMatch.index } : null;
}

// ============================================
// Reconciliation Functions
// ============================================

/**
 * Reconcile estimate against contract.
 */
export function reconcile(input: ReconciliationInput): ReconciliationOutput {
  const lineItems: ReconciliationLineItem[] = [];
  const usedContractIndices = new Set<number>();
  const flags: ReconciliationOutput["flags"] = [];
  const notes: string[] = [];

  // Process each estimate item
  for (const estItem of input.estimateItems) {
    const match = findMatchingContractItem(
      estItem,
      input.contractItems,
      usedContractIndices
    );

    if (match) {
      usedContractIndices.add(match.index);

      // Check if amounts match
      const amountDiff = Math.abs(estItem.amount - match.item.amount);
      const hasDiscrepancy = amountDiff > 0.01;

      lineItems.push({
        description: estItem.description,
        status: "KEPT",
        estimateAmount: estItem.amount,
        contractAmount: match.item.amount,
        quantity: match.item.quantity ?? estItem.quantity,
        unitPrice: match.item.unitPrice ?? estItem.unitPrice,
        note: hasDiscrepancy
          ? `Amount differs: est $${estItem.amount} vs contract $${match.item.amount}`
          : null,
      });
    } else {
      // Item removed from contract
      lineItems.push({
        description: estItem.description,
        status: "REMOVED",
        estimateAmount: estItem.amount,
        contractAmount: null,
        quantity: estItem.quantity,
        unitPrice: estItem.unitPrice,
        note: "Not in contract scope",
      });
    }
  }

  // Find items in contract but not in estimate (ADDED)
  for (let i = 0; i < input.contractItems.length; i++) {
    if (usedContractIndices.has(i)) {
      continue;
    }

    const contractItem = input.contractItems[i];

    lineItems.push({
      description: contractItem.description,
      status: "ADDED",
      estimateAmount: null,
      contractAmount: contractItem.amount,
      quantity: contractItem.quantity,
      unitPrice: contractItem.unitPrice,
      note: "Added in contract (not in original estimate)",
    });
  }

  // Calculate math check
  const mathCheck = calculateMathCheck(
    input.estimateTotal,
    input.contractTotal,
    lineItems
  );

  // Determine outcome
  let outcome: ReconciliationOutput["outcome"];
  if (mathCheck.matches) {
    outcome = "RECONCILED";
  } else if (Math.abs(mathCheck.variance) < input.estimateTotal * 0.05) {
    // Within 5% - might be rounding
    outcome = "NEEDS_CLARIFICATION";
    notes.push(
      `Variance of $${mathCheck.variance.toFixed(2)} (${((mathCheck.variance / input.contractTotal) * 100).toFixed(1)}%) - may be rounding difference`
    );
  } else {
    outcome = "MISMATCH";
    flags.push({
      type: "MATH_ERROR",
      description: `Reconciliation does not balance: variance of $${mathCheck.variance.toFixed(2)}`,
      severity: "error",
    });
  }

  // Check for common issues
  const hasBMPInstall = lineItems.some(
    (item) =>
      item.status !== "REMOVED" &&
      (item.description.toLowerCase().includes("filter sock") ||
        item.description.toLowerCase().includes("rock entrance") ||
        item.description.toLowerCase().includes("inlet protection"))
  );

  const hasMobilization = lineItems.some(
    (item) =>
      item.status !== "REMOVED" &&
      item.description.toLowerCase().includes("mobilization")
  );

  if (hasBMPInstall && !hasMobilization) {
    flags.push({
      type: "MISSING_MOBILIZATION",
      description: "BMP install items present but no mobilization",
      severity: "warning",
    });
  }

  // Check for unclear inspection quantity
  const inspectionItems = lineItems.filter(
    (item) =>
      item.status !== "REMOVED" &&
      item.description.toLowerCase().includes("inspection")
  );

  for (const item of inspectionItems) {
    if (item.quantity === null) {
      flags.push({
        type: "INSPECTION_QUANTITY_UNCLEAR",
        description: `Inspection item "${item.description}" has no quantity`,
        severity: "warning",
      });
    }
  }

  return {
    estimateNumber: input.estimateNumber,
    estimateDate: input.estimateDate,
    estimateTotal: input.estimateTotal,
    contractTotal: input.contractTotal,
    difference: input.contractTotal - input.estimateTotal,
    lineItems,
    mathCheck,
    unitRates: input.contractUnitRates ?? [],
    outcome,
    flags,
    notes,
  };
}

/**
 * Create a reconciliation from extracted data.
 */
export function reconcileFromExtraction(
  estimateOcrText: string,
  contractOcrText: string,
  estimateTotal: number,
  contractTotal: number
): ReconciliationOutput {
  // Parse estimate line items from OCR
  const estimateItems = parseLineItemsFromOCR(estimateOcrText);

  // Parse contract line items from OCR
  const contractItems = parseLineItemsFromOCR(contractOcrText);

  return reconcile({
    estimateNumber: null,
    estimateDate: null,
    estimateTotal,
    estimateItems,
    contractTotal,
    contractItems,
  });
}

/**
 * Parse line items from OCR text.
 * This is a heuristic - may need adjustment based on document format.
 */
export function parseLineItemsFromOCR(ocrText: string): EstimateLineItem[] {
  const items: EstimateLineItem[] = [];

  // Look for patterns like: "Description ... $XXX.XX" or "Description | Qty | Price | Total"
  const lines = ocrText.split("\n");

  for (const line of lines) {
    // Skip empty lines and headers
    if (!line.trim() || line.includes("---") || line.includes("| --- |")) {
      continue;
    }

    // Try to extract amount from line
    const amountMatch = line.match(RE_AMOUNT_MATCH);
    if (amountMatch) {
      const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ""));
      if (!Number.isNaN(amount) && amount > 0) {
        // Extract description (everything before the amount)
        const description = line
          .replace(amountMatch[0], "")
          .replace(/\|/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (description.length > 3) {
          items.push({
            description,
            quantity: null,
            unitPrice: null,
            amount,
          });
        }
      }
    }
  }

  return items;
}

/**
 * Manual reconciliation entry helper.
 * For when automatic matching doesn't work.
 */
export function createManualReconciliation(
  estimateTotal: number,
  contractTotal: number,
  lineItems: Array<{
    description: string;
    status: "KEPT" | "REMOVED" | "ADDED" | "?";
    amount: number;
    note?: string;
  }>
): ReconciliationOutput {
  const fullLineItems: ReconciliationLineItem[] = lineItems.map((item) => ({
    description: item.description,
    status: item.status,
    estimateAmount: item.status === "ADDED" ? null : item.amount,
    contractAmount: item.status === "REMOVED" ? null : item.amount,
    quantity: null,
    unitPrice: null,
    note: item.note ?? null,
  }));

  const mathCheck = calculateMathCheck(
    estimateTotal,
    contractTotal,
    fullLineItems
  );

  return {
    estimateNumber: null,
    estimateDate: null,
    estimateTotal,
    contractTotal,
    difference: contractTotal - estimateTotal,
    lineItems: fullLineItems,
    mathCheck,
    unitRates: [],
    outcome: mathCheck.matches ? "RECONCILED" : "MISMATCH",
    flags: [],
    notes: [],
  };
}

// ============================================
// Persistence
// ============================================

/**
 * Save reconciliation output to a JSON file.
 */
export function saveReconciliation(
  projectFolder: string,
  output: ReconciliationOutput
): string {
  const outputPath = join(projectFolder, "reconciliation.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  return outputPath;
}

/**
 * Load reconciliation output from a JSON file.
 */
export function loadReconciliation(
  projectFolder: string
): ReconciliationOutput | null {
  const outputPath = join(projectFolder, "reconciliation.json");

  if (!existsSync(outputPath)) {
    return null;
  }

  const content = readFileSync(outputPath, "utf-8");
  const parsed = JSON.parse(content);

  const result = ReconciliationOutputSchema.safeParse(parsed);

  if (!result.success) {
    console.error("Invalid reconciliation output:", result.error);
    return null;
  }

  return result.data;
}

/**
 * Save reconciliation as markdown notes.
 */
export function saveReconciliationMarkdown(
  projectFolder: string,
  output: ReconciliationOutput
): string {
  const markdown = formatReconciliationMarkdown(output);
  const outputPath = join(projectFolder, "reconciliation.md");
  writeFileSync(outputPath, markdown);
  return outputPath;
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "manual": {
      // Example manual reconciliation
      const output = createManualReconciliation(20_518.5, 20_168.5, [
        { description: "SWPPP Narrative", status: "KEPT", amount: 1350 },
        { description: "SWPPP Sign", status: "KEPT", amount: 295 },
        { description: "Fire Access Sign", status: "KEPT", amount: 695 },
        {
          description: "Dust Control Permit Filing",
          status: "KEPT",
          amount: 1630,
        },
        { description: "Spill Kit", status: "KEPT", amount: 360 },
        {
          description: "Textura/GC Pay/Procore",
          status: "REMOVED",
          amount: 100,
          note: "not required for this project",
        },
        {
          description: "CCIP/OCIP/Insurance portal fees",
          status: "REMOVED",
          amount: 250,
          note: "not required for this project",
        },
        {
          description: "Compost Filter Sock (1,650 LF)",
          status: "KEPT",
          amount: 4537.5,
        },
        { description: "Concrete Rolloff", status: "KEPT", amount: 770 },
        { description: "Inlet Protection (8)", status: "KEPT", amount: 1216 },
        {
          description: "Ertech Curb Protection (3)",
          status: "KEPT",
          amount: 585,
        },
        { description: "Inspections (40)", status: "KEPT", amount: 8200 },
        { description: "Mobilization (2)", status: "KEPT", amount: 530 },
      ]);

      console.log(formatReconciliationMarkdown(output));

      const validation = validateReconciliation(output);
      if (!validation.valid) {
        console.log("\nValidation errors:");
        for (const err of validation.errors) {
          console.log(`- ${err}`);
        }
      }
      break;
    }

    case "validate": {
      const folder = args[1];
      if (!folder) {
        console.error("Usage: reconcile.ts validate <project-folder>");
        process.exit(1);
      }

      const output = loadReconciliation(folder);
      if (!output) {
        console.error("No reconciliation.json found in folder");
        process.exit(1);
      }

      const validation = validateReconciliation(output);
      console.log(`Validation: ${validation.valid ? "PASSED" : "FAILED"}`);
      if (!validation.valid) {
        for (const err of validation.errors) {
          console.log(`- ${err}`);
        }
      }
      break;
    }

    default:
      console.log(`
Reconciliation Commands:

  bun services/contract/workflow/reconcile.ts manual
    Show example manual reconciliation

  bun services/contract/workflow/reconcile.ts validate <folder>
    Validate reconciliation.json in a project folder

Usage:
  Import and use reconcile() or createManualReconciliation() programmatically.
      `);
  }
}
