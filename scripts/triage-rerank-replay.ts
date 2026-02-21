#!/usr/bin/env bun
/**
 * Triage rerank replay (real DB + real Jina API, no mocks).
 *
 * Replays historical linked emails and compares:
 * - baseline rank (deterministic candidate score order)
 * - rerank order (Jina reranker v3 over same candidates)
 *
 * This is ranking-only evaluation and does not call triage LLM classification.
 */

import {
  type ReplayOptions,
  runTriageRerankReplay,
} from "./triage-rerank-replay-core";

const DEFAULT_LIMIT = 250;
const DEFAULT_LOOKBACK_DAYS = 180;
const DEFAULT_TOP_N = 3;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_SAMPLE = 8;

function printUsage(): void {
  console.log(`
Usage:
  bun scripts/triage-rerank-replay.ts [options]

Options:
  --limit <n>           Number of historical emails to evaluate (default: ${DEFAULT_LIMIT})
  --lookback-days <n>   Lookback window in days when --since is not set (default: ${DEFAULT_LOOKBACK_DAYS})
  --since <iso-date>    Start timestamp (ISO-8601); overrides lookback-days
  --mailbox <email>     Restrict replay to one mailbox
  --top-n <n>           Top-K metric depth + rerank top_n (default: ${DEFAULT_TOP_N})
  --concurrency <n>     Parallel email evaluators (default: ${DEFAULT_CONCURRENCY})
  --sample <n>          Number of improved/regressed examples to print (default: ${DEFAULT_SAMPLE})
  --help                Show this help
`);
}

function getArgValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

function parsePositiveInt(
  raw: string | null,
  fallback: number,
  label: string
): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
  return Math.floor(parsed);
}

function parseCliOptions(args: string[]): ReplayOptions {
  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const since = getArgValue(args, "--since");
  if (since && Number.isNaN(Date.parse(since))) {
    throw new Error(`Invalid --since timestamp: ${since}`);
  }

  return {
    concurrency: parsePositiveInt(
      getArgValue(args, "--concurrency"),
      DEFAULT_CONCURRENCY,
      "concurrency"
    ),
    limit: parsePositiveInt(
      getArgValue(args, "--limit"),
      DEFAULT_LIMIT,
      "limit"
    ),
    lookbackDays: parsePositiveInt(
      getArgValue(args, "--lookback-days"),
      DEFAULT_LOOKBACK_DAYS,
      "lookback-days"
    ),
    mailbox: getArgValue(args, "--mailbox"),
    sample: parsePositiveInt(
      getArgValue(args, "--sample"),
      DEFAULT_SAMPLE,
      "sample"
    ),
    since,
    topN: parsePositiveInt(
      getArgValue(args, "--top-n"),
      DEFAULT_TOP_N,
      "top-n"
    ),
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  await runTriageRerankReplay(options);
}

main().catch((error) => {
  console.error("[replay] fatal error", error);
  process.exit(1);
});
