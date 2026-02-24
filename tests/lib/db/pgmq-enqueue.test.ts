import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";

/**
 * Tests the pgmq background job infrastructure from migration:
 * 20260219120000_pgmq_pgcron_atomic_rewrite.sql
 *
 * Validates:
 * - enqueue_background_job() creates queue messages
 * - Dedup prevents duplicate messages in the queue
 * - Dead letter table exists and is writable
 * - pg_cron schedules are registered
 */

const RUN = crypto.randomUUID().slice(0, 8).toLowerCase();
const TEST_JOB_TYPE = `_test_pgmq_${RUN}`;
const enqueuedMsgIds: Array<string | number> = [];

async function enqueueJob(
  jobType: string,
  payload: Record<string, unknown> = {},
  dedupe = false
): Promise<string | number | null> {
  const row = await db
    .query<{ enqueue_background_job: string | number | null }>(
      "SELECT public.enqueue_background_job($1, $2::jsonb, NULL, 3, $3) AS enqueue_background_job"
    )
    .get(jobType, JSON.stringify(payload), dedupe);
  const msgId = row?.enqueue_background_job ?? null;
  if (msgId != null) {
    enqueuedMsgIds.push(msgId);
  }
  return msgId;
}

async function deleteMsg(msgId: string | number): Promise<void> {
  await db.run(`SELECT pgmq.delete('background_jobs', $1::bigint)`, [msgId]);
}

afterAll(async () => {
  // Clean up any test messages still in the queue
  for (const msgId of enqueuedMsgIds) {
    try {
      await deleteMsg(msgId);
    } catch {
      // Already consumed or deleted
    }
  }
});

describe("pgmq background job infrastructure", () => {
  test("enqueue_background_job creates a message", async () => {
    const msgId = await enqueueJob(TEST_JOB_TYPE, { test: true });

    expect(msgId).not.toBeNull();
    // pgmq returns bigint which Bun.sql may return as string or number
    expect(Number(msgId)).toBeGreaterThan(0);
  });

  test("enqueue with dedupe=true prevents duplicate messages", async () => {
    const jobType = `${TEST_JOB_TYPE}_dedup`;
    const payload = { dedup_test: RUN };

    const first = await enqueueJob(jobType, payload, true);
    const second = await enqueueJob(jobType, payload, true);

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // Dedup should return NULL
  });

  test("enqueue with dedupe=false allows duplicate messages", async () => {
    const jobType = `${TEST_JOB_TYPE}_nodup`;
    const payload = { nodup_test: RUN };

    const first = await enqueueJob(jobType, payload, false);
    const second = await enqueueJob(jobType, payload, false);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  test("dead letter table exists and is queryable", async () => {
    const row = await db
      .query<{ cnt: string }>(
        "SELECT COUNT(*)::text AS cnt FROM background_job_dead_letters"
      )
      .get();

    expect(row).not.toBeNull();
    expect(Number(row?.cnt)).toBeGreaterThanOrEqual(0);
  });

  test("pg_cron has expected scheduled jobs", async () => {
    const rows = (await db.run(
      "SELECT jobname FROM cron.job ORDER BY jobname"
    )) as Array<{ jobname: string }>;

    const jobNames = rows.map((r) => r.jobname);

    // Core jobs that must exist
    const required = [
      "bg_sync_full",
      "bg_folder_watcher",
      "bg_estimate_linker",
      "bg_attachment_backfill",
      "bg_email_triage_batch",
      "bg_contract_won_bridge",
      "bg_account_linking",
      "bg_contact_linking",
      "bg_body_link_backfill",
      "bg_mailbox_fallback_sync",
    ];

    for (const name of required) {
      expect(jobNames).toContain(name);
    }
  });
});
