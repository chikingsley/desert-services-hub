/**
 * Background Job Worker — Scheduler
 *
 * Thin orchestrator that registers timers and polls the job queue.
 * All logic lives in apps/workers/job-runner/lib/jobs modules:
 *   - config.ts       — env parsing, constants
 *   - queue.ts        — dequeue, claim, complete, fail, enqueue
 *   - dispatch.ts     — job type routing (processNextJob)
 *   - monday-sync.ts  — single item sync from Monday
 *   - email-processing.ts — Outlook webhook email handling
 *   - intake-processing.ts — document linking, contract packets, SharePoint
 *   - permit-sync.ts  — permit-worker coordination for payment flows
 */

import { runEstimateExtractionTriage } from "@/apps/web/lib/estimate-extraction-triage";
import { pollEstimateEmailLinker } from "@/apps/workers/estimate-email-linker/lib/poll";
import { pollFolderWatcher } from "@/apps/workers/outlook-folder-watcher/lib/poll";
import {
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

// ============================================================================
// Worker Lifecycle
// ============================================================================

let pollTimer: ReturnType<typeof setInterval> | null = null;
let fullSyncTimer: ReturnType<typeof setInterval> | null = null;
let folderWatcherTimer: ReturnType<typeof setInterval> | null = null;
let estimateLinkerTimer: ReturnType<typeof setInterval> | null = null;
let estimateTriageTimer: ReturnType<typeof setInterval> | null = null;
let contractPacketAutolinkTimer: ReturnType<typeof setInterval> | null = null;
let renewalTimer: ReturnType<typeof setInterval> | null = null;
let groupSyncTimer: ReturnType<typeof setInterval> | null = null;

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting background job processor");
  console.log(
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}, Full sync: ${FULL_SYNC_INTERVAL_MS / 60_000}min, Folder watcher: ${FOLDER_WATCHER_INTERVAL_MS / 1000}s, Estimate linker backfill: ${ESTIMATE_LINKER_INTERVAL_MS / 1000}s, Estimate triage: ${ESTIMATE_TRIAGE_ENABLED ? `${ESTIMATE_TRIAGE_INTERVAL_MS / 1000}s (${ESTIMATE_TRIAGE_MAX_ROWS}/run via ${ESTIMATE_TRIAGE_PROVIDER || "mistral"})` : "disabled"}, Contract packet autolink: ${CONTRACT_PACKET_AUTOLINK_INTERVAL_MS / 1000}s`
  );

  // Recover stale jobs from previous crashes
  try {
    const requeued = await requeueStale.run();
    if (requeued.count > 0) {
      console.log(`[worker] Requeued ${requeued.count} stale job(s)`);
    }
  } catch (error) {
    console.error("[worker] requeueStale failed:", error);
  }

  // Queue initial full sync if none pending
  try {
    await enqueueFullSyncIfMissing("startup");
  } catch (error) {
    console.error("[worker] enqueueFullSync failed:", error);
  }

  // Poll for jobs
  pollTimer = setInterval(() => {
    const availableSlots = Math.max(
      0,
      MAX_CONCURRENT_JOBS - getActiveJobCount()
    );
    for (let i = 0; i < availableSlots; i++) {
      processNextJob().catch((error) =>
        console.error("[worker] Poll error:", error)
      );
    }
  }, POLL_INTERVAL_MS);

  // Kick off initial workers immediately so we don't wait for first timer tick.
  for (let i = 0; i < MAX_CONCURRENT_JOBS; i++) {
    processNextJob().catch((error) =>
      console.error("[worker] Poll error:", error)
    );
  }

  // Periodic full sync
  fullSyncTimer = setInterval(async () => {
    await enqueueFullSyncIfMissing("periodic");
  }, FULL_SYNC_INTERVAL_MS);

  // Outlook folder watcher — polls Graph deltas for folder/message changes (every 30s)
  let folderWatcherRunning = false;
  folderWatcherTimer = setInterval(async () => {
    if (folderWatcherRunning) {
      return; // skip if previous poll still in-flight
    }
    folderWatcherRunning = true;
    try {
      await pollFolderWatcher();
    } catch (error) {
      console.error("[worker] Folder watcher error:", error);
    } finally {
      folderWatcherRunning = false;
    }
  }, FOLDER_WATCHER_INTERVAL_MS);
  // Run first poll immediately
  pollFolderWatcher().catch((error) =>
    console.error("[worker] Folder watcher initial poll error:", error)
  );

  // Estimate linker backfill — continuously populate estimate_emails for unlinked emails (every 60s)
  let estimateLinkerRunning = false;
  estimateLinkerTimer = setInterval(async () => {
    if (estimateLinkerRunning) {
      return;
    }
    estimateLinkerRunning = true;
    try {
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
    } catch (error) {
      console.error("[worker] Estimate linker error:", error);
    } finally {
      estimateLinkerRunning = false;
    }
  }, ESTIMATE_LINKER_INTERVAL_MS);
  pollEstimateEmailLinker({ enableProjectSingle: false }).catch((error) =>
    console.error("[worker] Estimate linker initial poll error:", error)
  );

  // Estimate extraction triage — classify failed rows and retry estimate-like docs.
  if (ESTIMATE_TRIAGE_ENABLED) {
    let estimateTriageRunning = false;
    const runTriage = async () => {
      if (estimateTriageRunning) {
        return;
      }
      estimateTriageRunning = true;
      try {
        const result = await runEstimateExtractionTriage({
          includeNullNonPdf: true,
          log: (line) => console.log(`[worker] ${line}`),
          maxRows: ESTIMATE_TRIAGE_MAX_ROWS,
          onlyUntaggedFailed: true,
          provider: ESTIMATE_TRIAGE_PROVIDER || "mistral",
        });

        if (result.candidateRows > 0) {
          console.log(
            `[worker] Estimate extraction triage summary: candidates=${result.candidateRows}, fixed=${result.fixedByRetry}, non_estimate=${result.markedNonEstimate}, non_pdf=${result.markedNonPdf}, unknown=${result.markedUnknown}, retry_failed=${result.retryStillFailed}, no_asset=${result.skippedNoAsset}`
          );
        }
      } catch (error) {
        console.error("[worker] Estimate extraction triage error:", error);
      } finally {
        estimateTriageRunning = false;
      }
    };

    estimateTriageTimer = setInterval(runTriage, ESTIMATE_TRIAGE_INTERVAL_MS);
    runTriage().catch((error) =>
      console.error(
        "[worker] Estimate extraction triage initial run error:",
        error
      )
    );
  }

  // Contract packet auto-link — map contract-related documents into packet evidence rows.
  let contractPacketAutolinkRunning = false;
  contractPacketAutolinkTimer = setInterval(async () => {
    if (contractPacketAutolinkRunning) {
      return;
    }
    contractPacketAutolinkRunning = true;
    try {
      const stats = await backfillContractPacketDocuments();
      if (stats.linked > 0) {
        console.log(
          `[worker] Contract packet autolink: ${stats.linked} document(s) linked`
        );
      }
    } catch (error) {
      console.error("[worker] Contract packet autolink error:", error);
    } finally {
      contractPacketAutolinkRunning = false;
    }
  }, CONTRACT_PACKET_AUTOLINK_INTERVAL_MS);
  backfillContractPacketDocuments().catch((error) =>
    console.error("[worker] Contract packet autolink initial run error:", error)
  );

  // Renew expiring Outlook subscriptions (every hour)
  renewalTimer = setInterval(async () => {
    try {
      const { renewExpiring } = await import("@email/subscriptions");
      const result = await renewExpiring(24);
      if (result.renewed > 0 || result.failed > 0) {
        console.log(
          `[worker] Subscription renewal: ${result.renewed} renewed, ${result.failed} failed`
        );
      }
    } catch (error) {
      console.error("[worker] Subscription renewal error:", error);
    }
  }, RENEWAL_INTERVAL_MS);

  // Periodic M365 group sync (internalcontracts@ etc) — every 15 min
  // Graph doesn't support app-only webhooks for group conversations, so we poll.
  groupSyncTimer = setInterval(async () => {
    try {
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
    } catch (error) {
      console.error("[worker] Group sync error:", error);
    }
  }, GROUP_SYNC_INTERVAL_MS);
}

export function stopWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (fullSyncTimer) {
    clearInterval(fullSyncTimer);
    fullSyncTimer = null;
  }
  if (folderWatcherTimer) {
    clearInterval(folderWatcherTimer);
    folderWatcherTimer = null;
  }
  if (estimateLinkerTimer) {
    clearInterval(estimateLinkerTimer);
    estimateLinkerTimer = null;
  }
  if (estimateTriageTimer) {
    clearInterval(estimateTriageTimer);
    estimateTriageTimer = null;
  }
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }
  if (contractPacketAutolinkTimer) {
    clearInterval(contractPacketAutolinkTimer);
    contractPacketAutolinkTimer = null;
  }
  if (groupSyncTimer) {
    clearInterval(groupSyncTimer);
    groupSyncTimer = null;
  }
  console.log("[worker] Stopped");
}
