import { runMondayRelationBackfill } from "@monday/relation-backfill";
import type { CommandHandler } from "./types";

function parseLimit(args: string[]): number | undefined {
  const index = args.indexOf("--limit");
  if (index === -1) {
    return undefined;
  }

  const raw = args[index + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      "Usage: backfill-rel [all|estimating-account|estimating-contacts] [--dry-run] [--limit N] [--active-only]"
    );
  }

  return parsed;
}

export const backfillHandlers: Record<string, CommandHandler> = {
  "backfill-rel": async (args) => {
    const scope = (args[1] ?? "all") as
      | "all"
      | "estimating-account"
      | "estimating-contacts";
    const dryRun = args.includes("--dry-run");
    const activeOnly = args.includes("--active-only");
    const limit = parseLimit(args);

    console.log("Monday relation backfill");
    console.log(`  scope: ${scope}`);
    console.log(`  mode: ${dryRun ? "dry-run" : "write"}`);
    console.log(`  active-only: ${activeOnly ? "yes" : "no"}`);
    console.log(`  limit: ${limit ?? "all resolvable items"}`);

    const result = await runMondayRelationBackfill({
      scope,
      dryRun,
      activeOnly,
      limit,
    });

    for (const chain of result.results) {
      console.log(`\n[${chain.scope}]`);
      console.log(`  total evaluated: ${chain.total}`);
      console.log(`  skipped groups: ${chain.skipped}`);
      if (dryRun) {
        console.log(`  would resolve: ${chain.wouldResolve ?? 0}`);
      } else {
        console.log(`  resolved: ${chain.resolved}`);
        console.log(`  failed: ${chain.failed}`);
      }
    }
  },
};
