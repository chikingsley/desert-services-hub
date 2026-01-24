/**
 * Storage for Contract-to-Estimate Match Results
 */

import { db } from "@/lib/db";
import type { MatchCandidate, MatchType, StoredMatch } from "./types";

interface MatchRow {
  contract_id: number;
  estimate_item_id: string;
  estimate_item_name: string;
  match_type: string;
  confidence_score: number;
  matched_by: string | null;
  matched_at: string;
}

export function storeMatchResult(
  contractId: number,
  estimate: MatchCandidate,
  matchType: MatchType,
  matchedBy: string | null = null
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contract_matches
    (contract_id, estimate_item_id, estimate_item_name, match_type, confidence_score, matched_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    contractId,
    estimate.itemId,
    estimate.itemName,
    matchType,
    estimate.combinedScore,
    matchedBy
  );
}

export function getMatchForContract(contractId: number): StoredMatch | null {
  const row = db
    .query<MatchRow, [number]>(
      `SELECT contract_id, estimate_item_id, estimate_item_name, match_type,
              confidence_score, matched_by, matched_at
       FROM contract_matches
       WHERE contract_id = ?`
    )
    .get(contractId);

  if (!row) {
    return null;
  }

  return {
    contractId: row.contract_id,
    estimateItemId: row.estimate_item_id,
    estimateItemName: row.estimate_item_name,
    matchType: row.match_type as MatchType,
    confidenceScore: row.confidence_score,
    matchedBy: row.matched_by,
    matchedAt: row.matched_at,
  };
}
