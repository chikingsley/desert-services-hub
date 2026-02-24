/**
 * Retrieval evaluation runner.
 *
 * Loads BEIR-format dataset, runs a retrieval strategy, computes IR metrics,
 * and appends results to results.jsonl for tracking over time.
 *
 * Usage:
 *   bun run evals/eval.ts                     # run default (token-overlap) strategy
 *   bun run evals/eval.ts --strategy fts       # run FTS strategy
 *   bun run evals/eval.ts --strategy fts+rerank
 *   bun run evals/eval.ts --strategy dossier+llm
 *
 * Strategies are pluggable — add yours to the STRATEGIES map below.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mrr, perQueryResults, recallAtK } from "./metrics";
import type { RetrievalStrategy } from "./strategies/types";

const DIR = import.meta.dirname ?? join(process.cwd(), "evals");

// --- Load dataset ---

function loadQrels(): Map<string, number> {
  const lines = readFileSync(join(DIR, "qrels.tsv"), "utf-8")
    .trim()
    .split("\n");
  const qrels = new Map<string, number>();
  for (const line of lines.slice(1)) {
    // skip header
    const [queryId, corpusId, _score] = line.split("\t");
    const projectId = Number(corpusId.replace("proj_", ""));
    qrels.set(queryId, projectId);
  }
  return qrels;
}

interface Query {
  _id: string;
  metadata: {
    source: string;
    subject?: string;
    from_name?: string;
    from_email?: string;
    email_id?: number;
  };
  text: string;
}

function loadQueries(): Query[] {
  return readFileSync(join(DIR, "queries.jsonl"), "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

// --- Strategy registry ---

async function loadStrategy(name: string): Promise<RetrievalStrategy> {
  switch (name) {
    case "token-overlap": {
      const mod = await import("./strategies/token-overlap");
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
    case "fts-multi": {
      const mod = await import("./strategies/fts-multi");
      return mod.default;
    }
    case "fts-websearch": {
      const mod = await import("./strategies/fts-websearch");
      return mod.default;
    }
    case "fts-multi-rerank": {
      const mod = await import("./strategies/fts-multi-rerank");
      return mod.default;
    }
    case "fts-multi-estimate-fts": {
      const mod = await import("./strategies/fts-multi-estimate-fts");
      return mod.default;
    }
    default:
      throw new Error(
        `Unknown strategy: ${name}. Available: token-overlap, fts, fts-rerank, fts-multi, fts-websearch, fts-multi-rerank, fts-multi-estimate-fts`
      );
  }
}

// --- Main ---

async function main() {
  const strategyName = process.argv.includes("--strategy")
    ? process.argv[process.argv.indexOf("--strategy") + 1]
    : "token-overlap";

  console.log("Loading eval dataset...");
  const qrels = loadQrels();
  const queries = loadQueries();
  console.log(`  ${queries.length} queries, ${qrels.size} ground truth pairs`);

  console.log(`Loading strategy: ${strategyName}...`);
  const strategy = await loadStrategy(strategyName);
  await strategy.init?.();

  console.log("Running retrieval...");
  const results: { queryId: string; rankedIds: number[] }[] = [];
  let done = 0;
  const startTime = Date.now();

  for (const query of queries) {
    const rankedIds = await strategy.retrieve(query);
    results.push({ queryId: query._id, rankedIds });
    done++;
    if (done % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${done}/${queries.length} (${elapsed}s)`);
    }
  }

  await strategy.cleanup?.();

  // --- Compute metrics ---
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
  for (const [k, v] of Object.entries(metrics)) {
    console.log(`  ${k}: ${(v * 100).toFixed(1)}%`);
  }

  // --- Failure analysis ---
  const perQuery = perQueryResults(results, qrels);
  const failures = perQuery.filter((r) => r.rank === null || r.rank > 5);
  console.log(`\nFailures (not in top 5): ${failures.length}`);
  for (const f of failures.slice(0, 10)) {
    const query = queries.find((q) => q._id === f.queryId);
    console.log(
      `  ${f.queryId}: expected proj_${f.expected}, got rank=${f.rank ?? "MISS"}, top5=${JSON.stringify(f.top5)}`
    );
    if (query?.metadata?.subject) {
      console.log(`    subject: "${query.metadata.subject}"`);
    }
  }
  if (failures.length > 10) {
    console.log(`  ... and ${failures.length - 10} more`);
  }

  // --- Write report ---
  const report = {
    timestamp: new Date().toISOString(),
    strategy: strategyName,
    sample_size: queries.length,
    metrics,
    failure_count: failures.length,
    elapsed_ms: Date.now() - startTime,
  };

  const resultsPath = join(DIR, "results.jsonl");
  appendFileSync(resultsPath, JSON.stringify(report) + "\n");
  console.log(`\nReport appended to ${resultsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
