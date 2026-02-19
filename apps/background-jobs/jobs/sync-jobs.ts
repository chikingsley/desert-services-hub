import { propagateMissingDocumentProjectIds } from "@lib/db/repositories/intake-document";
import { syncEstimates } from "@monday/sync/estimate-sync/full-sync";
import { syncEstimateItem } from "@monday/sync/estimate-sync/item-sync";
import { processItemFiles } from "@monday/sync/pipeline";
import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@monday/sync/project-seed/sync";
import { syncSharePointFolders } from "@monday/sync/sharepoint-sync";
import { PROJECT_SEED_STALE_DAYS } from "./config";
import {
  enqueueEstimateFileSweep,
  enqueueFullSyncIfMissing,
  enqueueJob,
} from "./queue";
import type { WebhookJob } from "./types";

type EstimateSyncResult = Awaited<ReturnType<typeof syncEstimates>> | null;

export async function processSyncItemJob(job: WebhookJob): Promise<void> {
  if (!job.monday_item_id) {
    return;
  }

  const shouldDownloadFiles = await syncEstimateItem(job.monday_item_id);
  if (shouldDownloadFiles) {
    await enqueueJob("download_files", {
      mondayItemId: job.monday_item_id,
      payload: {},
    });
    console.log(`[worker] Enqueued download_files for ${job.monday_item_id}`);
  }

  await enqueueFullSyncIfMissing(`post-sync_item ${job.monday_item_id}`);
}

export async function processDownloadFilesJob(job: WebhookJob): Promise<void> {
  if (!job.monday_item_id) {
    return;
  }

  const count = await processItemFiles(job.monday_item_id);
  if (count > 0) {
    console.log(
      `[worker] Downloaded ${count} file(s) for ${job.monday_item_id}`
    );
  }
}

export async function processSyncFullJob(): Promise<void> {
  const syncResult = await runFullSyncPipeline();
  await runEstimateSeedSync(syncResult);
  await enqueueEstimateFileSweepIfReady(syncResult);
  await runSharePointSync();
  await runDocumentProjectPropagation();
}

async function runDocumentProjectPropagation(): Promise<void> {
  try {
    await propagateMissingDocumentProjectIds();
  } catch (err) {
    console.error("[worker] Document project propagation failed:", err);
  }
}

async function runFullSyncPipeline(): Promise<EstimateSyncResult> {
  try {
    const syncResult = await syncEstimates();

    console.log(
      `[worker] Full sync: ${syncResult.fetched} fetched, ${syncResult.upserted} upserted, ${syncResult.changes.length} changes`
    );
    console.log(
      `[worker] Link sync: ${syncResult.linkStats.mondayPairsUnique} pairs (${syncResult.linkStats.mondayPairsDirect} direct, ${syncResult.linkStats.mondayPairsLegacy} legacy), ${syncResult.linkStats.estimateContactsResolved} resolved, ${syncResult.linkStats.missingContact} missing-contact, ${syncResult.linkStats.missingEstimate} missing-estimate, ${syncResult.linkStats.contactsSynced} contacts synced, ${syncResult.linkStats.accountsSynced} accounts synced`
    );

    for (const change of syncResult.changes) {
      console.log(
        `[worker]   ${change.name}: ${change.oldStatus ?? "(none)"} -> ${change.newStatus ?? "(none)"}`
      );
    }

    return syncResult;
  } catch (err) {
    console.error("[worker] Estimate sync failed:", err);
    return null;
  }
}

async function runEstimateSeedSync(
  syncResult: EstimateSyncResult
): Promise<void> {
  if (!syncResult) {
    return;
  }

  try {
    const seedStats = await syncProjectSeedsFromEstimates();
    const staleStats = await markStaleProjectSeeds({
      staleDays: PROJECT_SEED_STALE_DAYS,
    });

    console.log(
      `[worker] Project seed sync: ${seedStats.seedGroups} groups from ${seedStats.estimatesScanned} estimates, ${seedStats.projectsCreated} created, ${seedStats.projectsUpdated} updated, ${seedStats.linksInserted} links, ${seedStats.canonicalized} canonical, ${seedStats.promotedToActive} promoted, ${seedStats.movedToLost} moved-to-lost, ${seedStats.linkConflicts} link-conflicts, ${staleStats.movedToLost} stale-to-lost (${PROJECT_SEED_STALE_DAYS}d)`
    );
  } catch (err) {
    console.error("[worker] Project seed sync failed:", err);
  }
}

async function enqueueEstimateFileSweepIfReady(
  syncResult: EstimateSyncResult
): Promise<void> {
  if (!syncResult) {
    return;
  }

  try {
    const sweep = await enqueueEstimateFileSweep(
      syncResult.estimateFileItemIds
    );

    if (sweep.total > 0) {
      console.log(
        `[worker] Estimate extraction sweep: queued ${sweep.queued}/${sweep.batched} items (total with estimate files: ${sweep.total})`
      );
    }
  } catch (err) {
    console.error("[worker] Estimate extraction sweep failed:", err);
  }
}

async function runSharePointSync(): Promise<void> {
  try {
    const spResult = await syncSharePointFolders();
    console.log(
      `[worker] SharePoint sync: ${spResult.processed} processed, ${spResult.created} created, ${spResult.moved} moved, ${spResult.filesUploaded} files uploaded, ${spResult.errors.length} errors`
    );
  } catch (err) {
    console.error("[worker] SharePoint sync failed:", err);
  }
}
