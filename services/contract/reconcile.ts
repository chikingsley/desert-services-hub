/**
 * Contract Reconciliation - Line Item Comparison
 *
 * Compares line items between estimate and contract,
 * not just narrative summaries.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  ContractPackage,
  LineItemMatch,
  ReconciliationResult,
  ReconciliationVerdict,
  RedFlagSeverity,
} from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-pro";

export interface EstimateLineItem {
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  total: number;
}

export interface EstimateData {
  projectName: string;
  contractorName: string;
  totalAmount: number;
  lineItems: EstimateLineItem[];
  notes?: string;
}

export interface ReconciliationIssue {
  severity: "critical" | "warning" | "info";
  message: string;
}

const VERDICT_ICONS: Record<string, string> = {
  MATCH: "[OK]",
  EXPLAINABLE: "[WARN]",
  NEEDS_REVIEW: "[REVIEW]",
  CANNOT_RECONCILE: "[ERROR]",
};

const SCOPE_EXTRACTION_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    lineItems: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          description: { type: "STRING" as const },
          amount: { type: "NUMBER" as const },
          quantity: { type: "NUMBER" as const },
          unit: { type: "STRING" as const },
          notes: { type: "STRING" as const },
        },
      },
    },
    hasLineItemPricing: { type: "BOOLEAN" as const },
    totalAmount: { type: "NUMBER" as const },
  },
};

const SCOPE_EXTRACTION_PROMPT = `Extract ALL individual work items/line items from this contract scope of work.

For each item, extract:
- description: What work is being done
- amount: Dollar amount for this line item (if specified)
- quantity: Number of units (if specified, e.g., "44 inspections")
- unit: Unit type (if specified, e.g., "each", "LF", "visits")
- notes: Any special conditions (e.g., "billed extra", "if required")

IMPORTANT:
- hasLineItemPricing should be TRUE only if the contract has dollar amounts per line item
- If the contract only has a lump sum total without per-item pricing, set hasLineItemPricing to FALSE
- Extract every discrete work item mentioned, even if no price is given

Contract scope text:
`;

const MATCHING_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    matches: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          estimateDescription: { type: "STRING" as const },
          matchType: { type: "STRING" as const },
          contractDescription: { type: "STRING" as const },
          priceDifference: { type: "NUMBER" as const },
          notes: { type: "STRING" as const },
        },
      },
    },
    additionalContractItems: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          description: { type: "STRING" as const },
          notes: { type: "STRING" as const },
        },
      },
    },
  },
};

const MATCHING_PROMPT = `You are comparing an ESTIMATE (what the subcontractor bid) against a CONTRACT (what the GC is paying for).

Match each estimate line item to the contract scope. Determine:
- "exact": Item is clearly in contract scope with same/similar description
- "partial": Item is partially covered in contract, or scope is reduced
- "missing": Item in estimate is NOT in contract scope at all
- "modified": Item exists but with significant changes (quantity, conditions, etc.)

For items in contract that aren't in the estimate, list them as additionalContractItems.

Be specific in your notes - explain WHY you made each determination.

ESTIMATE LINE ITEMS:
`;

interface ContractLineItem {
  description: string;
  amount?: number;
  quantity?: number;
  unit?: string;
  notes?: string;
}

interface ContractItemsResult {
  lineItems: ContractLineItem[];
  hasLineItemPricing: boolean;
  totalAmount?: number;
}

interface MatchResult {
  estimateDescription: string;
  matchType: string;
  contractDescription: string;
  priceDifference?: number;
  notes: string;
}

interface AdditionalContractItem {
  description: string;
  notes: string;
}

interface MatchingResult {
  matches: MatchResult[];
  additionalContractItems: AdditionalContractItem[];
}

function getGeminiClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

function getContractScopeText(contract: ContractPackage): string {
  const parts: string[] = [];

  if (contract.scopeOfWork) {
    parts.push(contract.scopeOfWork);
  }

  for (const doc of contract.documents) {
    if (doc.scopeOfWork && doc.docType !== "SUBCONTRACT") {
      parts.push(`\n--- From ${doc.docType} ---\n${doc.scopeOfWork}`);
    }
  }

  return parts.join("\n");
}

async function extractContractLineItems(
  ai: GoogleGenAI,
  scopeText: string
): Promise<ContractItemsResult> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ text: `${SCOPE_EXTRACTION_PROMPT}\n\n${scopeText}` }],
    config: {
      responseMimeType: "application/json",
      responseSchema: SCOPE_EXTRACTION_SCHEMA,
      thinkingConfig: { thinkingBudget: 2048 },
    },
  });

  return JSON.parse(
    response.text ?? '{"lineItems":[],"hasLineItemPricing":false}'
  );
}

async function matchEstimateToContract(
  ai: GoogleGenAI,
  estimateItems: EstimateLineItem[],
  scopeText: string
): Promise<MatchingResult> {
  const estimateText = estimateItems
    .map((item) => `- ${item.description}: $${item.total.toLocaleString()}`)
    .join("\n");

  const prompt = `${MATCHING_PROMPT}

${estimateText}

CONTRACT SCOPE TEXT:
${scopeText}

Match each estimate item to the contract and identify any additional contract items.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: MATCHING_SCHEMA,
      thinkingConfig: { thinkingBudget: 2048 },
    },
  });

  return JSON.parse(
    response.text ?? '{"matches":[],"additionalContractItems":[]}'
  );
}

function buildLineItemComparison(
  estimateItems: EstimateLineItem[],
  matches: MatchResult[]
): { lineItemComparison: LineItemMatch[]; removedItemsTotal: number } {
  const lineItemComparison: LineItemMatch[] = [];
  let removedItemsTotal = 0;

  for (const estimateItem of estimateItems) {
    const match = matches.find(
      (m) =>
        m.estimateDescription.toLowerCase() ===
        estimateItem.description.toLowerCase()
    );

    if (match) {
      const isRemoved = match.matchType === "missing";
      const notes = isRemoved
        ? `REMOVED - explains $${estimateItem.total.toLocaleString()} of the price reduction`
        : match.notes;

      if (isRemoved) {
        removedItemsTotal += estimateItem.total;
      }

      lineItemComparison.push({
        estimateItem,
        contractMatch: match.matchType as LineItemMatch["contractMatch"],
        contractDescription: match.contractDescription,
        priceDifference: match.priceDifference,
        notes,
      });
    } else {
      lineItemComparison.push({
        estimateItem,
        contractMatch: "missing",
        notes: `REMOVED - explains $${estimateItem.total.toLocaleString()} of the price reduction`,
      });
      removedItemsTotal += estimateItem.total;
    }
  }

  return { lineItemComparison, removedItemsTotal };
}

interface ReconciliationIssueParams {
  issues: ReconciliationIssue[];
  difference: number;
  unexplainedDifference: number;
  tolerance: number;
  lineItemComparison: LineItemMatch[];
  removedItemsTotal: number;
}

function addReconciliationIssues(params: ReconciliationIssueParams): void {
  const {
    issues,
    difference,
    unexplainedDifference,
    tolerance,
    lineItemComparison,
    removedItemsTotal,
  } = params;

  const removedCount = lineItemComparison.filter(
    (l) => l.contractMatch === "missing"
  ).length;

  if (Math.abs(difference) < 1) {
    issues.push({
      severity: "info",
      message: "Totals match exactly",
    });
    return;
  }

  if (Math.abs(unexplainedDifference) <= tolerance) {
    issues.push({
      severity: "info",
      message: `Price difference of $${difference.toLocaleString()} is explained by ${removedCount} removed scope item(s) totaling $${removedItemsTotal.toLocaleString()}`,
    });
    return;
  }

  if (unexplainedDifference > 0) {
    issues.push({
      severity: "warning",
      message: `Contract is $${unexplainedDifference.toLocaleString()} lower than expected even after accounting for removed items - may be negotiated pricing`,
    });
    return;
  }

  issues.push({
    severity: "critical",
    message: `Removed items ($${removedItemsTotal.toLocaleString()}) exceed the price difference ($${difference.toLocaleString()}) - contract may include unpriced scope`,
  });
}

interface VerdictParams {
  difference: number;
  explainedByRemovals: number;
  unexplainedDifference: number;
  tolerance: number;
  lineItemComparison: LineItemMatch[];
  hasLineItemPricing: boolean;
  issues: ReconciliationIssue[];
}

function determineVerdict(params: VerdictParams): ReconciliationVerdict {
  const {
    difference,
    explainedByRemovals,
    unexplainedDifference,
    tolerance,
    lineItemComparison,
    hasLineItemPricing,
    issues,
  } = params;

  const hasCritical = issues.some((i) => i.severity === "critical");
  const missingItems = lineItemComparison.filter(
    (l) => l.contractMatch === "missing"
  );
  const matchedItems = lineItemComparison.filter(
    (l) => l.contractMatch === "exact" || l.contractMatch === "partial"
  );

  if (Math.abs(difference) < 1) {
    return {
      status: "MATCH",
      summary: "Contract matches estimate - totals align exactly.",
      nextSteps: [
        "Proceed with signing",
        "Verify insurance and other requirements",
      ],
    };
  }

  if (Math.abs(unexplainedDifference) <= tolerance) {
    const nextSteps = [
      `Confirm ${missingItems.length} item(s) were intentionally removed from scope`,
    ];
    if (matchedItems.length > 0) {
      nextSteps.push(
        `Verify ${matchedItems.length} matched item(s) have correct pricing`
      );
    }
    nextSteps.push("Review requirements and red flags before signing");

    return {
      status: "EXPLAINABLE",
      summary: `Price reduction of $${difference.toLocaleString()} is explained by ${missingItems.length} removed scope item(s) totaling $${explainedByRemovals.toLocaleString()}.`,
      nextSteps,
    };
  }

  if (!hasCritical && Math.abs(unexplainedDifference) <= difference * 0.3) {
    const nextSteps = [
      `Clarify $${Math.abs(unexplainedDifference).toLocaleString()} unexplained difference with GC`,
    ];
    if (!hasLineItemPricing) {
      nextSteps.push("Request Schedule of Values with line item pricing");
    }
    nextSteps.push("May be acceptable if GC confirms negotiated pricing");

    return {
      status: "NEEDS_REVIEW",
      summary: `Removed items explain $${explainedByRemovals.toLocaleString()} of the $${difference.toLocaleString()} difference, leaving $${Math.abs(unexplainedDifference).toLocaleString()} unexplained.`,
      nextSteps,
    };
  }

  const nextSteps = [
    "DO NOT SIGN until discrepancy is resolved",
    "Request detailed breakdown from GC explaining the pricing",
  ];
  if (!hasLineItemPricing) {
    nextSteps.push("Request Schedule of Values with line item pricing");
  }
  if (missingItems.length > 0) {
    nextSteps.push(
      `Verify if ${missingItems.length} item(s) marked as removed are actually excluded`
    );
  }

  return {
    status: "CANNOT_RECONCILE",
    summary: `Cannot reconcile: Removed items ($${explainedByRemovals.toLocaleString()}) don't account for the full $${difference.toLocaleString()} difference. $${Math.abs(unexplainedDifference).toLocaleString()} remains unexplained.`,
    nextSteps,
  };
}

export async function reconcileLineItems(
  contract: ContractPackage,
  estimate: EstimateData
): Promise<ReconciliationResult> {
  const start = Date.now();
  const ai = getGeminiClient();
  const issues: ReconciliationIssue[] = [];

  const scopeText = getContractScopeText(contract);

  if (!scopeText || scopeText.length < 50) {
    issues.push({
      severity: "critical",
      message: "No scope of work found in contract documents",
    });
  }

  console.log("  Extracting contract scope items...");
  const contractItems = await extractContractLineItems(ai, scopeText);

  if (!contractItems.hasLineItemPricing) {
    issues.push({
      severity: "warning",
      message:
        "Contract has NO line item pricing - only a lump sum. Cannot verify individual prices.",
    });
  }

  console.log("  Matching estimate to contract...");
  const matching = await matchEstimateToContract(
    ai,
    estimate.lineItems,
    scopeText
  );

  const { lineItemComparison, removedItemsTotal } = buildLineItemComparison(
    estimate.lineItems,
    matching.matches ?? []
  );

  const additionalContractItems = (matching.additionalContractItems ?? []).map(
    (item) => ({
      description: item.description,
      notes: item.notes,
    })
  );

  if (additionalContractItems.length > 0) {
    issues.push({
      severity: "warning",
      message: `Contract includes ${additionalContractItems.length} scope item(s) not in estimate - potential scope creep`,
    });
  }

  const contractTotal = contract.amounts?.originalAmount ?? 0;
  const difference = estimate.totalAmount - contractTotal;
  const percentDifference = (difference / estimate.totalAmount) * 100;
  const unexplainedDifference = difference - removedItemsTotal;
  const tolerance = Math.max(Math.abs(difference) * 0.1, 500);

  addReconciliationIssues({
    issues,
    difference,
    unexplainedDifference,
    tolerance,
    lineItemComparison,
    removedItemsTotal,
  });

  const verdict = determineVerdict({
    difference,
    explainedByRemovals: removedItemsTotal,
    unexplainedDifference,
    tolerance,
    lineItemComparison,
    hasLineItemPricing: contractItems.hasLineItemPricing,
    issues,
  });

  const redFlags = issues.map((issue) => {
    let severity: RedFlagSeverity = "low";
    if (issue.severity === "critical") {
      severity = "high";
    } else if (issue.severity === "warning") {
      severity = "medium";
    }

    return {
      issue: issue.message,
      severity,
      recommendation: verdict.nextSteps.join("; "),
    };
  });

  return {
    projectName: contract.project?.name ?? estimate.projectName,
    contractorName: contract.contractor?.name ?? estimate.contractorName,
    reconciliationDate: new Date().toISOString(),
    financial: {
      estimateTotal: estimate.totalAmount,
      contractTotal,
      difference,
      percentDifference,
      explainedDifference: removedItemsTotal,
      unexplainedDifference,
      matches: Math.abs(unexplainedDifference) <= tolerance,
      lineItems: lineItemComparison,
      hasLineItemPricing: contractItems.hasLineItemPricing,
    },
    scope: {
      additionalContractItems,
      redFlags,
    },
    verdict,
    processingTimeMs: Date.now() - start,
  };
}

function getMatchStatusLabel(match: LineItemMatch["contractMatch"]): string {
  switch (match) {
    case "exact":
      return "[OK] In contract";
    case "partial":
      return "[WARN] Partial match";
    case "modified":
      return "[REVIEW] Modified";
    case "missing":
      return "[X] NOT IN CONTRACT";
    default:
      return `[?] ${match}`;
  }
}

function printSection(title: string, separator = "-"): void {
  console.log(`\n${separator.repeat(80)}`);
  console.log(title);
  console.log(separator.repeat(80));
}

function printLineItemComparison(lines: LineItemMatch[]): void {
  printSection("LINE ITEM COMPARISON");
  console.log(
    "\n  ESTIMATE ITEM                              AMOUNT      STATUS"
  );
  console.log(`  ${"-".repeat(76)}`);

  for (const line of lines) {
    const desc = line.estimateItem.description.slice(0, 38).padEnd(40);
    const amount = `$${line.estimateItem.total.toLocaleString()}`.padStart(10);
    const status = getMatchStatusLabel(line.contractMatch);

    console.log(`  ${desc} ${amount}   ${status}`);
    if (line.notes && line.contractMatch !== "exact") {
      console.log(`     -> ${line.notes}`);
    }
  }
}

function getIconForSeverity(severity: RedFlagSeverity): string {
  if (severity === "high") {
    return "[ERROR]";
  }
  if (severity === "medium") {
    return "[WARN]";
  }
  return "[INFO]";
}

export function printReconciliationReport(result: ReconciliationResult): void {
  const statusIcon = VERDICT_ICONS[result.verdict.status] || "[?]";

  console.log(`\n${"=".repeat(80)}`);
  console.log(
    `${statusIcon} CONTRACT RECONCILIATION: ${result.verdict.status}`
  );
  console.log("=".repeat(80));

  console.log(`\nProject: ${result.projectName}`);
  console.log(`Contractor: ${result.contractorName}`);

  printSection("TOTALS");
  console.log(
    `  Estimate:   $${result.financial.estimateTotal.toLocaleString()}`
  );
  console.log(
    `  Contract:   $${result.financial.contractTotal.toLocaleString()}`
  );
  console.log(
    `  Difference: $${result.financial.difference.toLocaleString()} (${result.financial.percentDifference.toFixed(1)}%)`
  );

  if (!result.financial.hasLineItemPricing) {
    console.log("\n  [WARN] CONTRACT HAS NO LINE ITEM PRICING - only lump sum");
  }

  printLineItemComparison(result.financial.lineItems);

  if (result.scope.additionalContractItems.length > 0) {
    console.log("\n  CONTRACT ITEMS NOT IN ESTIMATE:");
    for (const item of result.scope.additionalContractItems) {
      console.log(`    + ${item.description}`);
      if (item.notes) {
        console.log(`       -> ${item.notes}`);
      }
    }
  }

  printSection("ACCOUNTING");
  console.log(
    `  Total difference:      $${result.financial.difference.toLocaleString()}`
  );
  console.log(
    `  Explained by changes:  $${result.financial.explainedDifference.toLocaleString()}`
  );
  console.log(
    `  UNEXPLAINED:           $${result.financial.unexplainedDifference.toLocaleString()}`
  );
  console.log(
    `  Can reconcile:         ${result.financial.matches ? "[OK] YES" : "[X] NO"}`
  );

  if (result.scope.redFlags.length > 0) {
    printSection("ISSUES");
    for (const flag of result.scope.redFlags) {
      const icon = getIconForSeverity(flag.severity);
      console.log(`  ${icon} ${flag.issue}`);
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`VERDICT: ${result.verdict.status}`);
  console.log("=".repeat(80));
  console.log(`\n  ${result.verdict.summary}`);
  console.log("\n  NEXT STEPS:");
  for (const step of result.verdict.nextSteps) {
    console.log(`    -> ${step}`);
  }
  console.log(`\n${"=".repeat(80)}`);
}

if (import.meta.main) {
  console.log(`
Line Item Reconciliation Tool

Usage:
  bun services/contract/reconcile.ts

This tool does actual line-by-line comparison between estimate and contract.
`);
}
