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
 *   - intake-processing.ts -- document linking, contract packets, SharePoint
 *   - permit-sync.ts  -- permit-worker coordination for payment flows
 */

import { pollEstimateEmailLinker } from "@background-jobs/workers/estimate-email-linker/lib/poll";
import { pollFolderWatcher } from "@background-jobs/workers/outlook-folder-watcher/lib/poll";
import { syncAll as syncSwpppMaster } from "../../packages/sharepoint/workers/swppp-master-poller/lib/sync";
import {
  ATTACHMENT_BACKFILL_BATCH_SIZE,
  ATTACHMENT_BACKFILL_CONCURRENCY,
  ATTACHMENT_BACKFILL_INTERVAL_MS,
  CONTRACT_PACKET_AUTOLINK_INTERVAL_MS,
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
  NOTIFICATIONS_DELIVERY_MODE,
  NOTIFICATIONS_INTERVAL_MS,
  NOTIFICATIONS_MAILBOX,
  NOTIFICATIONS_MAX_EVENTS,
  POLL_INTERVAL_MS,
  RENEWAL_INTERVAL_MS,
  SWPPP_MASTER_SYNC_INTERVAL_MS,
} from "./jobs/config";
import { getActiveJobCount, processNextJob } from "./jobs/dispatch";
import { backfillContractPacketDocuments } from "./jobs/intake-processing";
import { enqueueFullSyncIfMissing, requeueStale } from "./jobs/queue";
import { processUnprocessedAttachments } from "./lib/attachment-backfill";
import { processTriageBackfillBatch } from "./lib/email-triage/triage-backfill";
import { runEstimateExtractionTriage } from "./lib/estimate-extraction-triage";
import {
  createDraftClientFromEnv,
  createNotificationDraft,
  type NotificationDeliveryMode,
} from "./lib/notifications/delivery";
import {
  detectAllEvents,
  loadQueuedNotifications,
  recordNotification,
  updateNotificationStatus,
} from "./lib/notifications/events";
import { getStakeholders } from "./lib/notifications/stakeholders";

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
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}, Full sync: ${FULL_SYNC_INTERVAL_MS / 60_000}min, Folder watcher: ${FOLDER_WATCHER_INTERVAL_MS / 1000}s, Estimate linker backfill: ${ESTIMATE_LINKER_INTERVAL_MS / 1000}s, SWPPP master sync: ${SWPPP_MASTER_SYNC_INTERVAL_MS / 1000}s, Estimate triage: ${ESTIMATE_TRIAGE_ENABLED ? `${ESTIMATE_TRIAGE_INTERVAL_MS / 1000}s (${ESTIMATE_TRIAGE_MAX_ROWS}/run via ${ESTIMATE_TRIAGE_PROVIDER || "mistral"})` : "disabled"}, Attachment backfill: ${ATTACHMENT_BACKFILL_INTERVAL_MS / 60_000}min (batch=${ATTACHMENT_BACKFILL_BATCH_SIZE}, concurrency=${ATTACHMENT_BACKFILL_CONCURRENCY}, scope=all), Contract packet autolink: ${CONTRACT_PACKET_AUTOLINK_INTERVAL_MS / 1000}s, Email triage backfill: ${EMAIL_TRIAGE_BACKFILL_ENABLED ? `${EMAIL_TRIAGE_BACKFILL_INTERVAL_MS / 1000}s (batch=${EMAIL_TRIAGE_BACKFILL_BATCH_SIZE}, concurrency=${EMAIL_TRIAGE_BACKFILL_CONCURRENCY})` : "disabled"}`
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
      const stats = await pollEstimateEmailLinker({
        enableProjectSingle: false,
      });
      if (
        stats.processedEmails > 0 ||
        stats.linksInserted > 0 ||
        stats.skippedAmbiguous > 0
      ) {
        console.log(
          `[worker] Estimate linker: ${stats.linksInserted} linked, ${stats.processedEmails} processed, ${stats.skippedAmbiguous} ambiguous, ${stats.skippedNoSignal} no-signal`
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

  // Estimate extraction triage -- classify failed rows and retry estimate-like docs.
  if (ESTIMATE_TRIAGE_ENABLED) {
    registerTimer(
      "Estimate extraction triage",
      ESTIMATE_TRIAGE_INTERVAL_MS,
      async () => {
        const result = await runEstimateExtractionTriage({
          provider: ESTIMATE_TRIAGE_PROVIDER || "mistral",
          maxRows: ESTIMATE_TRIAGE_MAX_ROWS,
          includeNullNonPdf: true,
          onlyUntaggedFailed: true,
          log: (line) => console.log(`[worker] ${line}`),
        });

        if (result.candidateRows > 0) {
          console.log(
            `[worker] Estimate extraction triage summary: candidates=${result.candidateRows}, fixed=${result.fixedByRetry}, non_estimate=${result.markedNonEstimate}, non_pdf=${result.markedNonPdf}, unknown=${result.markedUnknown}, retry_failed=${result.retryStillFailed}, no_asset=${result.skippedNoAsset}`
          );
        }
      },
      { runImmediately: true }
    );
  }

  // Attachment backfill -- process unprocessed email attachments
  registerTimer(
    "Attachment backfill",
    ATTACHMENT_BACKFILL_INTERVAL_MS,
    async () => {
      const result = await processUnprocessedAttachments({
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

  // Email triage backfill -- classify unclassified emails via LLM
  if (EMAIL_TRIAGE_BACKFILL_ENABLED) {
    registerTimer(
      "Email triage backfill",
      EMAIL_TRIAGE_BACKFILL_INTERVAL_MS,
      async () => {
        const result = await processTriageBackfillBatch(
          EMAIL_TRIAGE_BACKFILL_BATCH_SIZE,
          EMAIL_TRIAGE_BACKFILL_CONCURRENCY
        );
        if (result.fetched > 0) {
          console.log(
            `[worker] Email triage backfill: ${result.processed} ok, ${result.errors} errors, ${result.elapsedMs}ms`
          );
        }
      }
    );
  }

  // Contract packet auto-link -- map contract-related documents into packet evidence rows.
  registerTimer(
    "Contract packet autolink",
    CONTRACT_PACKET_AUTOLINK_INTERVAL_MS,
    async () => {
      const stats = await backfillContractPacketDocuments();
      if (stats.linked > 0) {
        console.log(
          `[worker] Contract packet autolink: ${stats.linked} document(s) linked`
        );
      }
    },
    { runImmediately: true }
  );

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
    const { syncAllGroups } = await import("@email/sync/groups");
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

  // Notification event detection — polls Postgres for permit expirations,
  // estimate wins, contracts received, etc. Creates notification records
  // and optionally Outlook drafts via Graph API.
  initNotificationTimer();
}

// ============================================================================
// Notification Poll Timer
// ============================================================================

async function processQueuedNotifications(
  client: ReturnType<typeof createDraftClientFromEnv>,
  maxEvents: number
): Promise<number> {
  const queued = await loadQueuedNotifications(maxEvents);
  let processed = 0;

  for (const queuedNotification of queued) {
    const event = queuedNotification.event;
    const stakeholders = await getStakeholders(event.eventType);

    if (stakeholders.length === 0) {
      await updateNotificationStatus(queuedNotification.id, "failed", {
        error: "No active stakeholders configured for event type",
      });
      processed++;
      continue;
    }

    try {
      const draft = await createNotificationDraft({
        client,
        event,
        stakeholders,
        mailbox: NOTIFICATIONS_MAILBOX,
      });
      await updateNotificationStatus(queuedNotification.id, "drafted", {
        draftId: draft.id,
      });
    } catch (err) {
      await updateNotificationStatus(queuedNotification.id, "failed", {
        error: (err as Error).message,
      });
    }
    processed++;
  }

  return processed;
}

async function deliverNewEvents(
  events: import("./lib/notifications/events").PendingEvent[],
  deliveryMode: NotificationDeliveryMode,
  draftClient: ReturnType<typeof createDraftClientFromEnv> | null
): Promise<void> {
  for (const event of events) {
    const stakeholders = await getStakeholders(event.eventType);
    const recipientList = stakeholders.map((s) => s.email).join(", ");

    console.log(
      `[worker]   [${event.eventType}] ${event.subject} → ${recipientList || "(no stakeholders)"}`
    );

    if (stakeholders.length === 0) {
      await recordNotification(
        event,
        "failed",
        undefined,
        "No active stakeholders configured for event type"
      );
      continue;
    }

    if (deliveryMode === "log" || !draftClient) {
      await recordNotification(event, "pending");
      continue;
    }

    try {
      const draft = await createNotificationDraft({
        client: draftClient,
        event,
        stakeholders,
        mailbox: NOTIFICATIONS_MAILBOX,
      });
      await recordNotification(event, "drafted", draft.id);
    } catch (err) {
      await recordNotification(
        event,
        "failed",
        undefined,
        (err as Error).message
      );
    }
  }
}

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
