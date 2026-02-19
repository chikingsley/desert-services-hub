/**
 * Background Job Worker — Queue Consumer (pgmq)
 *
 * Scheduling is owned by pg_cron in Postgres.
 * This process only consumes queue messages and executes handlers.
 */

import {
  AQDATA_DETAIL_SCRAPE_BATCH_SIZE,
  AQDATA_DETAIL_SCRAPE_ENABLED,
  AQDATA_SYNC_ENABLED,
  BODY_LINK_BACKFILL_ENABLED,
  EMAIL_TRIAGE_BACKFILL_BATCH_SIZE,
  EMAIL_TRIAGE_BACKFILL_CONCURRENCY,
  EMAIL_TRIAGE_BACKFILL_ENABLED,
  ESTIMATE_TRIAGE_ENABLED,
  ESTIMATE_TRIAGE_MAX_ROWS,
  MAX_CONCURRENT_JOBS,
  MONDAY_STATUS_SYNC_ENABLED,
  PERMIT_SCRAPE_ENABLED,
  PERMIT_SYNC_ENABLED,
  POLL_INTERVAL_MS,
} from "./jobs/config";
import { getActiveJobCount, processNextJob } from "./jobs/dispatch";
import { enqueueFullSyncIfMissing, enqueueIfNotPending } from "./jobs/queue";

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function seedStartupJobs(): Promise<void> {
  await enqueueFullSyncIfMissing("startup");
  await enqueueIfNotPending("folder_watcher_poll", {});
  await enqueueIfNotPending("estimate_linker_poll", {});
  await enqueueIfNotPending("swppp_master_sync", {});
  await enqueueIfNotPending("attachment_backfill", {});
  await enqueueIfNotPending("account_linking", {});
  await enqueueIfNotPending("contact_linking", {});
  if (BODY_LINK_BACKFILL_ENABLED) {
    await enqueueIfNotPending("body_link_backfill", {});
  }

  if (EMAIL_TRIAGE_BACKFILL_ENABLED) {
    await enqueueIfNotPending("email_triage_batch", {
      batchSize: EMAIL_TRIAGE_BACKFILL_BATCH_SIZE,
      concurrency: EMAIL_TRIAGE_BACKFILL_CONCURRENCY,
      provider: "local",
    });
  }

  if (ESTIMATE_TRIAGE_ENABLED) {
    await enqueueIfNotPending("estimate_triage", {
      maxRows: ESTIMATE_TRIAGE_MAX_ROWS,
    });
  }

  if (MONDAY_STATUS_SYNC_ENABLED) {
    await enqueueIfNotPending("monday_status_sync", {});
  }

  if (PERMIT_SYNC_ENABLED) {
    await enqueueIfNotPending("permit_sync", {});
  }

  if (PERMIT_SCRAPE_ENABLED) {
    await enqueueIfNotPending("permit_detail_scrape", {});
  }

  if (AQDATA_SYNC_ENABLED) {
    await enqueueIfNotPending("aqdata_sync", {});
  }

  if (AQDATA_DETAIL_SCRAPE_ENABLED) {
    await enqueueIfNotPending("aqdata_detail_scrape", {
      limit: AQDATA_DETAIL_SCRAPE_BATCH_SIZE,
    });
  }

  await enqueueIfNotPending("notifications_tick", {});
}

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting pgmq consumer");
  console.log(
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}`
  );

  await seedStartupJobs();

  pollTimer = setInterval(() => {
    const availableSlots = Math.max(
      0,
      MAX_CONCURRENT_JOBS - getActiveJobCount()
    );
    for (let i = 0; i < availableSlots; i++) {
      processNextJob().catch((err) =>
        console.error("[worker] Poll error:", err)
      );
    }
  }, POLL_INTERVAL_MS);

  for (let i = 0; i < MAX_CONCURRENT_JOBS; i++) {
    processNextJob().catch((err) => console.error("[worker] Poll error:", err));
  }
}

export function stopWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log("[worker] Stopped");
}
