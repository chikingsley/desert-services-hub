/**
 * Job dispatch — dequeue jobs and route to the appropriate handler.
 *
 * NOTE: Many jobs have been migrated to Trigger.dev (src/trigger/):
 *   - email_notification → email-sync
 *   - mailbox_fallback_sync → mailbox-sync
 *   - body_link_backfill → body-link-intake
 *   - permit_sync → permit-sync
 *   - permit_detail_scrape → permit-detail-scrape
 *   - sync_full, sync_item, download_files, monday_status_sync → monday-sync / monday-sync-item
 *
 * Jobs removed because their dependencies were deleted:
 *   - contact_enrichment, email_triage_batch, folder_watcher_poll,
 *     estimate_linker_maintenance, link_estimate, sync_bc_file,
 *     account_linking, contact_linking, subscription_renewal,
 *     group_sync, notifications_tick
 */

import type { ContractDocExtractPayload } from "@contract/types";
import { runEstimateExtractionTriage } from "@lib/db/repositories/estimate";
import {
  AQDATA_DETAIL_SCRAPE_BATCH_SIZE,
  ATTACHMENT_BACKFILL_BATCH_SIZE,
  ATTACHMENT_BACKFILL_CONCURRENCY,
  CONTRACT_WON_BRIDGE_ENABLED,
  ESTIMATE_TRIAGE_ENABLED,
  MAX_CONCURRENT_JOBS,
  MAX_LLM_CONCURRENT_JOBS,
} from "./config";
import {
  processBodyLinkManualFollowupJob,
  processContractEmailReceivedJob,
  processDustPermitIssuedEmailJob,
  processDustPermitPaymentJob,
  processIntakeJob,
} from "./event-jobs";
import { completeJob, dequeue, failJob, parseJobPayload } from "./queue";
import type { WebhookJob } from "./types";

const LLM_JOB_TYPES = new Set(["contract_doc_extract", "estimate_triage"]);

let activeJobs = 0;
let activeLlmJobs = 0;

export function getActiveJobCount(): number {
  return activeJobs;
}

async function handleContractDocExtract(job: WebhookJob): Promise<void> {
  const { processContractDocExtractJob } = await import(
    "@contract/contract-doc-extract-queue"
  );
  const extractPayload = JSON.parse(job.payload) as ContractDocExtractPayload;
  await processContractDocExtractJob(extractPayload);
}

async function handleEstimateTriage(job: WebhookJob): Promise<void> {
  if (!ESTIMATE_TRIAGE_ENABLED) {
    return;
  }
  const { ESTIMATE_TRIAGE_PAYLOAD_SCHEMA } = await import("./job-schemas");
  const payload = parseJobPayload(job, ESTIMATE_TRIAGE_PAYLOAD_SCHEMA);
  const result = await runEstimateExtractionTriage(payload.maxRows);
  if (result.candidateRows > 0) {
    console.log(
      `[worker] Estimate triage: candidates=${result.candidateRows}, reset=${result.resetToPending}, non_pdf=${result.markedNonPdf}, no_asset=${result.skippedNoAsset}`
    );
  }
}

async function handleAttachmentBackfill(): Promise<void> {
  const { processIntakeAttachmentBackfill } = await import(
    "@documents-intake/attachment-backfill"
  );
  const result = await processIntakeAttachmentBackfill({
    batchSize: ATTACHMENT_BACKFILL_BATCH_SIZE,
    concurrency: ATTACHMENT_BACKFILL_CONCURRENCY,
  });
  if (result.processed > 0 || result.skipped > 0 || result.deduped > 0) {
    console.log(
      `[worker] Attachment backfill: ${result.succeeded} ok, ${result.failed} failed, ${result.deduped} deduped, ${result.skipped} skipped, ${result.elapsedMs}ms, ${result.attachmentsPerMinute.toFixed(1)} items/min`
    );
  }
}

