/**
 * Estimate Email Linker
 *
 * Goal: continuously populate `estimate_emails` and `emails.project_id` using
 * deterministic signals via the unified `linkEmail()` function.
 *
 * Design principles:
 * - Conservative: only auto-link when the match is unambiguous.
 * - Idempotent: all writes use ON CONFLICT DO NOTHING / WHERE ... IS NULL.
 * - Incremental: stores a "last processed email id" in background_worker_config.
 *
 * Per-email signals (delegated to linkEmail):
 *   1) Conversation → project (sibling in same thread already has project_id)
 *   2) Pulse ID → estimate (Monday item ID in subject/body/attachments)
 *   3) Estimate number → estimate (Est_XXXXXXXX pattern matching)
 *   4) Estimate → project (linked estimate maps to exactly 1 project)
 *   5) Project → single estimate (project has exactly 1 estimate)
 *
 * Post-processing passes (run after each poll batch):
 *   6) Conversation backfill: emails in a conversation where exactly one estimate
 *      is already linked get the same estimate_emails row inserted.
 *   7) Project ID backfill: emails.project_id is set from the estimate→project_estimates
 *      chain when a conversation has exactly one distinct project.
 */

import { db } from "@lib/db/client";
import { linkEmail } from "@lib/linking/link-email";

// Shared worker checkpoint table for lightweight worker state.
const CONFIG_KEY_LAST_EMAIL_ID = "estimate_email_linker_last_email_id";

async function getConfig(key: string): Promise<string | null> {
  const row = await db
    .query<{ value: string }, [string]>(
      "SELECT value FROM background_worker_config WHERE key = $1"
    )
    .get(key);
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO background_worker_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
}

export interface PollOptions {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
  minEmailId?: number;
}

export interface PollStats {
  processedEmails: number;
  linksInserted: number;
  projectsLinked: number;
  skippedNoSignal: number;
  lastEmailId: number;
  conversationLinksInserted: number;
  directProjectsStamped: number;
  projectIdsBackfilled: number;
}

interface PollSettings {
  dryRun: boolean;
  batchSize: number;
  maxBatches: number;
}

function resolvePollSettings(opts: PollOptions): PollSettings {
  const dryRun = Boolean(opts.dryRun);
  const batchSize = Math.max(50, Math.min(5000, opts.batchSize ?? 500));
  const maxBatchesRaw = opts.maxBatches ?? 10;
  const maxBatches =
    maxBatchesRaw <= 0 ? Number.POSITIVE_INFINITY : Math.max(1, maxBatchesRaw);
  return { dryRun, batchSize, maxBatches };
}

// ── Cursor initialization ──────────────────────────────────────────────

