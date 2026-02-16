#!/usr/bin/env bun

import { EMAIL_RESOLVER_SPARK_MODEL } from "@/apps/background-jobs/jobs/config";
import type {
  PermitIntentFixtureCaseResult,
  PermitIntentFixtureFile,
  PermitIntentFixtureRunStats,
} from "@/apps/background-jobs/lib/email-intent/permit-intent-fixture";
import { evaluateFixtureCase } from "@/apps/background-jobs/lib/email-intent/permit-intent-fixture";

interface CliOptions {
  fixturePath: string;
  model: string;
  timeoutMs: number;
  skipLlm: boolean;
  llmLimit: number;
  minModelPassRate: number;
  outputPath: string | null;
}

function usage(): void {
  console.log(
    "Usage: bun apps/webhooks/cli/email-intent-fixture-check.ts [--fixture PATH] [--skip-llm] [--llm-limit N] [--timeout-ms N] [--model NAME] [--min-model-pass-rate R] [--output PATH]"
  );
}

function exitWithUsage(): never {
  usage();
  process.exit(0);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function parseRate(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
}

function parseArgs(argv: string[]): CliOptions {
  let fixturePath = "tests/fixtures/email-intent/permit-intent-fixture.json";
  let model = EMAIL_RESOLVER_SPARK_MODEL;
  let timeoutMs = 12_000;
  let skipLlm = false;
  let llmLimit = 999;
  let minModelPassRate = 0;
  let outputPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--fixture": {
        fixturePath = (argv[i + 1] ?? "").trim() || fixturePath;
        i++;
        break;
      }
      case "--model": {
        model = (argv[i + 1] ?? "").trim() || model;
        i++;
        break;
      }
      case "--timeout-ms": {
        timeoutMs = parsePositiveInt(argv[i + 1], timeoutMs);
        i++;
        break;
      }
      case "--skip-llm": {
        skipLlm = true;
        break;
      }
      case "--llm-limit": {
        llmLimit = parsePositiveInt(argv[i + 1], llmLimit);
        i++;
        break;
      }
      case "--min-model-pass-rate": {
        minModelPassRate = parseRate(argv[i + 1], minModelPassRate);
        i++;
        break;
      }
      case "--output": {
        outputPath = (argv[i + 1] ?? "").trim() || null;
        i++;
        break;
      }
      case "--help":
      case "-h": {
        return exitWithUsage();
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }

  return {
    fixturePath,
    llmLimit,
    minModelPassRate,
    model,
    outputPath,
    skipLlm,
    timeoutMs,
  };
}

function printSummary(
  results: PermitIntentFixtureCaseResult[],
  heuristicFailures: PermitIntentFixtureCaseResult[],
  modelPasses: number,
  modelPassRate: number
): void {
  const modelRows = results.filter((r) => r.modelPass !== null);

  console.log("\nHeuristic checks:");
  console.log(`  pass=${results.length - heuristicFailures.length}`);
  console.log(`  fail=${heuristicFailures.length}`);

  if (heuristicFailures.length > 0) {
    console.log("\nHeuristic failures:");
    for (const failure of heuristicFailures) {
      console.log(
        `  ${failure.id}: expected=${failure.expectedHeuristicIntent} got=${failure.actualHeuristicIntent} expectedSignal=${failure.expectedHasPermitSignal} gotSignal=${failure.actualHasPermitSignal}`
      );
    }
  }

  console.log("\nModel checks (Spark):");
  console.log(`  checked=${modelRows.length}`);
  console.log(`  pass=${modelPasses}`);
  console.log(`  pass_rate=${modelPassRate.toFixed(3)}`);
}

async function writeOutputIfRequested(
  opts: CliOptions,
  fixtureVersion: string,
  results: PermitIntentFixtureCaseResult[],
  heuristicFailures: PermitIntentFixtureCaseResult[],
  modelChecked: number,
  modelPasses: number,
  modelPassRate: number
): Promise<void> {
  if (!opts.outputPath) {
    return;
  }

  const payload = {
    fixtureVersion,
    generatedAt: new Date().toISOString(),
    options: opts,
    results,
    summary: {
      total: results.length,
      heuristicPasses: results.length - heuristicFailures.length,
      heuristicFailures: heuristicFailures.length,
      modelChecked,
      modelPasses,
      modelPassRate,
    },
  };
  await Bun.write(opts.outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n[email-intent-fixture-check] wrote ${opts.outputPath}`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const fixture = (await Bun.file(
    opts.fixturePath
  ).json()) as PermitIntentFixtureFile;
  const results: PermitIntentFixtureCaseResult[] = [];
  const stats: PermitIntentFixtureRunStats = {
    modelChecked: 0,
    modelPasses: 0,
  };

  console.log(
    `[email-intent-fixture-check] fixture=${opts.fixturePath} cases=${fixture.cases.length} skipLlm=${opts.skipLlm} model=${opts.model}`
  );

  for (const [idx, c] of fixture.cases.entries()) {
    results.push(await evaluateFixtureCase(c, idx, opts, stats));
  }

  const heuristicFailures = results.filter((r) => !r.heuristicPass);
  const modelRows = results.filter((r) => r.modelPass !== null);
  const modelPassRate =
    modelRows.length > 0 ? stats.modelPasses / modelRows.length : 0;

  printSummary(results, heuristicFailures, stats.modelPasses, modelPassRate);
  await writeOutputIfRequested(
    opts,
    fixture.version,
    results,
    heuristicFailures,
    modelRows.length,
    stats.modelPasses,
    modelPassRate
  );

  if (heuristicFailures.length > 0) {
    process.exit(1);
  }

  if (
    opts.minModelPassRate > 0 &&
    modelRows.length > 0 &&
    modelPassRate < opts.minModelPassRate
  ) {
    console.error(
      `[email-intent-fixture-check] model pass rate ${modelPassRate.toFixed(3)} below minimum ${opts.minModelPassRate.toFixed(3)}`
    );
    process.exit(1);
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[email-intent-fixture-check] fatal: ${message}`);
  process.exit(1);
});
