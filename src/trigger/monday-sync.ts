/**
 * Monday Sync — Trigger.dev scheduled task
 *
 * Two-tier sync strategy:
 *   - **Every 10 min**: Incremental sync via activity log (only changed items)
 *   - **Every 6 hours**: Full sync (all items, contacts, accounts, status, files)
 *
 * The incremental sync typically processes 0-20 items in seconds.
 * The full sync processes ~4,780 items and takes 5-15 minutes.
 *
 * If the activity log returns too many changes (>500), the incremental
 * sync falls back to a full sync automatically.
 *
 * Pipeline stages (full sync only):
 *   1. Estimate sync (ESTIMATING board → Postgres estimates table)
 *   2. Project seed (group estimates → projects)
 *   3. Status sync (GC cleanup, leads, project links)
 *   4. File download sweep (new Monday assets only)
 *   5. SharePoint folder sync
 *   6. Document project propagation
 *
 * Contacts and accounts are add-only — new records are inserted but existing
 * ones are never overwritten, preserving manual edits and enrichment data.
 *
 * The full pipeline is exported as `runFullMondaySync()` for reuse by the
 * on-demand monday-sync-targeted task.
 */

import { logger, schedules } from "@trigger.dev/sdk/v3";

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

export interface MondayFullSyncResult {
  estimates: { fetched: number; upserted: number; changes: number };
  filesDownloaded: number;
  seed: { created: number; updated: number } | null;
  sharepoint: {
    created: number;
    moved: number;
    filesUploaded: number;
  } | null;
  status: { gc: number; leads: number } | "skipped" | null;
}

/** Full Monday sync pipeline — shared between scheduled and on-demand tasks. */
export async function runFullMondaySync(): Promise<MondayFullSyncResult> {
  // 1. Estimate sync — no safeStage; failure here should halt the pipeline
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

  // 2. Project seed (group estimates → projects)
  const seedResult = await safeStage("Project seed sync", async () => {
    const { syncProjectSeedsFromEstimates, markStaleProjectSeeds } =
      await import("@monday/sync/project-seed/sync");
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
    };
  });

  // 3. Status sync (GC cleanup + leads + project links)
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

  // 4. File download sweep (only new assets)
  const filesDownloaded = await safeStage("File download sweep", async () => {
    const { processItemFiles } = await import("@monday/sync/pipeline");
    let count = 0;
    for (const itemId of syncResult.estimateFileItemIds) {
      count += await processItemFiles(itemId);
    }

    if (count > 0) {
      logger.info("File download sweep", {
        itemsChecked: syncResult.estimateFileItemIds.length,
        filesDownloaded: count,
      });
    }

    return count;
  });

  // 5. SharePoint folder sync
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

  // 6. Document project propagation
  await safeStage("Document project propagation", async () => {
    const { propagateMissingDocumentProjectIds } = await import(
      "@lib/db/repositories/intake-document"
    );
    await propagateMissingDocumentProjectIds();
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

/**
 * Incremental sync — runs every 10 minutes.
 *
 * Queries the Monday.com activity log for items changed since the last sync,
 * then syncs only those items. If the activity log indicates too many changes
 * (>500 items), falls back to a full sync.
 *
 * Also runs project seed and document propagation (cheap DB-only operations)
 * on every cycle to keep projects up to date.
 */
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

    // If activity log had too many changes, the full sync will handle it
    if (result.mode === "full_recommended") {
      logger.warn(
        `Activity log returned ${result.changedItemIds} changed items — deferring to full sync`
      );
      return { ...result, filesDownloaded: 0, seed: null };
    }

    // Download files for changed items that have new assets
    let filesDownloaded = 0;
    if (estimateFileItemIds.length > 0) {
      const downloaded = await safeStage("File downloads", async () => {
        const { processItemFiles } = await import("@monday/sync/pipeline");
        let count = 0;
        for (const itemId of estimateFileItemIds) {
          count += await processItemFiles(itemId);
        }
        return count;
      });
      filesDownloaded = downloaded ?? 0;
    }

    // Run project seed (cheap, DB-only) to keep projects current
    const seedResult = await safeStage("Project seed sync", async () => {
      const { syncProjectSeedsFromEstimates, markStaleProjectSeeds } =
        await import("@monday/sync/project-seed/sync");
      const seedStats = await syncProjectSeedsFromEstimates();
      const staleStats = await markStaleProjectSeeds({
        staleDays: PROJECT_SEED_STALE_DAYS,
      });
      return {
        created: seedStats.projectsCreated,
        updated: seedStats.projectsUpdated,
        staleToLost: staleStats.movedToLost,
      };
    });

    // Document project propagation (1 SQL query)
    await safeStage("Document project propagation", async () => {
      const { propagateMissingDocumentProjectIds } = await import(
        "@lib/db/repositories/intake-document"
      );
      await propagateMissingDocumentProjectIds();
    });

    return { ...result, filesDownloaded, seed: seedResult };
  },
});

/**
 * Full sync — runs every 6 hours as a safety net.
 *
 * Does the complete board dump: all estimates, contacts, accounts,
 * status sync, file downloads, SharePoint sync. This catches anything
 * the incremental sync or webhooks might have missed.
 */
export const mondaySync = schedules.task({
  id: "monday-sync",
  cron: "0 */6 * * *",
  maxDuration: 1200,
  retry: { maxAttempts: 1 },
  run: async () => runFullMondaySync(),
});
