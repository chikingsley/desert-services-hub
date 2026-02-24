/**
 * Monday Sync Targeted — Trigger.dev on-demand task
 *
 * Flexible on-demand counterpart to the scheduled monday-sync task.
 * Two modes:
 *
 *   1. Item mode: provide `itemIds` to sync specific Monday estimates
 *      (fetch → upsert → file download per item)
 *
 *   2. Full mode: omit `itemIds` to run the complete pipeline
 *      (same stages as the scheduled task, but triggered manually)
 *
 * Trigger via API or dashboard when you need to:
 *   - Re-sync a specific estimate after manual Monday edits
 *   - Force-download files for particular items
 *   - Run an immediate full sync without waiting for the 10-min cron
 */

import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runFullMondaySync } from "./monday-sync";

async function runItemMode(itemIds: string[]) {
  const { syncEstimateItem } = await import(
    "@monday/sync/estimate-sync/item-sync"
  );
  const { processItemFiles } = await import("@monday/sync/pipeline");

  let synced = 0;
  let failed = 0;
  let filesDownloaded = 0;

  for (const itemId of itemIds) {
    try {
      const shouldDownloadFiles = await syncEstimateItem(itemId);
      synced++;

      if (shouldDownloadFiles) {
        const count = await processItemFiles(itemId);
        filesDownloaded += count;
        if (count > 0) {
          logger.info("Files downloaded", { itemId, count });
        }
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Item sync failed", { itemId, error: msg });
    }
  }

  logger.info("Targeted item sync complete", {
    requested: itemIds.length,
    synced,
    failed,
    filesDownloaded,
  });

  return { mode: "items" as const, synced, failed, filesDownloaded };
}

export const mondaySyncTargeted = schemaTask({
  id: "monday-sync-targeted",
  schema: z.object({
    itemIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Specific Monday item IDs to sync. Omit for full pipeline."),
  }),
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async ({ itemIds }) => {
    if (itemIds && itemIds.length > 0) {
      logger.info("Starting targeted item sync", { count: itemIds.length });
      return await runItemMode(itemIds);
    }

    logger.info("Starting full pipeline sync (on-demand)");
    return await runFullMondaySync();
  },
});
