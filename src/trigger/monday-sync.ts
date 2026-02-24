/**
 * Monday Sync — Trigger.dev tasks
 *
 * Four tasks, one file:
 *   - mondaySyncItem: webhook-driven single item (id: "monday-sync-item")
 *   - mondaySyncTargeted: on-demand item or full sync (id: "monday-sync-targeted")
 *   - mondaySyncIncremental: cron every 10 min via activity log
 *   - mondaySync: cron every 6h full board dump
 *
 * Two-tier sync strategy:
 *   - Every 10 min: Incremental sync via activity log (only changed items)
 *   - Every 6 hours: Full sync (all items, contacts, accounts, status, files)
 *
 * Contacts and accounts are add-only — new records are inserted but existing
 * ones are never overwritten, preserving manual edits and enrichment data.
 */

import { propagateMissingDocumentProjectIds } from "@lib/db/repositories/intake-document";
import { syncEstimateItem } from "@monday/sync/estimate-sync/item-sync";
import { processItemFiles } from "@monday/sync/pipeline";
import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@monday/sync/project-seed/sync";
import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const PROJECT_SEED_STALE_DAYS = 45;

/** Run a pipeline stage, logging failures without halting the pipeline. */
async function safeStage<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${label} failed`, { error: msg });
    return null;
  }
}

/** Sync one estimate item and download any new file assets. */
async function syncAndDownloadItem(itemId: string): Promise<number> {
  const shouldDownload = await syncEstimateItem(itemId);
  if (!shouldDownload) {
    return 0;
  }
  return processItemFiles(itemId);
}

/** Download new file assets for a batch of item IDs. */
async function downloadFilesForItems(itemIds: string[]): Promise<number> {
  let count = 0;
  for (const itemId of itemIds) {
    count += await processItemFiles(itemId);
  }
  return count;
}

/** Project seed sync + document project propagation (cheap DB-only). */
async function runSeedAndPropagation() {
  const seedResult = await safeStage("Project seed sync", async () => {
    const seedStats = await syncProjectSeedsFromEstimates();
    const staleStats = await markStaleProjectSeeds({
      staleDays: PROJECT_SEED_STALE_DAYS,
    });
    logger.info("Project seed sync", {
      groups: seedStats.seedGroups,
      estimates: seedStats.estimatesScanned,
      created: seedStats.projectsCreated,
      updated: seedStats.projectsUpdated,
      promoted: seedStats.promotedToActive,
      movedToLost: seedStats.movedToLost,
      staleToLost: staleStats.movedToLost,
    });
    return {
      created: seedStats.projectsCreated,
      updated: seedStats.projectsUpdated,
      staleToLost: staleStats.movedToLost,
    };
  });

  await safeStage(
    "Document project propagation",
    propagateMissingDocumentProjectIds
  );

  return seedResult;
}

export interface MondayFullSyncResult {
  estimates: { fetched: number; upserted: number; changes: number };
  filesDownloaded: number;
  seed: { created: number; updated: number; staleToLost: number } | null;
  sharepoint: {
    created: number;
    moved: number;
    filesUploaded: number;
  } | null;
  status: { gc: number; leads: number } | "skipped" | null;
}

/** Full Monday sync pipeline — shared between scheduled and on-demand tasks. */
export async function runFullMondaySync(): Promise<MondayFullSyncResult> {
  const { syncEstimates } = await import(
    "@monday/sync/estimate-sync/full-sync"
  );
  const syncResult = await syncEstimates();

  logger.info("Estimate sync complete", {
    fetched: syncResult.fetched,
    upserted: syncResult.upserted,
    errors: syncResult.errors,
    changes: syncResult.changes.length,
    accounts: syncResult.linkStats.accountsSynced,
    contacts: syncResult.linkStats.contactsSynced,
    links: syncResult.linkStats.estimateContactsResolved,
  });

  for (const change of syncResult.changes) {
    logger.info("Bid status change", {
      name: change.name,
      from: change.oldStatus,
      to: change.newStatus,
    });
  }

  const seedResult = await runSeedAndPropagation();

  const statusResult = await safeStage("Status sync", async () => {
    const { pollMondayStatusSync } = await import(
      "@monday/sync/status-sync/poll"
    );
    const result = await pollMondayStatusSync();

    if (result.skipped) {
      logger.warn("Status sync skipped", { reason: result.reason });
      return "skipped" as const;
    }

    logger.info("Status sync complete", {
      gcUpdated: result.gc?.updatedCount ?? 0,
      gcErrors: result.gc?.errors.length ?? 0,
      leadsUpdated: result.leads?.updatedCount ?? 0,
      leadsErrors: result.leads?.errors.length ?? 0,
      projectLinks: result.projectLinks?.enabled ?? false,
    });

    return {
      gc: result.gc?.updatedCount ?? 0,
      leads: result.leads?.updatedCount ?? 0,
    };
  });

  const filesDownloaded = await safeStage("File download sweep", async () => {
    const count = await downloadFilesForItems(syncResult.estimateFileItemIds);
    if (count > 0) {
      logger.info("File download sweep", {
        itemsChecked: syncResult.estimateFileItemIds.length,
        filesDownloaded: count,
      });
    }
    return count;
  });

  const spResult = await safeStage("SharePoint sync", async () => {
    const { syncSharePointFolders } = await import(
      "@monday/sync/sharepoint-sync"
    );
    const result = await syncSharePointFolders();

    logger.info("SharePoint sync", {
      processed: result.processed,
      created: result.created,
      moved: result.moved,
      filesUploaded: result.filesUploaded,
      errors: result.errors.length,
    });

    return {
      created: result.created,
      moved: result.moved,
      filesUploaded: result.filesUploaded,
    };
  });

  return {
    estimates: {
      fetched: syncResult.fetched,
      upserted: syncResult.upserted,
      changes: syncResult.changes.length,
    },
    seed: seedResult,
    status: statusResult,
    filesDownloaded: filesDownloaded ?? 0,
    sharepoint: spResult,
  };
}

/** Webhook-driven: sync a single Monday item when it changes. */
export const mondaySyncItem = schemaTask({
  id: "monday-sync-item",
  schema: z.object({ mondayItemId: z.string().min(1) }),
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async ({ mondayItemId }) => {
    const filesDownloaded = await syncAndDownloadItem(mondayItemId);
    logger.info("Item synced", { mondayItemId, filesDownloaded });
    return { mondayItemId, filesDownloaded };
  },
});

/** On-demand: sync specific items or run the full pipeline. */
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

      let synced = 0;
      let failed = 0;
      let filesDownloaded = 0;

      for (const itemId of itemIds) {
        try {
          filesDownloaded += await syncAndDownloadItem(itemId);
          synced++;
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

    logger.info("Starting full pipeline sync (on-demand)");
    return runFullMondaySync();
  },
});

/** Incremental sync — every 10 minutes via activity log. */
export const mondaySyncIncremental = schedules.task({
  id: "monday-sync-incremental",
  cron: "*/10 * * * *",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async () => {
    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const { result, estimateFileItemIds } = await syncEstimatesIncremental();

    logger.info("Incremental estimate sync", {
      mode: result.mode,
      changedItems: result.changedItemIds,
      totalEvents: result.totalEvents,
      synced: result.synced,
      errors: result.errors,
      filesDetected: result.filesDetected,
    });

    if (result.mode === "full_recommended") {
      logger.warn(
        `Activity log returned ${result.changedItemIds} changed items — deferring to full sync`
      );
      return { ...result, filesDownloaded: 0, seed: null };
    }

    const filesDownloaded =
      estimateFileItemIds.length > 0
        ? ((await safeStage("File downloads", () =>
            downloadFilesForItems(estimateFileItemIds)
          )) ?? 0)
        : 0;

    const seed = await runSeedAndPropagation();

    return { ...result, filesDownloaded, seed };
  },
});

/** Full sync — every 6 hours as a safety net. */
export const mondaySync = schedules.task({
  id: "monday-sync",
  cron: "0 */6 * * *",
  maxDuration: 1200,
  retry: { maxAttempts: 1 },
  run: () => runFullMondaySync(),
});
