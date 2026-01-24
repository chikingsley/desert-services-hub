/**
 * Types for Contract-to-Estimate Matching
 */

export interface MatchCandidate {
  itemId: string;
  itemName: string;
  itemUrl: string;
  projectScore: number; // Similarity of project names (0-1)
  contractorScore: number; // Similarity of contractor names (0-1)
  combinedScore: number; // Weighted combination
  estimateContractor: string | null; // Contractor from Monday item
}

export type MatchResult =
  | { status: "auto_matched"; estimate: MatchCandidate; confidence: number }
  | {
      status: "needs_selection";
      candidates: MatchCandidate[];
      topConfidence: number;
    }
  | { status: "no_match"; reason: string };

export type MatchType = "auto" | "manual";

export interface StoredMatch {
  contractId: number;
  estimateItemId: string;
  estimateItemName: string;
  matchType: MatchType;
  confidenceScore: number;
  matchedBy: string | null; // null for auto, user identifier for manual
  matchedAt: string;
}
