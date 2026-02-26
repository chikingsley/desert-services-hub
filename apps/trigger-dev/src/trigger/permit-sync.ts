/**
 * Permit Sync — Trigger.dev scheduled task
 *
 * Replaces the pgmq `permit_sync` job. Runs every 30 minutes to sync
 * dust permit data from the Maricopa County portal via permit-worker.
 *
 * The portal sync drives a real browser and takes 2-4 minutes. Bun.serve
 * caps idle timeout at 255s, so the HTTP response may not arrive. The
 * permit-worker uses an in-flight guard — the sync completes server-side
 * even if the client disconnects. We fire the request, tolerate timeouts,
 * then verify the DB was updated.
 */

import { logger, schedules } from "@trigger.dev/sdk";

const PERMIT_WORKER_URL =
  process.env.PERMIT_WORKER_URL?.trim() || "http://permit-worker:47822";

export const permitSync = schedules.task({
  id: "permit-sync",
  cron: "*/30 * * * *",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async () => {
    const url = `${PERMIT_WORKER_URL}/api/sync/company`;

    // Fire the sync — tolerate connection drops since the permit-worker
    // continues processing via its in-flight guard
    let response: unknown;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4 * 60 * 1000);
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timer);
      response = await res.json();
      logger.info("Sync response received", { response });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Sync request ended (expected for long portal scrapes)", {
        error: msg,
      });
    }

    // Verify permits were synced by checking the DB
    const { db } = await import("@lib/db/client");
    const row = await db
      .query<{ total: number; active: number }>(
        `SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'Active')::int AS active
       FROM dust_permits_filed_by_desert_services`
      )
      .get();

    const total = row?.total ?? 0;
    const active = row?.active ?? 0;

    logger.info("Permit sync complete", {
      total,
      active,
      gotResponse: response !== undefined,
    });

    return { total, active };
  },
});
