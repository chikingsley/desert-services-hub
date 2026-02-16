#!/usr/bin/env bun

/**
 * Backfill estimate file download + extraction across all Monday-linked estimates.
 *
 * Runs `processItemFiles()` with bounded concurrency. This is intentionally
 * idempotent: items already processed will no-op quickly; failed/missing
 * extractions are retried by the pipeline.
 *
 * Usage:
 *   bun apps/web/cli/backfill-estimate-extraction.ts
 *
 * Env:
 *   BACKFILL_CONCURRENCY (default 2)
 */

import { db } from "@lib/db/hub";
import { processItemFiles } from "@monday/sync/pipeline";

interface EstimateRow {
  monday_item_id: string;
}

function parseConcurrency(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "2", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 2;
  }
  return parsed;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const concurrency = parseConcurrency(process.env.BACKFILL_CONCURRENCY);

  const rows = await db
    .query<EstimateRow>(
      "SELECT monday_item_id FROM estimates WHERE monday_item_id IS NOT NULL ORDER BY id"
    )
    .all();

  const ids = [
    ...new Set(rows.map((row) => row.monday_item_id).filter(Boolean)),
  ];

  console.log(`[backfill] ids=${ids.length} concurrency=${concurrency}`);

  let cursor = 0;
  let processed = 0;
  let errors = 0;
  let withDownloads = 0;
  let downloadedFiles = 0;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= ids.length) {
        return;
      }

      const mondayItemId = ids[index] as string;

      try {
        const count = await processItemFiles(mondayItemId);
        processed++;
        downloadedFiles += count;
        if (count > 0) {
          withDownloads++;
        }
        if (count > 0 || processed % 100 === 0) {
          console.log(
            `[backfill] progress ${processed}/${ids.length} worker=${workerId} item=${mondayItemId} downloads=${count}`
          );
        }
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
