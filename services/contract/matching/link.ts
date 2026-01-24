/**
 * Contract-to-Estimate Linking
 *
 * Orchestrates the match workflow: processes matches, stores results,
 * and links contracts to estimates in Monday.com.
 */

import type { ContractInfo } from "@/services/contract/agents/schemas/contract-info";
import { getAllExtractedData } from "@/services/contract/agents/storage";
import { updateItem } from "@/services/monday/client";
import { BOARD_IDS } from "@/services/monday/types";
import { findEstimateMatch } from "./matcher";
import { storeMatchResult } from "./storage";
import type { MatchCandidate, MatchResult } from "./types";

/**
 * Result of the match processing step.
 */
export type MatchProcessResult =
  | {
      status: "matched";
      estimateId: string;
      estimateName: string;
      confidence: number;
    }
  | { status: "needs_selection"; candidateCount: number; topConfidence: number }
  | { status: "no_match"; reason: string }
  | { status: "missing_data"; reason: string };

/**
 * Link a contract to an estimate in Monday.com (MATCH-05).
 * Updates the Bid Status to "Add to Projects" indicating contract received.
 */
async function linkContractInMonday(
  estimateItemId: string,
  _contractId: number
): Promise<void> {
  // Update the estimate item in Monday to mark contract received
  // deal_stage = "Bid Status" column, "Add to Projects" indicates ready to move to Projects board
  await updateItem({
    boardId: BOARD_IDS.ESTIMATING,
    itemId: estimateItemId,
    columnValues: {
      deal_stage: { label: "Add to Projects" },
    },
  });
}

/**
 * Process matching for a contract.
 * Gets extracted data, runs matching, stores result if auto-matched.
 */
export async function processContractMatch(
  contractId: number
): Promise<MatchProcessResult> {
  // Get extracted data from Phase 3
  const extracted = getAllExtractedData(contractId);
  if (!extracted) {
    return {
      status: "missing_data",
      reason: "No extraction data found for contract",
    };
  }

  // Extract contractInfo fields (from contractInfo agent)
  // The generalContractor field was added in Plan 01
  const contractInfo = extracted.contractInfo as ContractInfo | undefined;
  if (!contractInfo) {
    return {
      status: "missing_data",
      reason: "No contractInfo extraction found",
    };
  }

  const { projectName, generalContractor } = contractInfo;
  if (!(projectName && generalContractor)) {
    const missingFields: string[] = [];
    if (!projectName) {
      missingFields.push("projectName");
    }
    if (!generalContractor) {
      missingFields.push("generalContractor");
    }
    return {
      status: "missing_data",
      reason: `Missing required fields: ${missingFields.join(", ")}`,
    };
  }

  // Run matching
  const matchResult: MatchResult = await findEstimateMatch(
    projectName,
    generalContractor
  );

  // Handle results
  if (matchResult.status === "auto_matched") {
    // Store the auto-match in SQLite
    storeMatchResult(contractId, matchResult.estimate, "auto", null);

    // Link contract to estimate in Monday.com (MATCH-05)
    await linkContractInMonday(matchResult.estimate.itemId, contractId);

    return {
      status: "matched",
      estimateId: matchResult.estimate.itemId,
      estimateName: matchResult.estimate.itemName,
      confidence: matchResult.confidence,
    };
  }

  if (matchResult.status === "needs_selection") {
    // Log candidates for human selection
    // Don't store yet - human needs to choose
    return {
      status: "needs_selection",
      candidateCount: matchResult.candidates.length,
      topConfidence: matchResult.topConfidence,
    };
  }

  // No match found
  return {
    status: "no_match",
    reason: matchResult.reason,
  };
}

/**
 * Manually select an estimate for a contract.
 * Called when human selects from candidates.
 * Links contract to estimate in both SQLite and Monday.com.
 */
export async function selectEstimateMatch(
  contractId: number,
  estimateItemId: string,
  estimateItemName: string,
  confidence: number,
  matchedBy: string
): Promise<void> {
  const candidate: MatchCandidate = {
    itemId: estimateItemId,
    itemName: estimateItemName,
    itemUrl: `https://monday.com/boards/${BOARD_IDS.ESTIMATING}/pulses/${estimateItemId}`,
    projectScore: confidence,
    contractorScore: confidence,
    combinedScore: confidence,
    estimateContractor: null,
  };

  // Store in SQLite
  storeMatchResult(contractId, candidate, "manual", matchedBy);

  // Link in Monday.com (MATCH-05)
  await linkContractInMonday(estimateItemId, contractId);
}

/**
 * Format match candidates for display.
 * Returns a formatted string showing top candidates with scores.
 */
export function formatCandidatesForSelection(
  candidates: Array<{
    itemId: string;
    itemName: string;
    itemUrl: string;
    combinedScore: number;
    projectScore: number;
    contractorScore: number;
    estimateContractor: string | null;
  }>
): string {
  return candidates
    .map((c, i) => {
      const confidence = Math.round(c.combinedScore * 100);
      const projectPct = Math.round(c.projectScore * 100);
      const contractorPct = Math.round(c.contractorScore * 100);
      const contractorInfo = c.estimateContractor
        ? `Contractor: ${c.estimateContractor} (${contractorPct}% match)`
        : "No contractor data";

      return [
        `${i + 1}. ${c.itemName} (${confidence}% confidence)`,
        `   Project similarity: ${projectPct}%`,
        `   ${contractorInfo}`,
        `   ID: ${c.itemId}`,
        `   URL: ${c.itemUrl}`,
      ].join("\n");
    })
    .join("\n\n");
}
