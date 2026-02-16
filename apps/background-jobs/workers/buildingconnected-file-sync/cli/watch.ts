#!/usr/bin/env bun

/**
 * BuildingConnected File Sync — Watch Loop
 *
 * Processes BuildingConnected-signaled email attachments and pushes
 * resulting files to SharePoint (project folders or BC archive path).
 *
 * Usage:
 *   bun cli/watch.ts                       # Continuous polling (120s default)
 *   bun cli/watch.ts --once                # Single run then exit
 *   bun cli/watch.ts --interval=30000      # Custom interval (ms)
 *   bun cli/watch.ts --batch=100           # Max attachments per run
 */

import type { BuildingConnectedSyncResult } from "@background-jobs/workers/buildingconnected-file-sync/lib/processing";
import { syncBuildingConnectedFiles } from "@background-jobs/workers/buildingconnected-file-sync/lib/processing";

const DEFAULT_INTERVAL_MS = Number.parseInt(
  process.env.BUILDINGCONNECTED_SYNC_INTERVAL_MS ??
    process.env.ATTACHMENT_BACKFILL_INTERVAL_MS ??
    "120000",
  10
);

const DEFAULT_BATCH_SIZE = Number.parseInt(
  process.env.BUILDINGCONNECTED_SYNC_BATCH_SIZE ??
    process.env.ATTACHMENT_BACKFILL_BATCH_SIZE ??
    "50",
  10
);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalArg = args.find((arg) => arg.startsWith("--interval="));
const batchArg = args.find((arg) => arg.startsWith("--batch="));

const intervalMs = parsePositiveInt(
  intervalArg?.split("=")[1],
  Number.isFinite(DEFAULT_INTERVAL_MS) ? DEFAULT_INTERVAL_MS : 120_000
);
const batchSize = parsePositiveInt(
  batchArg?.split("=")[1],
  Number.isFinite(DEFAULT_BATCH_SIZE) ? DEFAULT_BATCH_SIZE : 50
);

function printSummary(result: BuildingConnectedSyncResult): void {
  console.log(
    `[BC Sync] processed=${result.processed}, succeeded=${result.succeeded}, failed=${result.failed}, skipped=${result.skipped}, elapsedMs=${result.elapsedMs}, rate=${result.attachmentsPerMinute.toFixed(1)}/min`
  );
  if (result.errors.length > 0) {
    console.log(`[BC Sync] errors=${result.errors.length}`);
    for (const err of result.errors.slice(0, 5)) {
      console.log(`  - ${err}`);
    }
  }
}

async function runOnce(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(
    `[BC Sync] ${startedAt} starting (batch=${batchSize}, once=${once})`
  );

  const result = await syncBuildingConnectedFiles({ batchSize });
  printSummary(result);
}

console.log(
  `[BC Sync] watcher started (interval=${intervalMs}ms, batch=${batchSize}, once=${once})`
);

if (once) {
  await runOnce();
  process.exit(0);
}

while (true) {
  try {
    await runOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[BC Sync] run failed: ${msg}`);
  }
  await Bun.sleep(intervalMs);
}
