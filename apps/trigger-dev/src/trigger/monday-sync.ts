/**
 * Monday Sync — Trigger.dev tasks
 *
 * Five tasks, one file:
 *   - mondaySyncItem: webhook-driven single item (id: "monday-sync-item")
 *   - mondaySyncFiles: download files for one or more items
 *   - mondaySyncTargeted: on-demand item or full sync (id: "monday-sync-targeted")
 *   - mondaySyncIncremental: cron every 10 min via activity log
 *   - mondaySync: cron every 6h full board dump
 *
 * Two-tier sync strategy:
 *   - Every 10 min: Incremental sync via activity log (only changed items)
 *   - Every 6 hours: Full sync (all items, contacts, accounts, status)
 *
 * Contacts and accounts are add-only — new records are inserted but existing
 * ones are never overwritten, preserving manual edits and enrichment data.
 */

import { propagateMissingDocumentProjectIds } from "@documents-intake/db/intake-document";
import { syncEstimateItem } from "@monday/sync/estimate-sync/item-sync";
import { processItemFiles } from "@monday/sync/pipeline";
import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@monday/sync/project-seed/sync";
import { logger, schedules, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  readPositiveIntEnv,
  taskQueue,
} from "./queue";

const PROJECT_SEED_STALE_DAYS = 45;
const DEFAULT_MONDAY_FILE_BATCH_SIZE = 25;
const DEFAULT_MONDAY_ITEM_BATCH_SIZE = 100;
const MONDAY_FILE_BATCH_SIZE = readPositiveIntEnv(
  "MONDAY_SYNC_FILE_BATCH_SIZE",
  DEFAULT_MONDAY_FILE_BATCH_SIZE
);
const MONDAY_ITEM_BATCH_SIZE = readPositiveIntEnv(
  "MONDAY_SYNC_ITEM_BATCH_SIZE",
  DEFAULT_MONDAY_ITEM_BATCH_SIZE
);
const MONDAY_INCREMENTAL_TASK_DURATION_MS = readPositiveIntEnv(
  "MONDAY_INCREMENTAL_TASK_DURATION_MS",
  420_000
);
const MONDAY_INCREMENTAL_TASK_QUEUE_SLACK_MS = 30_000;
const MONDAY_INCREMENTAL_TASK_MAX_CHANGED_ITEMS = readPositiveIntEnv(
  "MONDAY_INCREMENTAL_MAX_CHANGED_ITEMS",
  500
);
const MONDAY_INCREMENTAL_TASK_MAX_SECONDS = readPositiveIntEnv(
  "MONDAY_INCREMENTAL_TASK_MAX_SECONDS",
  420
);
const MONDAY_SYNC_ITEM_QUEUE = taskQueue(
  "monday-sync-item",
  "MONDAY_SYNC_ITEM_QUEUE_CONCURRENCY",
  2
);
const MONDAY_SYNC_PIPELINE_QUEUE = taskQueue(
  "monday-sync-pipeline",
  "MONDAY_SYNC_PIPELINE_QUEUE_CONCURRENCY",
  1
);
const MONDAY_SYNC_FILES_QUEUE = taskQueue(
  "monday-sync-files",
  "MONDAY_SYNC_FILES_QUEUE_CONCURRENCY",
  2
);

type FileSyncSource = "item" | "incremental" | "targeted" | "full";

interface QueueResult {
  failed: number;
  queued: number;
  truncated: boolean;
}

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

function dedupeItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function queueFileDownloads(
  itemIds: string[],
  source: FileSyncSource,
  options: { deadlineMs?: number } = {}
): Promise<QueueResult> {
  const ids = dedupeItemIds(itemIds);
  if (ids.length === 0) {
    return { queued: 0, failed: 0, truncated: false };
  }

  const { deadlineMs } = options;
  const batches = chunkArray(ids, MONDAY_FILE_BATCH_SIZE);
  let queued = 0;
  let failed = 0;
  let truncated = false;

  for (const batch of batches) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      truncated = true;
      break;
    }

    const batchResults = await Promise.all(
      batch.map(async (itemId) => {
        try {
          await tasks.trigger("monday-sync-files", {
            itemIds: [itemId],
            source,
          });
          return { ok: true };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.warn("Failed to queue monday file sync", {
            source,
            mondayItemId: itemId,
            error: message,
          });
          return { ok: false };
        }
      })
    );

    for (const result of batchResults) {
      if (result.ok) {
        queued += 1;
      } else {
        failed += 1;
      }
    }

    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      truncated = true;
      break;
    }
  }

  return { queued, failed, truncated };
}

