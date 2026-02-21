/**
 * Job dispatch — dequeue jobs and route to the appropriate handler.
 */
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Centralized job routing keeps queue behavior in one place.

import type { ContractDocExtractPayload } from "@contract/types";
import { runEstimateExtractionTriage } from "@lib/db/repositories/estimate";
import { processTriageBackfillBatch } from "@lib/triage/backfill";
import type {
  TriageBackfillOptions,
  TriageEnqueueJob,
} from "@lib/triage/types";
import { runBuildingConnectedSync } from "./buildingconnected-sync";
import {
  AQDATA_DETAIL_SCRAPE_BATCH_SIZE,
  ATTACHMENT_BACKFILL_BATCH_SIZE,
  ATTACHMENT_BACKFILL_CONCURRENCY,
  BODY_LINK_BACKFILL_ENABLED,
  BODY_LINK_BACKFILL_LIMIT,
  BODY_LINK_BACKFILL_LOOKBACK_DAYS,
  BODY_LINK_BACKFILL_MAILBOX_FILTER,
  BODY_LINK_BACKFILL_MAX_LINKS,
  BUILDINGCONNECTED_SYNC_BATCH_SIZE,
  BUILDINGCONNECTED_SYNC_ENABLED,
  CONTACT_ENRICHMENT_BATCH_SIZE,
  CONTRACT_WON_BRIDGE_ENABLED,
  ESTIMATE_TRIAGE_ENABLED,
  INTERNAL_DOMAINS,
  MAILBOX_FALLBACK_SYNC_CONCURRENCY,
  MAILBOX_FALLBACK_SYNC_ENABLED,
  MAILBOX_FALLBACK_SYNC_LOOKBACK_HOURS,
  MAILBOX_FALLBACK_SYNC_MAX_PER_MAILBOX,
  MAX_CONCURRENT_JOBS,
  MAX_LLM_CONCURRENT_JOBS,
  MONDAY_STATUS_SYNC_ENABLED,
  NOTIFICATIONS_DELIVERY_MODE,
  NOTIFICATIONS_MAILBOX,
  NOTIFICATIONS_MAX_EVENTS,
  PERMIT_SCRAPE_BATCH_SIZE,
  PERMIT_SCRAPE_ENABLED,
  PERMIT_SYNC_ENABLED,
} from "./config";
import {
  processBodyLinkManualFollowupJob,
  processContractEmailReceivedJob,
  processDustPermitIssuedEmailJob,
  processDustPermitPaymentJob,
  processEmailNotificationJob,
  processIntakeJob,
} from "./event-jobs";
import {
  completeJob,
  dequeue,
  enqueueIfNotPending,
  failJob,
  parseJobPayload,
} from "./queue";
import {
  processDownloadFilesJob,
  processSyncFullJob,
  processSyncItemJob,
} from "./sync-jobs";
import type { WebhookJob } from "./types";

const LLM_JOB_TYPES = new Set([
  "contact_enrichment",
  "email_triage_batch",
  "contract_doc_extract",
  "estimate_triage",
]);

let activeJobs = 0;
let activeLlmJobs = 0;

const enqueueTriageActionJob: TriageEnqueueJob = async (jobType, payload) => {
  await enqueueIfNotPending(jobType, payload);
};

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

async function handleContactEnrichment(job: WebhookJob): Promise<void> {
  const { CONTACT_ENRICHMENT_PAYLOAD_SCHEMA } = await import(
    "@enrichment/types"
  );
  const payload = parseJobPayload(job, CONTACT_ENRICHMENT_PAYLOAD_SCHEMA);
  const { enrichContacts } = await import("@lib/linking/link-contacts");
  const result = await enrichContacts(payload.batchSize);
  if (result.enriched > 0 || result.errors > 0) {
    console.log(
      `[worker] Contact enrichment: ${result.enriched} enriched, ${result.errors} errors`
    );
  }
}

