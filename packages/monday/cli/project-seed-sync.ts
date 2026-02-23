#!/usr/bin/env bun

import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@monday/sync/project-seed/sync";

interface Args {
  dryRun: boolean;
  limit?: number;
  onlyStale: boolean;
  skipStale: boolean;
  staleDays: number;
}

function usage(): void {
  console.log(
    [
      "Usage:",
      "  bun packages/monday/cli/project-seed-sync.ts [--dry-run] [--limit <n>] [--stale-days <n>] [--skip-stale] [--only-stale]",
      "",
      "Examples:",
      "  bun packages/monday/cli/project-seed-sync.ts",
      "  bun packages/monday/cli/project-seed-sync.ts --dry-run --limit 250",
      "  bun packages/monday/cli/project-seed-sync.ts --only-stale --stale-days 60",
    ].join("\n")
  );
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    dryRun: false,
    staleDays: 45,
    skipStale: false,
    onlyStale: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }
    switch (arg) {
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--skip-stale":
        out.skipStale = true;
        break;
      case "--only-stale":
        out.onlyStale = true;
        break;
      case "--limit": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error("--limit requires a value");
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("--limit must be a positive integer");
        }
        out.limit = parsed;
        i += 1;
        break;
      }
      case "--stale-days": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error("--stale-days requires a value");
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("--stale-days must be a positive integer");
        }
        out.staleDays = parsed;
        i += 1;
        break;
      }
      case "-h":
      case "--help":
        usage();
        process.exit(0);
        return out;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (out.onlyStale) {
    out.skipStale = false;
  }

  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.onlyStale) {
    const seedStats = await syncProjectSeedsFromEstimates({
      dryRun: args.dryRun,
      limit: args.limit,
    });
    console.log(`[project-seed-sync] ${JSON.stringify(seedStats)}`);
  }

  if (!args.skipStale || args.onlyStale) {
    const staleStats = await markStaleProjectSeeds({
      dryRun: args.dryRun,
      staleDays: args.staleDays,
    });
    console.log(
      `[project-seed-sync] stale(days=${args.staleDays}) ${JSON.stringify(staleStats)}`
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[project-seed-sync] ERROR: ${message}`);
  process.exit(1);
});
