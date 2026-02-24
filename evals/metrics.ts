/**
 * Standard IR retrieval metrics for evaluating project matching.
 *
 * Based on BEIR evaluation methodology. Binary relevance only
 * (each query has exactly one correct project).
 */

/** Recall@K: fraction of queries where the correct answer appears in top K results. */
export function recallAtK(
  results: { queryId: string; rankedIds: number[] }[],
  qrels: Map<string, number>,
  k: number
): number {
  let hits = 0;
  let total = 0;
  for (const { queryId, rankedIds } of results) {
    const expected = qrels.get(queryId);
    if (expected === undefined) {
      continue;
    }
    total++;
    if (rankedIds.slice(0, k).includes(expected)) {
      hits++;
    }
  }
  return total === 0 ? 0 : hits / total;
}

/** MRR: average reciprocal rank of the first correct result. */
export function mrr(
  results: { queryId: string; rankedIds: number[] }[],
  qrels: Map<string, number>
): number {
  let sum = 0;
  let total = 0;
  for (const { queryId, rankedIds } of results) {
    const expected = qrels.get(queryId);
    if (expected === undefined) {
      continue;
    }
    total++;
    const rank = rankedIds.indexOf(expected);
    if (rank !== -1) {
      sum += 1 / (rank + 1);
    }
  }
  return total === 0 ? 0 : sum / total;
}

/** Per-query breakdown for failure analysis. */
export function perQueryResults(
  results: { queryId: string; rankedIds: number[] }[],
  qrels: Map<string, number>
): {
  queryId: string;
  expected: number;
  rank: number | null;
  top5: number[];
}[] {
  const out: {
    queryId: string;
    expected: number;
    rank: number | null;
    top5: number[];
  }[] = [];
  for (const { queryId, rankedIds } of results) {
    const expected = qrels.get(queryId);
    if (expected === undefined) {
      continue;
    }
    const rank = rankedIds.indexOf(expected);
    out.push({
      queryId,
      expected,
      rank: rank === -1 ? null : rank + 1,
      top5: rankedIds.slice(0, 5),
    });
  }
  return out;
}
