/**
 * Background Job Worker -- Scheduler
 *
 * Thin orchestrator that registers timers and polls the job queue.
 * All logic lives in apps/background-jobs/jobs/ modules:
 *   - config.ts       -- env parsing, constants
 *   - queue.ts        -- dequeue, claim, complete, fail, enqueue
 *   - dispatch.ts     -- job type routing (processNextJob)
 *   - handlers.ts     -- job handler implementations
 *   - email-processing.ts -- Outlook webhook email handling
 *   - permit-sync.ts  -- permit-worker coordination for payment flows
 */

import { pollEstimateEmailLinker } from "@background-jobs/workers/estimate-email-linker/lib/poll";
import { pollMondayStatusSync } from "@background-jobs/workers/monday-status-sync/lib/poll";
import { pollFolderWatcher } from "@background-jobs/workers/outlook-folder-watcher/lib/poll";
import { syncAll as syncSwpppMaster } from "../../packages/sharepoint/workers/swppp-master-poller/lib/sync";
import {
  ACCOUNT_LINKING_INTERVAL_MS,
  ATTACHMENT_BACKFILL_BATCH_SIZE,
  ATTACHMENT_BACKFILL_CONCURRENCY,
  ATTACHMENT_BACKFILL_INTERVAL_MS,
  CONTACT_ENRICHMENT_BATCH_SIZE,
  CONTACT_LINKING_INTERVAL_MS,
  CONTRACT_WON_BRIDGE_ENABLED,
  CONTRACT_WON_BRIDGE_INTERVAL_MS,
  EMAIL_TRIAGE_BACKFILL_BATCH_SIZE,
  EMAIL_TRIAGE_BACKFILL_CONCURRENCY,
  EMAIL_TRIAGE_BACKFILL_ENABLED,
  EMAIL_TRIAGE_BACKFILL_INTERVAL_MS,
  ESTIMATE_LINKER_INTERVAL_MS,
  ESTIMATE_TRIAGE_ENABLED,
  ESTIMATE_TRIAGE_INTERVAL_MS,
  ESTIMATE_TRIAGE_MAX_ROWS,
  ESTIMATE_TRIAGE_PROVIDER,
  FOLDER_WATCHER_INTERVAL_MS,
  FULL_SYNC_INTERVAL_MS,
  GROUP_SYNC_INTERVAL_MS,
  MAX_CONCURRENT_JOBS,
  MONDAY_STATUS_SYNC_ENABLED,
  MONDAY_STATUS_SYNC_INTERVAL_MS,
  NOTIFICATIONS_DELIVERY_MODE,
  NOTIFICATIONS_INTERVAL_MS,
  NOTIFICATIONS_MAILBOX,
  NOTIFICATIONS_MAX_EVENTS,
  POLL_INTERVAL_MS,
  RENEWAL_INTERVAL_MS,
  SWPPP_MASTER_SYNC_INTERVAL_MS,
} from "./jobs/config";
import { getActiveJobCount, processNextJob } from "./jobs/dispatch";
import {
  enqueueFullSyncIfMissing,
  enqueueIfNotPending,
  requeueStale,
} from "./jobs/queue";
import { runContractWonBridge } from "./lib/contracts/contract-won-bridge";
import { processIntakeAttachmentRows } from "./lib/intake/intake-attachments-runner";
import { createDraftClientFromEnv } from "./lib/notifications/delivery";
import { detectAllEvents } from "./lib/notifications/events";
import {
  deliverNewEvents,
  processQueuedNotifications,
} from "./lib/notifications/notification-timer";
import type { NotificationDeliveryMode } from "./lib/notifications/types";

// ============================================================================
// Timer Registry
// ============================================================================

type TimerHandle = ReturnType<typeof setInterval>;

const timers: TimerHandle[] = [];

/**
 * Register a periodic timer with overlap protection.
 * The callback will not be invoked again if the previous invocation is still running.
 * Optionally runs the callback immediately on registration.
 */
function registerTimer(
  label: string,
  intervalMs: number,
  callback: () => Promise<void>,
  options?: { runImmediately?: boolean }
): void {
  let running = false;
  const guarded = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await callback();
    } catch (err) {
      console.error(`[worker] ${label} error:`, err);
    } finally {
      running = false;
    }
  };

  timers.push(setInterval(guarded, intervalMs));

  if (options?.runImmediately) {
    guarded().catch((err) =>
      console.error(`[worker] ${label} initial run error:`, err)
    );
  }
}

