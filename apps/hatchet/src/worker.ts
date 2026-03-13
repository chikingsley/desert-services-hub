/**
 * Hatchet Worker — long-running process that registers tasks and pulls work.
 *
 * Start: bun run apps/hatchet/src/worker.ts
 *   or:  just hatchet-worker
 */

import { hatchet } from "./client";
import {
  emailSync,
  mailboxBackfill,
  mailboxSyncCron,
  syncOneMailboxTask,
} from "./tasks/email-pipeline";

const WORKER_SLOTS = Number(process.env.HATCHET_WORKER_SLOTS) || 100;

async function main() {
  console.info("[hatchet] Starting worker...");

  const worker = await hatchet.worker("email-pipeline", {
    slots: WORKER_SLOTS,
    workflows: [
      emailSync,
      syncOneMailboxTask,
      mailboxBackfill,
      mailboxSyncCron,
    ],
  });

  await worker.start();
  console.info(`[hatchet] Worker started with ${WORKER_SLOTS} slots`);
}

main().catch((err) => {
  console.error("[hatchet] Worker failed to start:", err);
  process.exit(1);
});
