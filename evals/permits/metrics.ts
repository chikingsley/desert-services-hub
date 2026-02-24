/**
 * IR metrics for permit search evaluation.
 * Same as parent eval metrics but with string IDs (permit IDs are D0XXXXXX).
 */

export function recallAtK(
  results: { queryId: string; rankedIds: string[] }[],
  qrels: Map<string, string>,
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

export function mrr(
  results: { queryId: string; rankedIds: string[] }[],
  qrels: Map<string, string>
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

export function perQueryResults(
  results: { queryId: string; rankedIds: string[] }[],
  qrels: Map<string, string>
): {
  queryId: string;
  expected: string;
  rank: number | null;
  top5: string[];
}[] {
  const out: {
    queryId: string;
    expected: string;
    rank: number | null;
    top5: string[];
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
