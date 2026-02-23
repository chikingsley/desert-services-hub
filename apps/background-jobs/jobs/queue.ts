/**
 * Job queue operations backed by pgmq.
 */

import { db } from "@lib/db/client";
import type { z } from "zod";
import { STALE_JOB_MINUTES } from "./config";
import type { WebhookJob } from "./types";

const QUEUE_TABLE = "pgmq.q_background_jobs";
const DEFAULT_MAX_ATTEMPTS = 3;
const VISIBILITY_TIMEOUT_SECONDS = STALE_JOB_MINUTES * 60;

interface QueueRow {
  message:
    | {
        job_type?: string;
        monday_item_id?: string | null;
        payload?: unknown;
        max_attempts?: number;
      }
    | string;
  msg_id: number;
  read_ct: number;
}

const enqueueBackgroundJob = db.query<{ id: number }>(
  "SELECT public.enqueue_background_job($1, ($2::text)::jsonb, $3, $4, $5)::bigint AS id"
);

const dequeueNextJob = db.query<QueueRow>(`
  WITH next AS (
    SELECT msg_id
    FROM ${QUEUE_TABLE}
    WHERE vt <= now()
      AND read_ct < COALESCE((message->>'max_attempts')::int, ${DEFAULT_MAX_ATTEMPTS})
    ORDER BY
      CASE WHEN message->>'job_type' = 'email_notification' THEN 0 ELSE 1 END,
      msg_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ${QUEUE_TABLE} AS q
  SET
    vt = now() + make_interval(secs => ${VISIBILITY_TIMEOUT_SECONDS}),
    read_ct = q.read_ct + 1
  FROM next
  WHERE q.msg_id = next.msg_id
  RETURNING q.msg_id, q.read_ct, q.message
`);

const dequeueNextJobExcludeLlm = db.query<QueueRow>(`
  WITH next AS (
    SELECT msg_id
    FROM ${QUEUE_TABLE}
    WHERE vt <= now()
      AND read_ct < COALESCE((message->>'max_attempts')::int, ${DEFAULT_MAX_ATTEMPTS})
      AND message->>'job_type' NOT IN ('contact_enrichment', 'email_triage_batch', 'estimate_triage')
    ORDER BY
      CASE WHEN message->>'job_type' = 'email_notification' THEN 0 ELSE 1 END,
      msg_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ${QUEUE_TABLE} AS q
  SET
    vt = now() + make_interval(secs => ${VISIBILITY_TIMEOUT_SECONDS}),
    read_ct = q.read_ct + 1
  FROM next
  WHERE q.msg_id = next.msg_id
  RETURNING q.msg_id, q.read_ct, q.message
`);

const deleteMessage = db.query(
  "SELECT pgmq.delete('background_jobs', $1::bigint)"
);

const requeueSoon = db.query(`
  UPDATE ${QUEUE_TABLE}
  SET vt = now() + make_interval(secs => 5)
  WHERE msg_id = $1
`);

const insertDeadLetter = db.query(`
  INSERT INTO background_job_dead_letters
    (job_id, job_type, monday_item_id, payload, attempts, max_attempts, error)
  VALUES
    ($1, $2, $3, $4::jsonb, $5, $6, $7)
`);

function normalizePayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload ?? {});
}

function parseQueueMessage(row: QueueRow): WebhookJob {
  const raw =
    typeof row.message === "string" ? JSON.parse(row.message) : row.message;
  const jobType = raw?.job_type;
  if (!jobType || typeof jobType !== "string") {
    throw new Error(`Queue message ${row.msg_id} missing job_type`);
  }

  return {
    id: row.msg_id,
    job_type: jobType,
    monday_item_id:
      typeof raw?.monday_item_id === "string" ? raw.monday_item_id : null,
    payload: JSON.stringify(raw?.payload ?? {}),
    attempts: row.read_ct,
    max_attempts:
      Number.isInteger(raw?.max_attempts) && (raw?.max_attempts as number) > 0
        ? (raw?.max_attempts as number)
        : DEFAULT_MAX_ATTEMPTS,
  };
}

export async function enqueueJob(
  jobType: string,
  options?: {
    mondayItemId?: string | null;
    payload?: unknown;
    maxAttempts?: number;
    dedupe?: boolean;
  }
): Promise<number | null> {
  const payload = normalizePayload(options?.payload);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const row = await enqueueBackgroundJob.get(
    jobType,
    payload,
    options?.mondayItemId ?? null,
    maxAttempts,
    options?.dedupe ?? false
  );
  return row?.id ?? null;
}

export async function dequeue(options?: {
  excludeLlmTypes?: boolean;
}): Promise<WebhookJob | null> {
  const stmt = options?.excludeLlmTypes
    ? dequeueNextJobExcludeLlm
    : dequeueNextJob;
  const row = await stmt.get();
  return row ? parseQueueMessage(row) : null;
}

export async function completeJob(jobId: number): Promise<void> {
  await deleteMessage.run(jobId);
}

export async function failJob(job: WebhookJob, error: string): Promise<void> {
  if (job.attempts >= job.max_attempts) {
    await insertDeadLetter.run(
      job.id,
      job.job_type,
      job.monday_item_id,
      job.payload,
      job.attempts,
      job.max_attempts,
      error.slice(0, 1000)
    );
    await deleteMessage.run(job.id);
    return;
  }

  await requeueSoon.run(job.id);
}

export async function enqueueIfNotPending(
  jobType: string,
  payload: unknown = {}
): Promise<boolean> {
  const id = await enqueueJob(jobType, {
    payload,
    dedupe: true,
  });
  return id !== null;
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
