import { processFilesIntake } from "@/apps/web/lib/files-intake";
import { processItemFiles } from "@/apps/web/pipeline";
import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@/apps/workers/estimate-poller/lib/project-seed-sync";
import { syncEstimates } from "@/apps/workers/estimate-poller/lib/sync";
import { syncSharePointFolders } from "@/apps/workers/estimates-sync-worker/lib/sharepoint-sync";
import {
  handleIssuedEmail,
  handlePaymentEmail,
} from "@/apps/workers/notifications/lib/email-triggers";
import { PROJECT_SEED_STALE_DAYS } from "./config";
import { processEmailNotification } from "./email-processing";
import { processEmailResolveJob } from "./email-resolver";
import { startIntakePostProcessing } from "./intake-processing";
import {
  EMAIL_NOTIFICATION_PAYLOAD_SCHEMA,
  EMAIL_RESOLVE_PAYLOAD_SCHEMA,
  INTAKE_PAYLOAD_SCHEMA,
  ISSUED_PAYLOAD_SCHEMA,
  PAYMENT_PAYLOAD_SCHEMA,
} from "./job-schemas";
import { syncItem } from "./monday-sync";
import {
  ensurePermitSyncForPayment,
  extractPointAndPayInvoiceNumber,
  permitIdByInvoice,
} from "./permit-sync";
import {
  enqueueEstimateFileSweep,
  enqueueFullSyncIfMissing,
  enqueueJob,
  parseJobPayload,
  type WebhookJob,
} from "./queue";

type EstimateSyncResult = Awaited<ReturnType<typeof syncEstimates>> | null;

export async function processSyncItemJob(job: WebhookJob): Promise<void> {
  if (!job.monday_item_id) {
    return;
  }

  const shouldDownloadFiles = await syncItem(job.monday_item_id);
  if (shouldDownloadFiles) {
    await enqueueJob.run("download_files", job.monday_item_id, "{}");
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

export async function processEmailNotificationJob(
  job: WebhookJob
): Promise<void> {
  const payload = parseJobPayload(job, EMAIL_NOTIFICATION_PAYLOAD_SCHEMA);
  await processEmailNotification(
    payload.messageId,
    payload.mailboxEmail,
    payload.changeType
  );
}

export async function processEmailResolveJobFromQueue(
  job: WebhookJob
): Promise<void> {
  const { emailId } = parseJobPayload(job, EMAIL_RESOLVE_PAYLOAD_SCHEMA);
  await processEmailResolveJob(emailId);
}

export async function processIntakeJob(job: WebhookJob): Promise<void> {
  if (job.job_type !== "intake") {
    console.warn(
      `[worker] Deprecated intake alias job_type \`${job.job_type}\` encountered; canonical type is \`intake\`.`
    );
  }

  const payload = parseJobPayload(job, INTAKE_PAYLOAD_SCHEMA);
  const results = await processFilesIntake(payload);
  startIntakePostProcessing(results, payload);
}

export async function processDustPermitPaymentJob(
  job: WebhookJob
): Promise<void> {
  const payload = parseJobPayload(job, PAYMENT_PAYLOAD_SCHEMA);
  const invoiceNumber = extractPointAndPayInvoiceNumber(payload.bodyText);

  if (invoiceNumber) {
    const preSyncPermit = await permitIdByInvoice.get(invoiceNumber);
    try {
      await ensurePermitSyncForPayment({ force: !preSyncPermit });
    } catch (error) {
      if (!preSyncPermit) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[worker] Permit company sync failed (non-fatal; mapping already present): ${msg}`
      );
    }

    const postSyncPermit = await permitIdByInvoice.get(invoiceNumber);
    if (!postSyncPermit) {
      throw new Error(
        `No permit found for invoice ${invoiceNumber} after permit sync`
      );
    }
  }

  await handlePaymentEmail(payload);

  if (!invoiceNumber) {
    return;
  }

  try {
    await ensurePermitSyncForPayment();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[worker] Post-payment permit sync failed: ${msg}`);
  }
}

export async function processDustPermitIssuedEmailJob(
  job: WebhookJob
): Promise<void> {
  const payload = parseJobPayload(job, ISSUED_PAYLOAD_SCHEMA);
  await handleIssuedEmail(payload);
}
