/**
 * Permit search evaluation runner.
 *
 * Loads BEIR-format dataset, runs a retrieval strategy, computes IR metrics,
 * and appends results to results.jsonl.
 *
 * Usage:
 *   bun run evals/permits/eval.ts --strategy ilike
 *   bun run evals/permits/eval.ts --strategy fts
 *   bun run evals/permits/eval.ts --strategy fts-rerank
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mrr, perQueryResults, recallAtK } from "./metrics";
import type { PermitRetrievalStrategy } from "./strategies/types";

const DIR = import.meta.dirname ?? join(process.cwd(), "evals/permits");

function loadQrels(): Map<string, string> {
  const lines = readFileSync(join(DIR, "qrels.tsv"), "utf-8").trim().split("\n");
  const qrels = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const [queryId, corpusId] = line.split("\t");
    qrels.set(queryId, corpusId);
  }
  return qrels;
}

interface Query {
  _id: string;
  text: string;
  metadata: { type: string; permit_id: string };
}

function loadQueries(): Query[] {
  return readFileSync(join(DIR, "queries.jsonl"), "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

async function loadStrategy(name: string): Promise<PermitRetrievalStrategy> {
  switch (name) {
    case "ilike": {
      const mod = await import("./strategies/ilike");
      return mod.default;
    }
    case "fts": {
      const mod = await import("./strategies/fts");
      return mod.default;
    }
    case "fts-rerank": {
      const mod = await import("./strategies/fts-rerank");
      return mod.default;
    }
    default:
      throw new Error(`Unknown strategy: ${name}. Available: ilike, fts, fts-rerank`);
  }
}

async function main() {
  const strategyName =
    process.argv.includes("--strategy")
      ? process.argv[process.argv.indexOf("--strategy") + 1]
      : "fts";

  console.log("Loading eval dataset...");
  const qrels = loadQrels();
  const queries = loadQueries();
  console.log(`  ${queries.length} queries, ${qrels.size} ground truth pairs`);

  console.log(`Loading strategy: ${strategyName}...`);
  const strategy = await loadStrategy(strategyName);
  await strategy.init?.();

  console.log("Running retrieval...");
  const results: { queryId: string; rankedIds: string[] }[] = [];
  let done = 0;
  const startTime = Date.now();

  for (const query of queries) {
    const rankedIds = await strategy.retrieve(query.text);
    results.push({ queryId: query._id, rankedIds });
    done++;
    if (done % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${done}/${queries.length} (${elapsed}s)`);
    }
  }

  await strategy.cleanup?.();
  const elapsed = Date.now() - startTime;

  // Compute metrics
  const metrics = {
    "recall@1": recallAtK(results, qrels, 1),
    "recall@5": recallAtK(results, qrels, 5),
    "recall@10": recallAtK(results, qrels, 10),
    "recall@20": recallAtK(results, qrels, 20),
    mrr: mrr(results, qrels),
  };

  console.log("\n--- Results ---");
  console.log(`Strategy: ${strategyName}`);
  console.log(`Queries:  ${queries.length}`);
  console.log(`Time:     ${(elapsed / 1000).toFixed(1)}s (${(elapsed / queries.length).toFixed(0)}ms/query)`);
  for (const [k, v] of Object.entries(metrics)) {
    console.log(`  ${k}: ${(v * 100).toFixed(1)}%`);
  }

  // Per-type breakdown
  const queryTypes = new Set(queries.map((q) => q.metadata.type));
  console.log("\n--- By Query Type ---");
  for (const type of queryTypes) {
    const typeQueries = queries.filter((q) => q.metadata.type === type);
    const typeResults = results.filter((r) =>
      typeQueries.some((q) => q._id === r.queryId),
    );
    const r1 = recallAtK(typeResults, qrels, 1);
    const r5 = recallAtK(typeResults, qrels, 5);
    console.log(`  ${type.padEnd(20)} R@1=${(r1 * 100).toFixed(1)}%  R@5=${(r5 * 100).toFixed(1)}%  (n=${typeQueries.length})`);
  }

  // Failure analysis
  const perQuery = perQueryResults(results, qrels);
  const failures = perQuery.filter((r) => r.rank === null || r.rank > 5);
  console.log(`\nFailures (not in top 5): ${failures.length}`);
  for (const f of failures.slice(0, 15)) {
    const query = queries.find((q) => q._id === f.queryId);
    console.log(
      `  ${f.queryId}: expected ${f.expected}, rank=${f.rank ?? "MISS"}, query="${query?.text}"`,
    );
  }
  if (failures.length > 15) {
    console.log(`  ... and ${failures.length - 15} more`);
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    strategy: strategyName,
    sample_size: queries.length,
    metrics,
    failure_count: failures.length,
    elapsed_ms: elapsed,
  };

  const resultsPath = join(DIR, "results.jsonl");
  appendFileSync(resultsPath, `${JSON.stringify(report)}\n`);
  console.log(`\nReport appended to ${resultsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
