/**
 * Multi-field Weighted Scoring for Contract-to-Estimate Matching
 */

import { calculateSimilarity } from "@/services/monday/client";

export const WEIGHTS = {
  projectName: 0.6,
  contractor: 0.4,
} as const;

export const HIGH_CONFIDENCE_THRESHOLD = 0.8;
export const MIN_CONFIDENCE_THRESHOLD = 0.3;
export const MAX_CANDIDATES = 5;

export function calculateMatchScore(
  contractProjectName: string,
  contractContractor: string,
  estimateName: string,
  estimateContractor: string | null
): { projectScore: number; contractorScore: number; combinedScore: number } {
  const projectScore = calculateSimilarity(contractProjectName, estimateName);

  // If no contractor in estimate, use project score only
  const contractorScore = estimateContractor
    ? calculateSimilarity(contractContractor, estimateContractor)
    : 0;

  // Weighted combination - if no contractor data, rely on project name alone
  const combinedScore = estimateContractor
    ? projectScore * WEIGHTS.projectName + contractorScore * WEIGHTS.contractor
    : projectScore;

  return { projectScore, contractorScore, combinedScore };
}