async function resolveStartFrom(
  dryRun: boolean,
  minEmailId: number | undefined | null
): Promise<number> {
  if (minEmailId != null) {
    return minEmailId;
  }

  const cfg = await getConfig(CONFIG_KEY_LAST_EMAIL_ID);
  if (cfg) {
    const parsed = Number.parseInt(cfg, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // First run: start near the newest emails for quick validation.
  const row = await db
    .query<{ max_id: number }>(
      "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM emails"
    )
    .get();
  const startFrom = Math.max(0, (row?.max_id ?? 0) - 10_000);

  if (!dryRun) {
    await setConfig(CONFIG_KEY_LAST_EMAIL_ID, String(startFrom));
  }
  return startFrom;
}

// ── Post-pass: conversation backfill ──────────────────────────────────
//
// For every conversation that has exactly one distinct estimate already in
// estimate_emails, insert that same link for all other (unlinked) emails in
// the conversation. Covers cases like copies of the same email across multiple
// mailboxes, or reply emails from the GC that contain no estimate-number signal.

async function runConversationBackfill(dryRun: boolean): Promise<number> {
  if (dryRun) {
    const row = await db
      .query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM (
           SELECT DISTINCT ee.estimate_id, e2.id
           FROM estimate_emails ee
           JOIN emails anchor ON anchor.id = ee.email_id
           JOIN emails e2
             ON e2.conversation_id = anchor.conversation_id
            AND e2.conversation_id IS NOT NULL
            AND e2.is_excluded = 0
           WHERE anchor.conversation_id IN (
             SELECT e3.conversation_id
             FROM emails e3
             JOIN estimate_emails ee3 ON ee3.email_id = e3.id
             WHERE e3.conversation_id IS NOT NULL
             GROUP BY e3.conversation_id
             HAVING COUNT(DISTINCT ee3.estimate_id) = 1
           )
           AND NOT EXISTS (
             SELECT 1 FROM estimate_emails ee2
             WHERE ee2.email_id = e2.id AND ee2.estimate_id = ee.estimate_id
           )
         ) sub`
      )
      .get();
    return Number(row?.cnt ?? 0);
  }

  const r = await db.run(`
    INSERT INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
    SELECT DISTINCT ee.estimate_id, e2.id, 'conversation', 'conversation thread backfill'
    FROM estimate_emails ee
    JOIN emails anchor ON anchor.id = ee.email_id
    JOIN emails e2
      ON e2.conversation_id = anchor.conversation_id
     AND e2.conversation_id IS NOT NULL
     AND e2.is_excluded = 0
    WHERE anchor.conversation_id IN (
      SELECT e3.conversation_id
      FROM emails e3
      JOIN estimate_emails ee3 ON ee3.email_id = e3.id
      WHERE e3.conversation_id IS NOT NULL
      GROUP BY e3.conversation_id
      HAVING COUNT(DISTINCT ee3.estimate_id) = 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM estimate_emails ee2
      WHERE ee2.email_id = e2.id AND ee2.estimate_id = ee.estimate_id
    )
    ON CONFLICT DO NOTHING
  `);
  return r.count ?? 0;
}

// ── Post-pass: direct project_id stamp ───────────────────────────────
//
// For emails directly linked to an estimate (via estimate_emails), stamp
// project_id from the estimate→project_estimates chain. No conversation_id
// required. When an email links to estimates in multiple projects, pick one
// (MIN) — operator can manually correct rare edge cases.

async function runDirectProjectStamp(dryRun: boolean): Promise<number> {
  if (dryRun) {
    const row = await db
      .query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM emails e
         WHERE e.project_id IS NULL
           AND EXISTS (
             SELECT 1 FROM estimate_emails ee
             JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
             WHERE ee.email_id = e.id
           )`
      )
      .get();
    return Number(row?.cnt ?? 0);
  }

  const r = await db.run(`
    UPDATE emails e
    SET project_id = subq.project_id
    FROM (
      SELECT ee.email_id, MIN(pe.project_id) AS project_id
      FROM estimate_emails ee
      JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
      GROUP BY ee.email_id
    ) subq
    WHERE e.id = subq.email_id
      AND e.project_id IS NULL
  `);
  return r.count ?? 0;
}

// ── Post-pass: thread project_id propagation ─────────────────────────
//
// For conversations where emails are linked to estimates, propagate
// project_id to all other emails in the thread. When a thread spans
// multiple projects, picks one (MIN) — operator can manually correct.

async function runProjectIdBackfill(dryRun: boolean): Promise<number> {
  if (dryRun) {
    const row = await db
      .query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM emails e
         WHERE e.project_id IS NULL
           AND e.conversation_id IS NOT NULL
           AND e.conversation_id IN (
             SELECT e2.conversation_id
             FROM emails e2
             JOIN estimate_emails ee ON ee.email_id = e2.id
             JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
             WHERE e2.conversation_id IS NOT NULL
             GROUP BY e2.conversation_id
           )`
      )
      .get();
    return Number(row?.cnt ?? 0);
  }

  const r = await db.run(`
    UPDATE emails e
    SET project_id = subq.project_id
    FROM (
      SELECT e2.conversation_id, MIN(pe.project_id) AS project_id
      FROM emails e2
      JOIN estimate_emails ee ON ee.email_id = e2.id
      JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
      WHERE e2.conversation_id IS NOT NULL
      GROUP BY e2.conversation_id
    ) subq
    WHERE e.conversation_id = subq.conversation_id
      AND e.project_id IS NULL
  `);
  return r.count ?? 0;
}

function fetchCandidateEmailRows(
  lastId: number,
  batchSize: number
): Promise<Array<{ id: number }>> {
  return db
    .query<{ id: number }, [number, number]>(
      `
      SELECT e.id
      FROM emails e
      WHERE e.id > $1
        AND e.is_excluded = 0
        AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
        AND (
          e.classification = 'ESTIMATE'
          OR e.has_attachments = 1
          OR e.subject ILIKE '%Est_%'
          OR e.attachment_names ILIKE '%Est_%'
          OR e.body_preview ILIKE '%Est_%'
          OR e.subject ILIKE '%estimate%'
          OR e.body_preview ILIKE '%estimate%'
        )
      ORDER BY e.id ASC
      LIMIT $2
    `
    )
    .all(lastId, batchSize);
}

async function processBatchRows(
  rows: Array<{ id: number }>,
  dryRun: boolean,
  stats: Pick<
    PollStats,
    "processedEmails" | "linksInserted" | "projectsLinked" | "skippedNoSignal"
  >,
  lastId: number
): Promise<number> {
  let nextLastId = lastId;
  for (const row of rows) {
    stats.processedEmails++;
    nextLastId = Math.max(nextLastId, row.id);

    if (dryRun) {
      continue;
    }

    const result = await linkEmail(row.id);
    if (result.estimateLinked) {
      stats.linksInserted++;
    }
    if (result.projectLinked) {
      stats.projectsLinked++;
    }
    if (result.signals.length === 0) {
      stats.skippedNoSignal++;
    }
  }
  return nextLastId;
}

// ── Main poll loop ─────────────────────────────────────────────────────

export async function pollEstimateEmailLinker(
  opts: PollOptions = {}
): Promise<PollStats> {
  const { dryRun, batchSize, maxBatches } = resolvePollSettings(opts);
  const startFrom = await resolveStartFrom(dryRun, opts.minEmailId);

  let lastId = startFrom;
  const counters = {
    processedEmails: 0,
    linksInserted: 0,
    projectsLinked: 0,
    skippedNoSignal: 0,
  };

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await fetchCandidateEmailRows(lastId, batchSize);

    if (rows.length === 0) {
      break;
    }

    lastId = await processBatchRows(rows, dryRun, counters, lastId);

    if (!dryRun) {
      await setConfig(CONFIG_KEY_LAST_EMAIL_ID, String(lastId));
    }
  }

  // Post-processing passes: run once after all batches complete.
  const conversationLinksInserted = await runConversationBackfill(dryRun);
  const directProjectsStamped = await runDirectProjectStamp(dryRun);
  const projectIdsBackfilled = await runProjectIdBackfill(dryRun);

  return {
    processedEmails: counters.processedEmails,
    linksInserted: counters.linksInserted,
    projectsLinked: counters.projectsLinked,
    skippedNoSignal: counters.skippedNoSignal,
    lastEmailId: lastId,
    conversationLinksInserted,
    directProjectsStamped,
    projectIdsBackfilled,
  };
}
