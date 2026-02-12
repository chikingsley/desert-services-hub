#!/usr/bin/env bun

/**
 * SWPPP Sync — Poll Loop
 *
 * Polls SharePoint SWPPP Master Excel and syncs into Supabase Postgres.
 *
 * Usage:
 *   bun cli/sync.ts                    # Continuous polling (60s default)
 *   bun cli/sync.ts --once             # Single sync then exit
 *   bun cli/sync.ts --interval=30000   # Custom interval (ms)
 */

import { syncAll } from "@/apps/workers/swppp-sync/lib/sync";

const DEFAULT_INTERVAL_MS = 60 * 1000; // 60 seconds

const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const interval = intervalArg
  ? Number.parseInt(
      intervalArg.split("=")[1] ?? String(DEFAULT_INTERVAL_MS),
      10
    )
  : DEFAULT_INTERVAL_MS;

async function run(): Promise<void> {
  console.log(`[SWPPP Sync] ${new Date().toISOString()}`);

  try {
    const summary = await syncAll();

    for (const r of summary.results) {
      console.log(`  ${r.worksheet}: ${r.rowsSynced} rows (${r.duration}ms)`);
    }
    console.log(
      `  Total: ${summary.totalRows} rows, ${summary.totalLinked} linked, ${summary.totalUnlinked} unlinked (${summary.duration}ms)`
    );
  } catch (err) {
    console.error("[SWPPP Sync] Error:", err);
  }
}

console.log(`[SWPPP Sync] Starting. Interval: ${interval}ms, Once: ${once}`);

if (once) {
  await run();
} else {
  while (true) {
    await run();
    console.log(
      `[SWPPP Sync] Next sync at ${new Date(Date.now() + interval).toISOString()}\n`
    );
    await Bun.sleep(interval);
  }
}