async function handleContractWonBridge(): Promise<void> {
  if (!CONTRACT_WON_BRIDGE_ENABLED) {
    return;
  }
  const { runContractWonBridge } = await import(
    "@background-jobs/jobs/contracts-won-bridge"
  );
  const { syncProjectSeedsFromEstimates } = await import(
    "@monday/sync/project-seed/sync"
  );

  const stats = await runContractWonBridge();
  const lifecycleActivity =
    stats.estimatesMarkedWon + stats.estimatesMarkedLost;
  if (lifecycleActivity > 0) {
    try {
      const seedStats = await syncProjectSeedsFromEstimates();
      console.log(
        `[worker] Contract won bridge lifecycle refresh: ${seedStats.projectsUpdated} projects updated, ${seedStats.promotedToActive} promoted, ${seedStats.movedToLost} moved-to-lost`
      );
    } catch (err) {
      console.error(
        "[worker] Contract won bridge lifecycle refresh failed:",
        err
      );
    }
  }

  const activity =
    stats.contractsClassified +
    stats.contractsLinked +
    stats.contractDocExtractsEnqueued +
    stats.documentsBackfilled +
    stats.estimatesMarkedWon +
    stats.estimatesMarkedLost;
  if (activity > 0) {
    console.log(
      `[worker] Contract won bridge: classified=${stats.contractsClassified}, linked=${stats.contractsLinked}, extract_jobs=${stats.contractDocExtractsEnqueued}, docs=${stats.documentsBackfilled}, won=${stats.estimatesMarkedWon}, lost=${stats.estimatesMarkedLost}, monday=${stats.mondayUpdates}${stats.errors.length > 0 ? ` (${stats.errors.length} errors)` : ""}`
    );
  }
}

const JOB_HANDLERS: Record<string, (job: WebhookJob) => Promise<void>> = {
  // Document intake + contracts
  intake: processIntakeJob,
  contract_doc_extract: handleContractDocExtract,
  contract_email_received: processContractEmailReceivedJob,
  contract_won_bridge: async () => handleContractWonBridge(),

  // Permits
  dust_permit_payment: processDustPermitPaymentJob,
  dust_permit_issued_email: processDustPermitIssuedEmailJob,

  // Estimates
  estimate_triage: handleEstimateTriage,

  // Attachment processing
  attachment_backfill: async () => handleAttachmentBackfill(),
  body_link_manual_followup: processBodyLinkManualFollowupJob,

  // AQData
  aqdata_sync: async () => {
    const { runAQDataSyncJob } = await import("./aqdata-jobs");
    await runAQDataSyncJob();
  },
  aqdata_detail_scrape: async (job) => {
    const { AQDATA_DETAIL_SCRAPE_PAYLOAD_SCHEMA } = await import(
      "./job-schemas"
    );
    const payload = parseJobPayload(job, AQDATA_DETAIL_SCRAPE_PAYLOAD_SCHEMA);
    const limit = payload.limit ?? AQDATA_DETAIL_SCRAPE_BATCH_SIZE;
    const { runAQDataDetailScrapeJob } = await import("./aqdata-jobs");
    await runAQDataDetailScrapeJob(limit);
  },
};

export async function processNextJob(): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return;
  }

  activeJobs += 1;
  let job: WebhookJob | null = null;
  let isLlm = false;

  try {
    job = await dequeue({
      excludeLlmTypes: activeLlmJobs >= MAX_LLM_CONCURRENT_JOBS,
    });
    if (!job) {
      return;
    }

    isLlm = LLM_JOB_TYPES.has(job.job_type);
    if (isLlm) {
      activeLlmJobs += 1;
    }

    console.log(
      `[worker] Processing job #${job.id}: ${job.job_type} (attempt ${job.attempts})${isLlm ? " [LLM]" : ""}`
    );

    const handler = JOB_HANDLERS[job.job_type];
    if (handler) {
      await handler(job);
    } else {
      throw new Error(`Unknown job type: ${job.job_type}`);
    }

    await completeJob(job.id);
    console.log(`[worker] Completed job #${job.id}: ${job.job_type}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (job) {
      console.error(
        `[worker] Job #${job.id} failed (attempt ${job.attempts}/${job.max_attempts}): ${msg}`
      );
      await failJob(job, msg.slice(0, 1000));
    } else {
      console.error(`[worker] Job processing error: ${msg}`);
    }
  } finally {
    if (isLlm) {
      activeLlmJobs -= 1;
    }
    activeJobs -= 1;
  }
}
