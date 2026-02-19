#!/usr/bin/env bun

/**
 * Backfill estimate file download + extraction across Monday-linked estimates.
 *
 * Runs `processItemFiles()` with bounded concurrency. This is intentionally
 * idempotent: items already processed will no-op quickly; failed/missing
 * extractions are retried by the pipeline.
 *
 * Force mode can target failed monday_asset rows and force a re-download
 * for their specific asset IDs.
 *
 * Usage:
 *   bun packages/monday/cli/backfill-files.ts
 *   bun packages/monday/cli/backfill-files.ts --force-failed --limit 25
 *   bun packages/monday/cli/backfill-files.ts --force-failed --item 9758584422 --dry-run
 *
 * Env:
 *   BACKFILL_CONCURRENCY (default 2)
 */

import { db } from "@lib/db/client";
import { processItemFiles } from "@monday/sync/pipeline";

interface EstimateRow {
  monday_item_id: string;
}

interface FailedAssetRow {
  monday_item_id: string;
  monday_asset_id: string;
}

interface CliOptions {
  forceFailed: boolean;
  dryRun: boolean;
  itemId: string | null;
  limit: number | null;
}

function parseConcurrency(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "2", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 2;
  }
  return parsed;
}

function parseOptions(argv: string[]): CliOptions {
  let forceFailed = false;
  let dryRun = false;
  let itemId: string | null = null;
  let limit: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force-failed") {
      forceFailed = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--item") {
      itemId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--limit") {
      const raw = argv[i + 1];
      const parsed = Number.parseInt(raw ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      i += 1;
    }
  }

  return { forceFailed, dryRun, itemId, limit };
}

async function getAllEstimateIds(itemId: string | null): Promise<string[]> {
  if (itemId) {
    return [itemId];
  }

  const rows = await db
    .query<EstimateRow>(
      "SELECT monday_item_id FROM estimates WHERE monday_item_id IS NOT NULL ORDER BY id"
    )
    .all();

  return [...new Set(rows.map((row) => row.monday_item_id).filter(Boolean))];
}

async function getForceFailedTargets(options: {
  itemId: string | null;
  limit: number | null;
}): Promise<Map<string, Set<string>>> {
  const args: unknown[] = [];
  const where: string[] = [
    "source = 'monday_asset'",
    "extraction_status = 'failed'",
    "monday_item_id IS NOT NULL",
    "monday_asset_id IS NOT NULL",
  ];

  if (options.itemId) {
    args.push(options.itemId);
    where.push(`monday_item_id = $${args.length}`);
  }

  let limitSql = "";
  if (options.limit !== null) {
    args.push(options.limit);
    limitSql = ` LIMIT $${args.length}`;
  }

  const rows = await db
    .query<FailedAssetRow>(
      `SELECT monday_item_id, monday_asset_id
       FROM documents
       WHERE ${where.join(" AND ")}
       ORDER BY updated_at DESC${limitSql}`
    )
    .all(...args);

  const targets = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = targets.get(row.monday_item_id) ?? new Set<string>();
    set.add(row.monday_asset_id);
    targets.set(row.monday_item_id, set);
  }
  return targets;
}

function countForItem(
  mondayItemId: string,
  options: CliOptions,
  forceTargets: Map<string, Set<string>> | null
): Promise<number> | number {
  const forceAssetIds = forceTargets?.get(mondayItemId);
  if (options.dryRun) {
    return forceAssetIds?.size ?? 0;
  }
  return processItemFiles(mondayItemId, { forceAssetIds });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const concurrency = parseConcurrency(process.env.BACKFILL_CONCURRENCY);
  const options = parseOptions(process.argv.slice(2));
  const forceTargets = options.forceFailed
    ? await getForceFailedTargets({
        itemId: options.itemId,
        limit: options.limit,
      })
    : null;
  const ids = options.forceFailed
    ? [...(forceTargets?.keys() ?? [])]
    : await getAllEstimateIds(options.itemId);

  const forcedAssetCount = forceTargets
    ? [...forceTargets.values()].reduce((sum, set) => sum + set.size, 0)
    : 0;
  console.log(
    `[backfill] ids=${ids.length} concurrency=${concurrency} force_failed=${options.forceFailed} forced_assets=${forcedAssetCount} dry_run=${options.dryRun}`
  );

  let cursor = 0;
  let processed = 0;
  let errors = 0;
  let withDownloads = 0;
  let downloadedFiles = 0;

  const processOne = async (workerId: number, mondayItemId: string) => {
    const forceAssetIds = forceTargets?.get(mondayItemId);
    const count = await countForItem(mondayItemId, options, forceTargets);
    processed++;
    downloadedFiles += count;
    if (count > 0) {
      withDownloads++;
    }
    if (count > 0 || processed % 100 === 0) {
      console.log(
        `[backfill] progress ${processed}/${ids.length} worker=${workerId} item=${mondayItemId} downloads=${count}${forceAssetIds ? ` forced_assets=${forceAssetIds.size}` : ""}`
      );
    }
  };

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= ids.length) {
        return;
      }

      const mondayItemId = ids[index] as string;
      try {
        await processOne(workerId, mondayItemId);
      } catch (error) {
        processed++;
        errors++;
        const msg = error instanceof Error ? error.message : String(error);
        console.log(
          `[backfill] error ${processed}/${ids.length} worker=${workerId} item=${mondayItemId} ${msg}`
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, (_, index) => worker(index + 1))
  );

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[backfill] done processed=${processed} with_new_files=${withDownloads} downloaded_files=${downloadedFiles} errors=${errors} elapsed_sec=${elapsedSec}`
  );
}

main().catch((error) => {
  const msg =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[backfill] fatal ${msg}`);
  process.exit(1);
});
