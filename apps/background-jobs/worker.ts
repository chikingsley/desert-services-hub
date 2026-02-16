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

import { pollEstimateEmailLinker } from "@/apps/background-jobs/workers/estimate-email-linker/lib/poll";
import { pollFolderWatcher } from "@/apps/background-jobs/workers/outlook-folder-watcher/lib/poll";
import {
  ATTACHMENT_BACKFILL_BATCH_SIZE,
  ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST,
  ATTACHMENT_BACKFILL_INTERVAL_MS,
  ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST,
  CONTRACT_PACKET_AUTOLINK_INTERVAL_MS,
  ESTIMATE_LINKER_INTERVAL_MS,
  ESTIMATE_TRIAGE_ENABLED,
  ESTIMATE_TRIAGE_INTERVAL_MS,
  ESTIMATE_TRIAGE_MAX_ROWS,
  ESTIMATE_TRIAGE_PROVIDER,
  FOLDER_WATCHER_INTERVAL_MS,
  FULL_SYNC_INTERVAL_MS,
  GROUP_SYNC_INTERVAL_MS,
  MAX_CONCURRENT_JOBS,
  POLL_INTERVAL_MS,
  RENEWAL_INTERVAL_MS,
} from "./jobs/config";
import { getActiveJobCount, processNextJob } from "./jobs/dispatch";
import { backfillContractPacketDocuments } from "./jobs/intake-processing";
import { enqueueFullSyncIfMissing, requeueStale } from "./jobs/queue";
import { processUnprocessedAttachments } from "./lib/attachment-backfill";
import { runEstimateExtractionTriage } from "./lib/estimate-extraction-triage";

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
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}, Full sync: ${FULL_SYNC_INTERVAL_MS / 60_000}min, Folder watcher: ${FOLDER_WATCHER_INTERVAL_MS / 1000}s, Estimate linker backfill: ${ESTIMATE_LINKER_INTERVAL_MS / 1000}s, Estimate triage: ${ESTIMATE_TRIAGE_ENABLED ? `${ESTIMATE_TRIAGE_INTERVAL_MS / 1000}s (${ESTIMATE_TRIAGE_MAX_ROWS}/run via ${ESTIMATE_TRIAGE_PROVIDER || "mistral"})` : "disabled"}, Attachment backfill: ${ATTACHMENT_BACKFILL_INTERVAL_MS / 60_000}min (batch=${ATTACHMENT_BACKFILL_BATCH_SIZE}, includeNonProjectAllowlist=${ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST}, allowlist=${ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST.length > 0 ? ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST.join(",") : "none"}), Contract packet autolink: ${CONTRACT_PACKET_AUTOLINK_INTERVAL_MS / 1000}s`
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
        mailboxAllowlist: ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST,
        includeNonProjectForAllowlistedMailboxes:
          ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST,
      });
      if (result.processed > 0 || result.skipped > 0) {
        console.log(
          `[worker] Attachment backfill: ${result.succeeded} ok, ${result.failed} failed, ${result.skipped} skipped, ${result.elapsedMs}ms, ${result.attachmentsPerMinute.toFixed(1)} items/min`
        );
      }
    }
  );

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
}

export function stopWorker(): void {
  clearAllTimers();
  console.log("[worker] Stopped");
}
