/**
 * Background Job Worker — Queue Consumer (pgmq)
 *
 * Scheduling is owned by pg_cron in Postgres.
 * This process only consumes queue messages and executes handlers.
 *
 * All recurring job schedules live in the pgmq_pgcron migration.
 * The worker does NOT seed or schedule jobs — it is a pure consumer.
 */

import { MAX_CONCURRENT_JOBS, POLL_INTERVAL_MS } from "./jobs/config";
import { getActiveJobCount, processNextJob } from "./jobs/dispatch";
import { enqueueFullSyncIfMissing } from "./jobs/queue";

let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting pgmq consumer");
  console.log(
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}`
  );

  // One-time startup: ensure a full sync exists (idempotent, no-op if already queued)
  await enqueueFullSyncIfMissing("startup");

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