async function queueItemSyncs(
  itemIds: string[],
  options: { deadlineMs?: number } = {}
): Promise<QueueResult> {
  const ids = dedupeItemIds(itemIds);
  if (ids.length === 0) {
    return { queued: 0, failed: 0, truncated: false };
  }

  const { deadlineMs } = options;
  let queued = 0;
  let failed = 0;
  let truncated = false;

  const batches = chunkArray(ids, MONDAY_ITEM_BATCH_SIZE);
  for (const batch of batches) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      truncated = true;
      break;
    }

    const batchResults = await Promise.all(
      batch.map(async (itemId) => {
        try {
          await tasks.trigger("monday-sync-item", {
            mondayItemId: itemId,
          });
          return { ok: true };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.warn("Failed to queue monday item sync", {
            mondayItemId: itemId,
            error: message,
          });
          return { ok: false };
        }
      })
    );

    for (const result of batchResults) {
      if (result.ok) {
        queued += 1;
      } else {
        failed += 1;
      }
    }

    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      truncated = true;
      break;
    }
  }

  return { queued, failed, truncated };
}

/** Sync one estimate item and enqueue file downloads if needed. */
async function syncAndQueueItemFiles(
  itemId: string,
  source: FileSyncSource
): Promise<number> {
  const shouldDownload = await syncEstimateItem(itemId);
  if (!shouldDownload) {
    return 0;
  }

  const result = await queueFileDownloads([itemId], source);
  return result.queued;
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

  const filesQueued = await safeStage("File download enqueue", async () => {
    const { queued, failed } = await queueFileDownloads(
      syncResult.estimateFileItemIds,
      "full"
    );

    if (failed > 0) {
      logger.warn("Some monday file downloads failed to queue", {
        source: "full",
        queued,
        failed,
      });
    }

    if (queued > 0) {
      logger.info("File download enqueue", {
        source: "full",
        itemsQueued: queued,
        failed,
        batches: Math.ceil(
          (queued + failed) / Math.max(1, MONDAY_FILE_BATCH_SIZE)
        ),
      });
    }

    return queued;
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

  await safeStage("Relation backfill", async () => {
    await tasks.trigger("monday-relation-backfill", {
      scope: "all",
      dryRun: false,
    });
    logger.info("Relation backfill triggered");
  });

  return {
    estimates: {
      fetched: syncResult.fetched,
      upserted: syncResult.upserted,
      changes: syncResult.changes.length,
    },
    seed: seedResult,
    status: statusResult,
    filesDownloaded: filesQueued ?? 0,
    sharepoint: spResult,
  };
}

/** File download worker for one or more Monday items. */
export const mondaySyncFiles = schemaTask({
  id: "monday-sync-files",
  queue: MONDAY_SYNC_FILES_QUEUE,
  schema: z.object({
    itemIds: z
      .array(z.string().min(1))
      .min(1)
      .describe("Monday item IDs whose files should be downloaded."),
    source: z
      .enum(["item", "incremental", "targeted", "full"])
      .optional()
      .describe("Upstream path that scheduled this file sync."),
  }),
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async ({ itemIds, source }) => {
    const uniqueItemIds = dedupeItemIds(itemIds);
    let filesDownloaded = 0;
    let failed = 0;

    for (const itemId of uniqueItemIds) {
      try {
        filesDownloaded += await processItemFiles(itemId);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Failed to process item files", {
          mondayItemId: itemId,
          source,
          error: message,
        });
      }
    }

    logger.info("Item file sync complete", {
      source,
      itemsChecked: uniqueItemIds.length,
      filesDownloaded,
      failed,
    });

    return {
      source: source ?? "full",
      itemsChecked: uniqueItemIds.length,
      filesDownloaded,
      failed,
    };
  },
});

/** Webhook-driven: sync a single Monday item when it changes. */
export const mondaySyncItem = schemaTask({
  id: "monday-sync-item",
  queue: MONDAY_SYNC_ITEM_QUEUE,
  schema: z.object({ mondayItemId: z.string().min(1) }),
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async ({ mondayItemId }) => {
    const filesDownloaded = await syncAndQueueItemFiles(mondayItemId, "item");
    logger.info("Item synced", { mondayItemId, filesDownloaded });
    return { mondayItemId, filesDownloaded };
  },
});

/** On-demand: sync specific items or run the full pipeline. */
export const mondaySyncTargeted = schemaTask({
  id: "monday-sync-targeted",
  queue: MONDAY_SYNC_PIPELINE_QUEUE,
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

      const queueResult = await queueItemSyncs(itemIds);

      logger.info("Targeted item sync complete", {
        requested: itemIds.length,
        synced: queueResult.queued,
        failed: queueResult.failed,
        itemsQueued: queueResult.queued,
      });

      return {
        mode: "items" as const,
        synced: queueResult.queued,
        failed: queueResult.failed,
        filesDownloaded: queueResult.queued,
      };
    }

    logger.info("Starting full pipeline sync (on-demand)");
    return runFullMondaySync();
  },
});

