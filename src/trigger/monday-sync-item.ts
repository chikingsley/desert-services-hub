/**
 * Monday Sync Item — Trigger.dev event-driven task
 *
 * Replaces pgmq `sync_item` + `download_files` handlers.
 * Triggered by Monday.com webhooks when an estimate item changes.
 *
 * Pipeline:
 *   1. Sync single estimate item to Postgres
 *   2. Download new file assets if detected
 */

import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";

export const mondaySyncItem = schemaTask({
  id: "monday-sync-item",
  schema: z.object({ mondayItemId: z.string().min(1) }),
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async ({ mondayItemId }) => {
    const { syncEstimateItem } = await import(
      "@monday/sync/estimate-sync/item-sync"
    );
    const shouldDownloadFiles = await syncEstimateItem(mondayItemId);

    logger.info("Item synced", { mondayItemId, shouldDownloadFiles });

    let filesDownloaded = 0;
    if (shouldDownloadFiles) {
      const { processItemFiles } = await import("@monday/sync/pipeline");
      filesDownloaded = await processItemFiles(mondayItemId);

      if (filesDownloaded > 0) {
        logger.info("Files downloaded", { mondayItemId, filesDownloaded });
      }
    }

    return { mondayItemId, shouldDownloadFiles, filesDownloaded };
  },
});
