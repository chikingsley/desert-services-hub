/**
 * SWPPP Master Sync
 *
 * Synchronizes SWPPP Master data from SharePoint to local SQLite.
 * Run this periodically to keep local data fresh.
 *
 * Usage:
 *   bun services/swppp-master/sync.ts           # Sync all worksheets
 *   bun services/swppp-master/sync.ts --full    # Full refresh (clear + sync)
 */

import { SwpppMasterClient } from "./client";
import { WORKSHEETS, type WorksheetName } from "./config";
import {
  clearWorksheet,
  getLastSyncTime,
  getProjectCounts,
  upsertProjects,
} from "./db";

// ============================================================================
// Sync Functions
// ============================================================================

export interface SyncResult {
  worksheet: WorksheetName;
  rowsSynced: number;
  duration: number;
}

/**
 * Sync a single worksheet from SharePoint to SQLite
 */
export async function syncWorksheet(
  worksheet: WorksheetName,
  options: { fullRefresh?: boolean } = {}
): Promise<SyncResult> {
  const start = Date.now();
  const client = new SwpppMasterClient();

  if (options.fullRefresh) {
    clearWorksheet(worksheet);
  }

  const projects = await client.getProjects(worksheet);
  const rowsSynced = upsertProjects(projects, worksheet);

  return {
    worksheet,
    rowsSynced,
    duration: Date.now() - start,
  };
}

/**
 * Sync all worksheets from SharePoint to SQLite
 */
export async function syncAll(
  options: { fullRefresh?: boolean } = {}
): Promise<SyncResult[]> {
  const worksheets = [
    WORKSHEETS.NEED_TO_SCHEDULE,
    WORKSHEETS.CONFIRMED_SCHEDULE,
    WORKSHEETS.BILLING_VERIFICATION,
  ];

  const results: SyncResult[] = [];

  for (const worksheet of worksheets) {
    const result = await syncWorksheet(worksheet, options);
    results.push(result);
  }

  return results;
}

/**
 * Get sync status for all worksheets
 */
export function getSyncStatus(): {
  worksheets: Array<{
    name: WorksheetName;
    lastSync: string | null;
    rowCount: number;
  }>;
  totalRows: number;
} {
  const counts = getProjectCounts();
  const worksheets = [
    WORKSHEETS.NEED_TO_SCHEDULE,
    WORKSHEETS.CONFIRMED_SCHEDULE,
    WORKSHEETS.BILLING_VERIFICATION,
  ];

  const result = worksheets.map((name) => ({
    name,
    lastSync: getLastSyncTime(name),
    rowCount: counts[name] ?? 0,
  }));

  const totalRows = result.reduce((sum, w) => sum + w.rowCount, 0);

  return { worksheets: result, totalRows };
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fullRefresh = args.includes("--full");

  console.log("SWPPP Master Sync");
  console.log("=================\n");

  if (fullRefresh) {
    console.log("Mode: Full refresh (clearing existing data)\n");
  } else {
    console.log("Mode: Incremental (upsert)\n");
  }

  const results = await syncAll({ fullRefresh });

  console.log("Results:");
  for (const result of results) {
    console.log(
      `  ${result.worksheet}: ${result.rowsSynced} rows (${result.duration}ms)`
    );
  }

  const totalRows = results.reduce((sum, r) => sum + r.rowsSynced, 0);
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\nTotal: ${totalRows} rows synced in ${totalTime}ms`);

  // Show sync status
  console.log("\nSync Status:");
  const status = getSyncStatus();
  for (const ws of status.worksheets) {
    console.log(
      `  ${ws.name}: ${ws.rowCount} rows (last sync: ${ws.lastSync})`
    );
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