/** Incremental sync — every 10 minutes via activity log. */
export const mondaySyncIncremental = schedules.task({
  id: "monday-sync-incremental",
  queue: MONDAY_SYNC_PIPELINE_QUEUE,
  cron: "*/10 * * * *",
  maxDuration: MONDAY_INCREMENTAL_TASK_MAX_SECONDS,
  retry: { maxAttempts: 1 },
  run: async () => {
    const taskStartMs = Date.now();
    const { setIncrementalSyncCursor, syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const { result, estimateItemIds, latestTimestamp } =
      await syncEstimatesIncremental({
        maxDurationMs: MONDAY_INCREMENTAL_TASK_DURATION_MS,
      });

    logger.info("Incremental estimate sync", {
      mode: result.mode,
      changedItems: result.changedItemIds,
      totalEvents: result.totalEvents,
      synced: result.synced,
      errors: result.errors,
      filesDetected: result.filesDetected,
      scanTruncated: result.metadata.truncated,
      scanTruncateReason: result.metadata.reason ?? null,
    });

    if (result.mode === "full_recommended") {
      logger.warn(
        `Activity log returned ${result.changedItemIds} changed items — scheduling full sync fallback`
      );

      await tasks.trigger("monday-sync", {}).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to schedule monday-sync fallback", {
          error: message,
        });
      });

      if (latestTimestamp) {
        await setIncrementalSyncCursor(latestTimestamp);
      }

      return {
        ...result,
        filesDownloaded: 0,
        fallbackScheduled: true,
      };
    }

    if (
      result.mode === "incremental" &&
      estimateItemIds.length > MONDAY_INCREMENTAL_TASK_MAX_CHANGED_ITEMS
    ) {
      logger.warn(
        "Incremental run exceeded hard cap for changed items — scheduling full sync fallback",
        {
          requested: estimateItemIds.length,
          hardCap: MONDAY_INCREMENTAL_TASK_MAX_CHANGED_ITEMS,
          mode: result.mode,
        }
      );

      await tasks.trigger("monday-sync", {}).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to schedule monday-sync fallback", {
          error: message,
        });
      });

      if (latestTimestamp) {
        await setIncrementalSyncCursor(latestTimestamp);
      }

      return {
        ...result,
        synced: 0,
        errors: 0,
        filesDownloaded: 0,
        fallbackScheduled: true,
      };
    }

    const queueDeadlineMs = Math.max(
      taskStartMs +
        MONDAY_INCREMENTAL_TASK_MAX_SECONDS * 1000 -
        MONDAY_INCREMENTAL_TASK_QUEUE_SLACK_MS,
      Date.now()
    );
    const queueResult = await queueItemSyncs(estimateItemIds, {
      deadlineMs: queueDeadlineMs,
    });
    let seed: { created: number; updated: number; staleToLost: number } | null =
      null;

    if (queueResult.truncated) {
      logger.warn(
        "Incremental queue budget exhausted — scheduling full sync fallback",
        {
          requested: estimateItemIds.length,
          queued: queueResult.queued,
          failed: queueResult.failed,
        }
      );

      await tasks.trigger("monday-sync", {}).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to schedule monday-sync fallback", {
          error: message,
        });
      });

      if (latestTimestamp) {
        await setIncrementalSyncCursor(latestTimestamp);
      }

      return {
        ...result,
        synced: queueResult.queued,
        errors: queueResult.failed,
        filesDownloaded: queueResult.queued,
        fallbackScheduled: true,
      };
    }

    if (queueResult.queued === estimateItemIds.length && latestTimestamp) {
      await setIncrementalSyncCursor(latestTimestamp);
      seed = await runSeedAndPropagation();
    } else if (queueResult.queued > 0) {
      logger.warn("Skipping seed sync due to partial item queue failure", {
        queued: queueResult.queued,
        failed: queueResult.failed,
      });
    } else if (estimateItemIds.length > 0) {
      logger.error("No monday item sync tasks queued", {
        candidateItems: estimateItemIds.length,
      });
    }

    if (queueResult.failed > 0) {
      logger.warn("Some monday item syncs failed to queue", {
        queued: queueResult.queued,
        failed: queueResult.failed,
      });
    }

    const filesDownloaded = queueResult.queued;

    return {
      ...result,
      synced: queueResult.queued,
      errors: queueResult.failed,
      filesDownloaded,
      seed,
    };
  },
});

/** Full sync — every 6 hours as a safety net. */
export const mondaySync = schedules.task({
  id: "monday-sync",
  queue: MONDAY_SYNC_PIPELINE_QUEUE,
  cron: "0 */6 * * *",
  maxDuration: 1200,
  retry: { maxAttempts: 1 },
  run: () => runFullMondaySync(),
});
