/**
 * Contract-to-Estimate Matcher
 *
 * Finds the best estimate match for a contract using parallel search
 * and multi-field weighted scoring.
 */

import {
  findBestMatches,
  type ScoredItem,
  searchItems,
} from "@/services/monday/client";
import { BOARD_IDS } from "@/services/monday/types";
import {
  calculateMatchScore,
  HIGH_CONFIDENCE_THRESHOLD,
  MAX_CANDIDATES,
  MIN_CONFIDENCE_THRESHOLD,
} from "./scorer";
import type { MatchCandidate, MatchResult } from "./types";

/**
 * Find the best estimate match for a contract.
 * Uses parallel search (project name + contractor) and multi-field scoring.
 */
export async function findEstimateMatch(
  projectName: string,
  contractor: string
): Promise<MatchResult> {
  const boardId = BOARD_IDS.ESTIMATING;

  // Parallel search: fuzzy match by project name + keyword search by contractor first word
  const contractorFirstWord = contractor.split(" ")[0] ?? contractor;
  const [projectMatches, contractorMatches] = await Promise.all([
    findBestMatches(boardId, projectName, 10),
    searchItems(boardId, contractorFirstWord),
  ]);

  // Merge and dedupe results
  const seenIds = new Set<string>();
  const allItems: ScoredItem[] = [];

  for (const item of [...projectMatches, ...contractorMatches]) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      // contractorMatches items don't have score, so add default
      const scoredItem =
        "score" in item ? item : { ...item, score: MIN_CONFIDENCE_THRESHOLD };
      allItems.push(scoredItem as ScoredItem);
    }
  }

  if (allItems.length === 0) {
    return {
      status: "no_match",
      reason: `No estimates found matching "${projectName}" or "${contractor}"`,
    };
  }

  // Score all items with multi-field algorithm
  const candidates: MatchCandidate[] = allItems
    .map((item) => {
      // Contractor is in deal_account column (mirror from Contractors board)
      const estimateContractor = item.columns?.deal_account ?? null;

      const scores = calculateMatchScore(
        projectName,
        contractor,
        item.name,
        estimateContractor
      );

      return {
        itemId: item.id,
        itemName: item.name,
        itemUrl: item.url,
        estimateContractor,
        ...scores,
      };
    })
    .filter((c) => c.combinedScore >= MIN_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.combinedScore - a.combinedScore);

  if (candidates.length === 0) {
    return {
      status: "no_match",
      reason: "Found items but none met minimum confidence threshold",
    };
  }

  const topCandidate = candidates[0];

  // Auto-match if high confidence
  if (topCandidate.combinedScore >= HIGH_CONFIDENCE_THRESHOLD) {
    return {
      status: "auto_matched",
      estimate: topCandidate,
      confidence: topCandidate.combinedScore,
    };
  }

  // Return top candidates for human selection
  return {
    status: "needs_selection",
    candidates: candidates.slice(0, MAX_CANDIDATES),
    topConfidence: topCandidate.combinedScore,
  };
}
