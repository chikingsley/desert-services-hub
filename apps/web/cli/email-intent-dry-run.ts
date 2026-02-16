#!/usr/bin/env bun

import { EMAIL_RESOLVER_SPARK_MODEL } from "@/apps/web/jobs/config";
import type { PermitIntentDryRunOptions } from "@/apps/web/lib/email-intent/permit-intent-dry-run";
import { runPermitIntentDryRun } from "@/apps/web/lib/email-intent/permit-intent-dry-run";
import type { PermitIntentRunResult } from "@/apps/web/lib/email-intent/permit-intent-report";
import { printSummary } from "@/apps/web/lib/email-intent/permit-intent-report";

interface CliOptions extends PermitIntentDryRunOptions {
  outputPath: string | null;
}

function usage(): void {
  console.log(
    "Usage: bun apps/web/cli/email-intent-dry-run.ts [--limit N] [--since-days N] [--llm-limit N] [--llm-concurrency N] [--llm-retries N] [--timeout-ms N] [--model NAME] [--include-noise-domains] [--skip-llm] [--output PATH] [--help]"
  );
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function exitWithUsage(): never {
  usage();
  process.exit(0);
}

function parseArgs(argv: string[]): CliOptions {
  let limit = 60;
  let sinceDays = 120;
  let llmLimit: number | null = null;
  let llmConcurrency = 6;
  let llmRetries = 2;
  let timeoutMs = 10_000;
  let model = EMAIL_RESOLVER_SPARK_MODEL;
  let outputPath: string | null = null;
  let includeNoiseDomains = false;
  let skipLlm = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--limit": {
        limit = parsePositiveInt(argv[i + 1], limit);
        i++;
        break;
      }
      case "--since-days": {
        sinceDays = parsePositiveInt(argv[i + 1], sinceDays);
        i++;
        break;
      }
      case "--llm-limit": {
        llmLimit = parsePositiveInt(argv[i + 1], limit);
        i++;
        break;
      }
      case "--llm-concurrency": {
        llmConcurrency = parsePositiveInt(argv[i + 1], llmConcurrency);
        i++;
        break;
      }
      case "--llm-retries": {
        llmRetries = parsePositiveInt(argv[i + 1], llmRetries);
        i++;
        break;
      }
      case "--timeout-ms": {
        timeoutMs = parsePositiveInt(argv[i + 1], timeoutMs);
        i++;
        break;
      }
      case "--model": {
        model = (argv[i + 1] ?? "").trim() || model;
        i++;
        break;
      }
      case "--output": {
        outputPath = (argv[i + 1] ?? "").trim() || null;
        i++;
        break;
      }
      case "--include-noise-domains": {
        includeNoiseDomains = true;
        break;
      }
      case "--skip-llm": {
        skipLlm = true;
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
    includeNoiseDomains,
    limit,
    llmConcurrency,
    llmLimit: Math.max(0, llmLimit ?? limit),
    llmRetries,
    model,
    outputPath,
    sinceDays,
    skipLlm,
    timeoutMs,
  };
}

async function writeOutput(
  outputPath: string,
  opts: CliOptions,
  results: PermitIntentRunResult[]
): Promise<void> {
  const payload = {
    generatedAt: new Date().toISOString(),
    options: opts,
    results,
  };
  await Bun.write(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[email-intent-dry-run] wrote ${outputPath}`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `[email-intent-dry-run] start limit=${opts.limit} sinceDays=${opts.sinceDays} llmLimit=${opts.llmLimit} llmConcurrency=${opts.llmConcurrency} llmRetries=${opts.llmRetries} skipLlm=${opts.skipLlm} includeNoiseDomains=${opts.includeNoiseDomains} model=${opts.model}`
  );

  const { results, llmAnalyzed } = await runPermitIntentDryRun(opts);
  printSummary(results, llmAnalyzed);

  if (opts.outputPath) {
    await writeOutput(opts.outputPath, opts, results);
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[email-intent-dry-run] fatal: ${message}`);
  process.exit(1);
});