async function handleEmailTriageBatch(job: WebhookJob): Promise<void> {
  const { EMAIL_TRIAGE_BATCH_PAYLOAD_SCHEMA } = await import(
    "@lib/triage/types"
  );
  const payload = parseJobPayload(job, EMAIL_TRIAGE_BATCH_PAYLOAD_SCHEMA);
  const result = await processTriageBackfillBatch({
    ...(payload as TriageBackfillOptions),
    internalDomains: INTERNAL_DOMAINS,
    enqueueJob: enqueueTriageActionJob,
  });
  if (result.fetched > 0) {
    console.log(
      `[worker] Email triage batch: ${result.processed} ok, ${result.errors} errors, ${result.elapsedMs}ms`
    );
  }
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

async function handleMailboxFallbackSync(job: WebhookJob): Promise<void> {
  if (!MAILBOX_FALLBACK_SYNC_ENABLED) {
    return;
  }

  const { MAILBOX_FALLBACK_SYNC_PAYLOAD_SCHEMA } = await import(
    "./job-schemas"
  );
  const payload = parseJobPayload(job, MAILBOX_FALLBACK_SYNC_PAYLOAD_SCHEMA);
  if (payload.enabled === false) {
    return;
  }

  const { syncAllMailboxes } = await import("@email/sync/mailboxes-sync");
  const lookbackHours =
    payload.lookbackHours ?? MAILBOX_FALLBACK_SYNC_LOOKBACK_HOURS;
  const concurrency = payload.concurrency ?? MAILBOX_FALLBACK_SYNC_CONCURRENCY;
  const maxPerMailbox =
    payload.maxPerMailbox ?? MAILBOX_FALLBACK_SYNC_MAX_PER_MAILBOX;
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const results = await syncAllMailboxes({
    since,
    concurrency,
    maxPerMailbox,
    fetchBodies: payload.fetchBodies ?? true,
    fetchAttachments: payload.fetchAttachments ?? true,
    incremental: true,
  });

  const failures = results.filter((r) => Boolean(r.error));
  const stored = results.reduce((sum, result) => sum + result.emailsStored, 0);
  const attachments = results.reduce(
    (sum, result) => sum + result.attachmentsStored,
    0
  );

  if (stored > 0 || attachments > 0 || failures.length > 0) {
    console.log(
      `[worker] Mailbox fallback sync: ${stored} emails, ${attachments} attachments, ${failures.length}/${results.length} mailbox failures`
    );
  }

  if (failures.length === results.length && results.length > 0) {
    throw new Error("Mailbox fallback sync failed for all mailboxes");
  }
}

async function handleBodyLinkBackfill(job: WebhookJob): Promise<void> {
  if (!BODY_LINK_BACKFILL_ENABLED) {
    return;
  }

  const { BODY_LINK_BACKFILL_PAYLOAD_SCHEMA } = await import("./job-schemas");
  const payload = parseJobPayload(job, BODY_LINK_BACKFILL_PAYLOAD_SCHEMA);
  if (payload.enabled === false) {
    return;
  }

  const { runBodyLinkBackfill } = await import(
    "@email/sync/body-link-backfill-job"
  );

  const lookbackDays = payload.lookbackDays ?? BODY_LINK_BACKFILL_LOOKBACK_DAYS;
  const limit = payload.limit ?? BODY_LINK_BACKFILL_LIMIT;
  const maxLinks = payload.maxLinks ?? BODY_LINK_BACKFILL_MAX_LINKS;
  const mailbox = payload.mailbox ?? BODY_LINK_BACKFILL_MAILBOX_FILTER;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  await runBodyLinkBackfill({
    limit,
    mailbox,
    maxLinks: maxLinks > 0 ? maxLinks : undefined,
    since,
  });
}

async function handleFolderWatcherPoll(): Promise<void> {
  const { pollFolderWatcher } = await import("@lib/graph/folder-watcher/poll");
  await pollFolderWatcher();
}

async function handleEstimateLinkerMaintenance(): Promise<void> {
  const { runEstimateLinkerMaintenance } = await import(
    "@lib/linking/maintenance"
  );
  const stats = await runEstimateLinkerMaintenance();
  if (
    stats.conversationLinksInserted > 0 ||
    stats.directProjectsStamped > 0 ||
    stats.projectIdsBackfilled > 0
  ) {
    console.log(
      `[worker] Estimate linker maintenance: conv=${stats.conversationLinksInserted}, direct-stamp=${stats.directProjectsStamped}, backfill=${stats.projectIdsBackfilled}`
    );
  }
}

async function handleLinkEstimate(job: WebhookJob): Promise<void> {
  const { LINK_ESTIMATE_PAYLOAD_SCHEMA } = await import("@lib/linking/types");
  const payload = parseJobPayload(job, LINK_ESTIMATE_PAYLOAD_SCHEMA);
  const { linkEmail } = await import("@lib/linking/link-email");

  const result = await linkEmail(payload.emailId);
  if (result.projectLinked || result.estimateLinked) {
    console.log(
      `[worker] Linked email ${payload.emailId}: project=${result.projectLinked}, estimate=${result.estimateLinked} (signals: ${result.signals.join(", ")})`
    );
  }
}

async function handleSyncBcFile(job: WebhookJob): Promise<void> {
  const { SYNC_BC_FILE_PAYLOAD_SCHEMA } = await import(
    "@email/sync/bc-sync/types"
  );
  const payload = parseJobPayload(job, SYNC_BC_FILE_PAYLOAD_SCHEMA);
  const { processBcFilesForEmail } = await import(
    "@email/sync/bc-sync/processing"
  );

  const result = await processBcFilesForEmail(payload.emailId);
  if (result.processed > 0 || result.failed > 0) {
    console.log(
      `[worker] BC file sync for email ${payload.emailId}: ${result.succeeded} ok, ${result.failed} failed, ${result.skipped} skipped`
    );
  }
}

async function handleSwpppMasterSync(): Promise<void> {
  const { syncAll } = await import("@sharepoint/swppp-sync/sync");
  const summary = await syncAll();
  console.log(
    `[worker] SWPPP master sync: ${summary.totalRows} rows, ${summary.totalLinked} linked, ${summary.totalUnlinked} unlinked (${summary.duration}ms)`
  );
}

async function handleAttachmentBackfill(): Promise<void> {
  const bcSync = await runBuildingConnectedSync({
    batchSize: BUILDINGCONNECTED_SYNC_BATCH_SIZE,
    enabled: BUILDINGCONNECTED_SYNC_ENABLED,
  });

  if (bcSync.outcome === "error") {
    console.error(
      `[worker] BuildingConnected sync failed: ${bcSync.error ?? "unknown error"}`
    );
  } else if (
    bcSync.syncResult &&
    (bcSync.syncResult.processed > 0 ||
      bcSync.syncResult.skipped > 0 ||
      bcSync.syncResult.failed > 0)
  ) {
    console.log(
      `[worker] BuildingConnected sync: ${bcSync.syncResult.succeeded} ok, ${bcSync.syncResult.failed} failed, ${bcSync.syncResult.skipped} skipped, ${bcSync.syncResult.elapsedMs}ms, ${bcSync.syncResult.attachmentsPerMinute.toFixed(1)} items/min`
    );
  }

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

async function handleAccountLinking(): Promise<void> {
  const { enrichEmailDomains } = await import("@lib/linking/enrichment");
  const { processPlatformEmails } = await import(
    "@email/sync/platform-extraction"
  );
  const { linkEmailsToAccounts } = await import("@lib/linking/link-accounts");

  await enrichEmailDomains();
  await processPlatformEmails();
  const stats = await linkEmailsToAccounts();

  const totalLinked =
    stats.linkedByProject +
    stats.linkedByEstimate +
    stats.linkedByContact +
    stats.linkedByPlatformDomain +
    stats.linkedByForwardDomain +
    stats.linkedByDirectDomain +
    stats.linkedByNameLookup +
    stats.linkedByAlias +
    stats.linkedByConversation;

  if (
    totalLinked > 0 ||
    stats.accountsCreated > 0 ||
    stats.skippedAmbiguous > 0
  ) {
    console.log(
      `[worker] Account linking: ${totalLinked} linked (project=${stats.linkedByProject}, estimate=${stats.linkedByEstimate}, contact=${stats.linkedByContact}, platform=${stats.linkedByPlatformDomain}, forward=${stats.linkedByForwardDomain}, direct=${stats.linkedByDirectDomain}, name=${stats.linkedByNameLookup}, alias=${stats.linkedByAlias}, conversation=${stats.linkedByConversation}), ${stats.accountsCreated} accounts created, ${stats.skippedAmbiguous} ambiguous skipped`
    );
  }
}

async function handleContactLinking(): Promise<void> {
  const { linkEmailsToContacts } = await import("@lib/linking/link-contacts");
  const stats = await linkEmailsToContacts({ skipEnrichment: true });
  const totalLinked = stats.linkedFrom + stats.linkedTo + stats.linkedCc;
  if (totalLinked > 0 || stats.contactsCreated > 0) {
    console.log(
      `[worker] Contact linking: ${totalLinked} linked (from=${stats.linkedFrom}, to=${stats.linkedTo}, cc=${stats.linkedCc}), ${stats.contactsCreated} contacts created`
    );
  }
  await enqueueIfNotPending("contact_enrichment", {
    batchSize: CONTACT_ENRICHMENT_BATCH_SIZE,
  });
}

async function handleSubscriptionRenewal(): Promise<void> {
  const { renewExpiring } = await import("@email/subscriptions");
  const result = await renewExpiring(24);
  if (result.renewed > 0 || result.failed > 0) {
    console.log(
      `[worker] Subscription renewal: ${result.renewed} renewed, ${result.failed} failed`
    );
  }
}

async function handleGroupSync(): Promise<void> {
  const { syncAllGroups } = await import("@email/sync/groups-core/sync-group");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const results = await syncAllGroups({ since });
  for (const r of results) {
    if (r.postsStored > 0) {
      console.log(`[worker] Group sync ${r.group}: ${r.postsStored} new posts`);
    }
  }
}

async function handleMondayStatusSync(): Promise<void> {
  if (!MONDAY_STATUS_SYNC_ENABLED) {
    return;
  }
  const { pollMondayStatusSync } = await import(
    "@monday/sync/status-sync/poll"
  );
  const result = await pollMondayStatusSync();
  if (result.skipped) {
    console.warn(
      `[worker] Monday status sync skipped: ${result.reason ?? "unknown"}`
    );
    return;
  }

  const gcUpdated = result.gc?.updatedCount ?? 0;
  const gcErrors = result.gc?.errors.length ?? 0;
  const leadsUpdated = result.leads?.updatedCount ?? 0;
  const leadsErrors = result.leads?.errors.length ?? 0;
  const projectLinksEnabled = result.projectLinks?.enabled ?? false;
  const projectLinkUpdates = result.projectLinks
    ? result.projectLinks.linkedLeads +
      result.projectLinks.linkedEstimates +
      result.projectLinks.linkedProjects
    : 0;
  const projectNumberUpdates = result.projectLinks?.projectNumbersUpdated ?? 0;
  const projectLinkErrors = result.projectLinks?.errors.length ?? 0;

  console.log(
    `[worker] Monday status sync: gc=${gcUpdated} updated (${gcErrors} errors), leads=${leadsUpdated} updated (${leadsErrors} errors), project_links=${projectLinksEnabled ? `${projectLinkUpdates} links + ${projectNumberUpdates} numbers` : "disabled"} (${projectLinkErrors} errors)`
  );
}

async function handlePermitSync(): Promise<void> {
  if (!PERMIT_SYNC_ENABLED) {
    return;
  }
  const { runScheduledPermitSync } = await import("./permit-sync");
  const result = await runScheduledPermitSync();
  if (result) {
    console.log(
      `[worker] Permit sync: company=${result.companyPermits?.newRecords ?? 0} new (${result.companyPermits?.totalInDb ?? 0} total), marketing=${result.marketingPermits?.newRecords ?? 0} new (${result.marketingPermits?.totalInDb ?? 0} total)`
    );
  }
}

async function handlePermitDetailScrape(): Promise<void> {
  if (!PERMIT_SCRAPE_ENABLED) {
    return;
  }
  const { runPermitDetailScrape } = await import("./permit-sync");
  const result = await runPermitDetailScrape(PERMIT_SCRAPE_BATCH_SIZE);
  if (result.scraped > 0 || result.failed > 0) {
    console.log(
      `[worker] Permit detail scrape: ${result.scraped} scraped, ${result.skipped} skipped, ${result.failed} failed`
    );
  }
}

async function handleNotificationsTick(): Promise<void> {
  const { createDraftClientFromEnv } = await import(
    "@lib/notifications/delivery"
  );
  const { detectAllEvents } = await import("@lib/notifications/events");
  const { deliverNewEvents, processQueuedNotifications } = await import(
    "@lib/notifications/notification-timer"
  );

  let deliveryMode = NOTIFICATIONS_DELIVERY_MODE;
  let draftClient: ReturnType<typeof createDraftClientFromEnv> | null = null;
  if (deliveryMode === "draft") {
    try {
      draftClient = createDraftClientFromEnv();
    } catch (err) {
      console.warn(
        `[worker] Notifications draft mode disabled: ${(err as Error).message}. Falling back to log mode.`
      );
      deliveryMode = "log";
    }
  }

  const cappedMax = Math.max(0, NOTIFICATIONS_MAX_EVENTS);
  let processedCount = 0;
  if (deliveryMode === "draft" && draftClient) {
    processedCount = await processQueuedNotifications(
      draftClient,
      cappedMax,
      NOTIFICATIONS_MAILBOX
    );
  }

  const remainingBudget = Math.max(0, cappedMax - processedCount);
  const events = remainingBudget > 0 ? await detectAllEvents() : [];
  const pendingEvents = events.slice(0, remainingBudget);

  if (pendingEvents.length === 0 && processedCount === 0) {
    return;
  }

  if (pendingEvents.length > 0) {
    console.log(
      `[worker] Notifications(${NOTIFICATIONS_MAILBOX}): ${pendingEvents.length} new event(s)${events.length > pendingEvents.length ? ` (${events.length} total, capped)` : ""}`
    );
  }

  await deliverNewEvents(
    pendingEvents,
    deliveryMode,
    draftClient,
    NOTIFICATIONS_MAILBOX
  );
}

const JOB_HANDLERS: Record<string, (job: WebhookJob) => Promise<void>> = {
  sync_item: processSyncItemJob,
  download_files: processDownloadFilesJob,
  sync_full: async () => processSyncFullJob(),
  email_notification: processEmailNotificationJob,
  body_link_manual_followup: processBodyLinkManualFollowupJob,
  intake: processIntakeJob,
  dust_permit_payment: processDustPermitPaymentJob,
  dust_permit_issued_email: processDustPermitIssuedEmailJob,
  contract_email_received: processContractEmailReceivedJob,
  contract_doc_extract: handleContractDocExtract,
  contact_enrichment: handleContactEnrichment,
  email_triage_batch: handleEmailTriageBatch,
  estimate_triage: handleEstimateTriage,
  mailbox_fallback_sync: handleMailboxFallbackSync,
  body_link_backfill: handleBodyLinkBackfill,
  folder_watcher_poll: async () => handleFolderWatcherPoll(),
  estimate_linker_maintenance: async () => handleEstimateLinkerMaintenance(),
  link_estimate: handleLinkEstimate,
  sync_bc_file: handleSyncBcFile,
  swppp_master_sync: async () => handleSwpppMasterSync(),
  attachment_backfill: async () => handleAttachmentBackfill(),
  contract_won_bridge: async () => handleContractWonBridge(),
  account_linking: async () => handleAccountLinking(),
  contact_linking: async () => handleContactLinking(),
  subscription_renewal: async () => handleSubscriptionRenewal(),
  group_sync: async () => handleGroupSync(),
  monday_status_sync: async () => handleMondayStatusSync(),
  permit_sync: async () => handlePermitSync(),
  permit_detail_scrape: async () => handlePermitDetailScrape(),
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
  notifications_tick: async () => handleNotificationsTick(),
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