function clearAllTimers(): void {
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting background job processor");
  console.log(
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}, Full sync: ${FULL_SYNC_INTERVAL_MS / 60_000}min, Folder watcher: ${FOLDER_WATCHER_INTERVAL_MS / 1000}s, Estimate linker backfill: ${ESTIMATE_LINKER_INTERVAL_MS / 1000}s, SWPPP master sync: ${SWPPP_MASTER_SYNC_INTERVAL_MS / 1000}s, Monday status sync: ${MONDAY_STATUS_SYNC_ENABLED ? `${MONDAY_STATUS_SYNC_INTERVAL_MS / 60_000}min` : "disabled"}, Estimate triage: ${ESTIMATE_TRIAGE_ENABLED ? `${ESTIMATE_TRIAGE_INTERVAL_MS / 1000}s (${ESTIMATE_TRIAGE_MAX_ROWS}/run via ${ESTIMATE_TRIAGE_PROVIDER || "mistral"})` : "disabled"}, Attachment backfill: ${ATTACHMENT_BACKFILL_INTERVAL_MS / 60_000}min (batch=${ATTACHMENT_BACKFILL_BATCH_SIZE}, concurrency=${ATTACHMENT_BACKFILL_CONCURRENCY}, scope=all), Email triage backfill: ${EMAIL_TRIAGE_BACKFILL_ENABLED ? `${EMAIL_TRIAGE_BACKFILL_INTERVAL_MS / 1000}s (batch=${EMAIL_TRIAGE_BACKFILL_BATCH_SIZE}, concurrency=${EMAIL_TRIAGE_BACKFILL_CONCURRENCY})` : "disabled"}, Contract won bridge: ${CONTRACT_WON_BRIDGE_ENABLED ? `${CONTRACT_WON_BRIDGE_INTERVAL_MS / 1000}s` : "disabled"}`
  );

  // Recover stale jobs from previous crashes
  try {
    const requeued = await requeueStale.run();
    if (requeued.count > 0) {
      console.log(`[worker] Requeued ${requeued.count} stale job(s)`);
    }
  } catch (err) {
    console.error("[worker] requeueStale failed:", err);
  }

  // Queue initial full sync if none pending
  try {
    await enqueueFullSyncIfMissing("startup");
  } catch (err) {
    console.error("[worker] enqueueFullSync failed:", err);
  }

  // Poll for jobs
  timers.push(
    setInterval(() => {
      const availableSlots = Math.max(
        0,
        MAX_CONCURRENT_JOBS - getActiveJobCount()
      );
      for (let i = 0; i < availableSlots; i++) {
        processNextJob().catch((err) =>
          console.error("[worker] Poll error:", err)
        );
      }
    }, POLL_INTERVAL_MS)
  );

  // Kick off initial workers immediately so we don't wait for first timer tick.
  for (let i = 0; i < MAX_CONCURRENT_JOBS; i++) {
    processNextJob().catch((err) => console.error("[worker] Poll error:", err));
  }

  // Periodic full sync
  timers.push(
    setInterval(async () => {
      await enqueueFullSyncIfMissing("periodic");
    }, FULL_SYNC_INTERVAL_MS)
  );

  // Outlook folder watcher -- polls Graph deltas for folder/message changes
  registerTimer(
    "Folder watcher",
    FOLDER_WATCHER_INTERVAL_MS,
    async () => {
      await pollFolderWatcher();
    },
    { runImmediately: true }
  );

  // Estimate linker backfill -- continuously populate estimate_emails for unlinked emails
  registerTimer(
    "Estimate linker",
    ESTIMATE_LINKER_INTERVAL_MS,
    async () => {
      const stats = await pollEstimateEmailLinker();
      if (
        stats.processedEmails > 0 ||
        stats.linksInserted > 0 ||
        stats.conversationLinksInserted > 0 ||
        stats.directProjectsStamped > 0 ||
        stats.projectIdsBackfilled > 0
      ) {
        console.log(
          `[worker] Estimate linker: ${stats.linksInserted} linked, ${stats.projectsLinked} projects, ${stats.processedEmails} processed, ${stats.skippedNoSignal} no-signal, conv=${stats.conversationLinksInserted}, direct-stamp=${stats.directProjectsStamped}, backfill=${stats.projectIdsBackfilled}`
        );
      }
    },
    { runImmediately: true }
  );

  // SWPPP master sync -- pull worksheet rows from SharePoint and upsert swppp_work_orders.
  registerTimer(
    "SWPPP master sync",
    SWPPP_MASTER_SYNC_INTERVAL_MS,
    async () => {
      const summary = await syncSwpppMaster();
      console.log(
        `[worker] SWPPP master sync: ${summary.totalRows} rows, ${summary.totalLinked} linked, ${summary.totalUnlinked} unlinked (${summary.duration}ms)`
      );
    },
    { runImmediately: true }
  );

  // Estimate extraction triage -- enqueue LLM triage jobs into the queue
  if (ESTIMATE_TRIAGE_ENABLED) {
    registerTimer(
      "Estimate extraction triage",
      ESTIMATE_TRIAGE_INTERVAL_MS,
      async () => {
        await enqueueIfNotPending(
          "estimate_triage",
          JSON.stringify({
            maxRows: ESTIMATE_TRIAGE_MAX_ROWS,
            provider: ESTIMATE_TRIAGE_PROVIDER || "glm-ocr",
          })
        );
      },
      { runImmediately: true }
    );
  }

  // Attachment backfill -- process unprocessed email attachments
  registerTimer(
    "Attachment backfill",
    ATTACHMENT_BACKFILL_INTERVAL_MS,
    async () => {
      const result = await processIntakeAttachmentRows({
        batchSize: ATTACHMENT_BACKFILL_BATCH_SIZE,
        concurrency: ATTACHMENT_BACKFILL_CONCURRENCY,
      });
      if (result.processed > 0 || result.skipped > 0 || result.deduped > 0) {
        console.log(
          `[worker] Attachment backfill: ${result.succeeded} ok, ${result.failed} failed, ${result.deduped} deduped, ${result.skipped} skipped, ${result.elapsedMs}ms, ${result.attachmentsPerMinute.toFixed(1)} items/min`
        );
      }
    }
  );

  // Email triage backfill -- enqueue LLM triage batch jobs into the queue
  if (EMAIL_TRIAGE_BACKFILL_ENABLED) {
    registerTimer(
      "Email triage backfill",
      EMAIL_TRIAGE_BACKFILL_INTERVAL_MS,
      async () => {
        await enqueueIfNotPending(
          "email_triage_batch",
          JSON.stringify({
            batchSize: EMAIL_TRIAGE_BACKFILL_BATCH_SIZE,
            concurrency: EMAIL_TRIAGE_BACKFILL_CONCURRENCY,
            provider: "local",
          })
        );
      }
    );
  }

  // Contract won bridge -- classify contracts@ emails, link to projects,
  // mark estimates as Won in Postgres + Monday when real contracts arrive.
  if (CONTRACT_WON_BRIDGE_ENABLED) {
    registerTimer(
      "Contract won bridge",
      CONTRACT_WON_BRIDGE_INTERVAL_MS,
      async () => {
        const stats = await runContractWonBridge();
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
    );
  }

  // Account linking -- domain enrichment + platform extraction + 6-signal account linker
  registerTimer("Account linking", ACCOUNT_LINKING_INTERVAL_MS, async () => {
    const { enrichEmailDomains } = await import("@email/sync/enrichment");
    const { processPlatformEmails } = await import(
      "@email/sync/platform-extraction"
    );
    const { linkEmailsToAccounts } = await import("@email/sync/link-accounts");

    await enrichEmailDomains();
    await processPlatformEmails();
    const stats = await linkEmailsToAccounts();

    const totalLinked =
      stats.linkedByPlatformDomain +
      stats.linkedByForwardDomain +
      stats.linkedByDirectDomain +
      stats.linkedByNameLookup +
      stats.linkedByAlias +
      stats.linkedByConversation;

    if (totalLinked > 0 || stats.accountsCreated > 0) {
      console.log(
        `[worker] Account linking: ${totalLinked} linked (platform=${stats.linkedByPlatformDomain}, forward=${stats.linkedByForwardDomain}, direct=${stats.linkedByDirectDomain}, name=${stats.linkedByNameLookup}, alias=${stats.linkedByAlias}, conversation=${stats.linkedByConversation}), ${stats.accountsCreated} accounts created`
      );
    }
  });

  // Contact linking -- SQL layers run inline, LLM enrichment enqueued
  registerTimer("Contact linking", CONTACT_LINKING_INTERVAL_MS, async () => {
    const { linkEmailsToContacts } = await import("@email/sync/link-contacts");
    // Layers 1+2 (deterministic SQL linking + contact creation) — fast, no LLM
    const stats = await linkEmailsToContacts({ skipEnrichment: true });
    const totalLinked = stats.linkedFrom + stats.linkedTo + stats.linkedCc;
    if (totalLinked > 0 || stats.contactsCreated > 0) {
      console.log(
        `[worker] Contact linking: ${totalLinked} linked (from=${stats.linkedFrom}, to=${stats.linkedTo}, cc=${stats.linkedCc}), ${stats.contactsCreated} contacts created`
      );
    }
    // Layer 3 (LLM enrichment via granite4) — queued for dispatch
    await enqueueIfNotPending(
      "contact_enrichment",
      JSON.stringify({ batchSize: CONTACT_ENRICHMENT_BATCH_SIZE })
    );
  });

  // Renew expiring Outlook subscriptions (every hour)
  registerTimer("Subscription renewal", RENEWAL_INTERVAL_MS, async () => {
    const { renewExpiring } = await import("@email/subscriptions");
    const result = await renewExpiring(24);
    if (result.renewed > 0 || result.failed > 0) {
      console.log(
        `[worker] Subscription renewal: ${result.renewed} renewed, ${result.failed} failed`
      );
    }
  });

  // Periodic M365 group sync (internalcontracts@ etc)
  // Graph doesn't support app-only webhooks for group conversations, so we poll.
  registerTimer("Group sync", GROUP_SYNC_INTERVAL_MS, async () => {
    const { syncAllGroups } = await import(
      "@email/sync/groups-core/sync-group"
    );
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const results = await syncAllGroups({ since });
    for (const r of results) {
      if (r.postsStored > 0) {
        console.log(
          `[worker] Group sync ${r.group}: ${r.postsStored} new posts`
        );
      }
    }
  });

  // Monday status sync -- migrated from CF Worker cron.
  if (MONDAY_STATUS_SYNC_ENABLED) {
    registerTimer(
      "Monday status sync",
      MONDAY_STATUS_SYNC_INTERVAL_MS,
      async () => {
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
        const projectNumberUpdates =
          result.projectLinks?.projectNumbersUpdated ?? 0;
        const projectLinkErrors = result.projectLinks?.errors.length ?? 0;

        console.log(
          `[worker] Monday status sync: gc=${gcUpdated} updated (${gcErrors} errors), leads=${leadsUpdated} updated (${leadsErrors} errors), project_links=${projectLinksEnabled ? `${projectLinkUpdates} links + ${projectNumberUpdates} numbers` : "disabled"} (${projectLinkErrors} errors)`
        );
      }
    );
  }

  // Notification event detection — polls Postgres for permit expirations,
  // estimate wins, contracts received, etc. Creates notification records
  // and optionally Outlook drafts via Graph API.
  initNotificationTimer();
}

// ============================================================================
// Notification Poll Timer
// ============================================================================

function initNotificationTimer(): void {
  let deliveryMode: NotificationDeliveryMode = NOTIFICATIONS_DELIVERY_MODE;
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

  console.log(
    `[worker] Notifications: ${NOTIFICATIONS_INTERVAL_MS / 1000}s interval, mode=${deliveryMode}, mailbox=${NOTIFICATIONS_MAILBOX}, max=${NOTIFICATIONS_MAX_EVENTS}`
  );

  registerTimer("Notifications", NOTIFICATIONS_INTERVAL_MS, async () => {
    const cappedMax = Math.max(0, NOTIFICATIONS_MAX_EVENTS);
    let processedCount = 0;

    // Process queued pending notifications first (draft mode only)
    if (deliveryMode === "draft" && draftClient) {
      processedCount = await processQueuedNotifications(draftClient, cappedMax);
    }

    // Detect new events
    const remainingBudget = Math.max(0, cappedMax - processedCount);
    const events = remainingBudget > 0 ? await detectAllEvents() : [];
    const pendingEvents = events.slice(0, remainingBudget);

    if (pendingEvents.length === 0 && processedCount === 0) {
      return;
    }

    if (pendingEvents.length > 0) {
      console.log(
        `[worker] Notifications: ${pendingEvents.length} new event(s)${events.length > pendingEvents.length ? ` (${events.length} total, capped)` : ""}`
      );
    }

    await deliverNewEvents(pendingEvents, deliveryMode, draftClient);
  });
}

export function stopWorker(): void {
  clearAllTimers();
  console.log("[worker] Stopped");
}
