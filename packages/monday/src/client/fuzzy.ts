/**
 * Fuzzy string similarity utilities.
 */
import type { MondayItem } from "@monday/types/schema";
import { getItems } from "./items";

const WORD_SPLIT_REGEX = /\s+/;
const MIN_WORD_LENGTH = 3;
const MIN_SIMILARITY_THRESHOLD = 0.3;
const EXACT_MATCH_SCORE = 1;
const CONTAINS_MATCH_SCORE = 0.9;

function extractSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(WORD_SPLIT_REGEX)
    .filter((word) => word.length >= MIN_WORD_LENGTH);
}

function wordsMatch(wordA: string, wordB: string): boolean {
  return wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA);
}

/**
 * Calculate similarity between two strings (0-1).
 */
export function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) {
    return EXACT_MATCH_SCORE;
  }

  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return CONTAINS_MATCH_SCORE;
  }

  const wordsA = extractSignificantWords(a);
  const wordsB = extractSignificantWords(b);

  if (wordsA.length === 0 || wordsB.length === 0) {
    return 0;
  }

  let matchingWords = 0;
  for (const wordA of wordsA) {
    const hasMatch = wordsB.some((wordB) => wordsMatch(wordA, wordB));
    if (hasMatch) {
      matchingWords += 1;
    }
  }

  return matchingWords / Math.max(wordsA.length, wordsB.length);
}

export type ScoredItem = MondayItem & { score: number };

/**
 * Find best matching items by name.
 */
export async function findBestMatches(
  boardId: string,
  name: string,
  limit = 5
): Promise<ScoredItem[]> {
  const items = await getItems(boardId);

  return items
    .map((item) => ({ ...item, score: calculateSimilarity(name, item.name) }))
    .filter((item) => item.score > MIN_SIMILARITY_THRESHOLD)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit);
}
