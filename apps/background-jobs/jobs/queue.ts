/**
 * Job queue operations — dequeue, claim, complete, fail, enqueue.
 */

import { db } from "@lib/db/hub";
import type { z } from "zod";
import {
  ESTIMATE_FILE_SWEEP_BATCH_SIZE,
  ESTIMATE_FILE_SWEEP_CURSOR_KEY,
  STALE_JOB_MINUTES,
} from "./config";

// -- Types --

export interface WebhookJob {
  id: number;
  job_type: string;
  monday_item_id: string | null;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
}

// -- Prepared statements --

const selectNextJob = db.query<WebhookJob>(`
  SELECT * FROM webhook_jobs
  WHERE status = 'pending' OR (status = 'failed' AND attempts < max_attempts)
  ORDER BY
    CASE
      WHEN job_type = 'email_notification' THEN 0
      ELSE 1
    END,
    created_at ASC
  LIMIT 1
`);

const claimJobStmt = db.prepare(
  "UPDATE webhook_jobs SET status = 'processing', started_at = now(), attempts = attempts + 1 WHERE id = ? AND status IN ('pending', 'failed')"
);

export const completeJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'completed', completed_at = now(), error = NULL WHERE id = ?"
);

export const failJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'failed', error = ? WHERE id = ?"
);

export const requeueStale = db.prepare(`
  UPDATE webhook_jobs SET status = 'pending', started_at = NULL
  WHERE status = 'processing' AND started_at < now() - interval '${STALE_JOB_MINUTES} minutes'
`);

export const enqueueJob = db.prepare(
  "INSERT INTO webhook_jobs (job_type, monday_item_id, payload) VALUES (?, ?, ?)"
);

const enqueueDownloadFilesIfNotQueued = db.prepare(`
  INSERT INTO webhook_jobs (job_type, monday_item_id, payload)
  SELECT 'download_files', ?, '{}'
  WHERE NOT EXISTS (
    SELECT 1 FROM webhook_jobs
    WHERE job_type = 'download_files'
      AND monday_item_id = ?
      AND status IN ('pending', 'processing')
  )
`);

const enqueueFullSync = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('sync_full', '{}')"
);

const pendingFullSyncCount = db.query<{ count: number }>(
  "SELECT COUNT(*) as count FROM webhook_jobs WHERE job_type = 'sync_full' AND status IN ('pending', 'processing')"
);

const getEstimatePollerConfigValue = db.query<{ value: string }>(
  "SELECT value FROM estimate_poller_config WHERE key = ?"
);

const setEstimatePollerConfigValue = db.prepare(
  "INSERT INTO estimate_poller_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
);

// -- Functions --

export async function enqueueFullSyncIfMissing(reason: string): Promise<void> {
  const pending = await pendingFullSyncCount.get();
  if (Number(pending?.count ?? 0) === 0) {
    await enqueueFullSync.run();
    console.log(`[worker] Queued full sync (${reason})`);
  }
}

export async function dequeue(): Promise<WebhookJob | null> {
  const job = await selectNextJob.get();
  if (!job) {
    return null;
  }

  const result = await claimJobStmt.run(job.id);
  if (result.count === 0) {
    return null;
  }

  return { ...job, status: "processing", attempts: job.attempts + 1 };
}

export function parseJobPayload<T>(job: WebhookJob, schema: z.ZodType<T>): T {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(job.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON payload for ${job.job_type} (job #${job.id}): ${message}`
    );
  }

  const parsed = schema.safeParse(rawPayload);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(
      `Invalid payload for ${job.job_type} (job #${job.id}): ${details}`
    );
  }

  return parsed.data;
}

export async function enqueueEstimateFileSweep(
  mondayItemIds: string[]
): Promise<{ queued: number; batched: number; total: number }> {
  const ids = [...new Set(mondayItemIds)];
  if (ids.length === 0) {
    return { queued: 0, batched: 0, total: 0 };
  }

  const batchSize = Math.min(ESTIMATE_FILE_SWEEP_BATCH_SIZE, ids.length);
  const offsetRow = await getEstimatePollerConfigValue.get(
    ESTIMATE_FILE_SWEEP_CURSOR_KEY
  );
  let offset = Number.parseInt(offsetRow?.value ?? "0", 10);
  if (!Number.isFinite(offset) || offset < 0) {
    offset = 0;
  }
  if (offset >= ids.length) {
    offset = 0;
  }

  const batch: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(ids[(offset + i) % ids.length] as string);
  }

  let queued = 0;
  for (const itemId of batch) {
    const result = await enqueueDownloadFilesIfNotQueued.run(itemId, itemId);
    if (result.count > 0) {
      queued++;
    }
  }

  const nextOffset = (offset + batchSize) % ids.length;
  await setEstimatePollerConfigValue.run(
    ESTIMATE_FILE_SWEEP_CURSOR_KEY,
    String(nextOffset)
  );

  return { queued, batched: batch.length, total: ids.length };
}
