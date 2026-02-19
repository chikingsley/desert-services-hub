/**
 * Estimate Email Linker Maintenance Passes
 *
 * Runs post-processing queries on the entire database to catch links
 * that might have been missed or arrived out of order:
 *
 * 1) Conversation backfill: emails in a conversation where exactly one estimate
 *    is already linked get the same estimate_emails row inserted.
 * 2) Project ID backfill: emails.project_id is set from the estimate→project_estimates
 *    chain when a conversation has exactly one distinct project.
 * 3) Direct project stamp: if an email is linked to exactly one estimate, and
 *    that estimate is linked to exactly one project, the email is stamped with that project.
 */

import { db } from "@lib/db/client";

// ── Post-pass: conversation backfill ──────────────────────────────────

export async function runConversationBackfill(dryRun = false): Promise<number> {
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
           EXCEPT
           SELECT estimate_id, email_id FROM estimate_emails
         ) missing_links`
      )
      .get();
    return Number.parseInt(row?.cnt ?? "0", 10);
  }

  const row = await db
    .query<{ rows_inserted: number }>(
      `WITH missing_links AS (
         SELECT DISTINCT ee.estimate_id, e2.id AS email_id
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
         EXCEPT
         SELECT estimate_id, email_id FROM estimate_emails
       ),
       inserted AS (
         INSERT INTO estimate_emails (estimate_id, email_id)
         SELECT estimate_id, email_id
         FROM missing_links
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       SELECT COUNT(*)::int AS rows_inserted FROM inserted`
    )
    .get();

  return row?.rows_inserted ?? 0;
}

// ── Post-pass: direct project stamp ───────────────────────────────────

export async function runDirectProjectStamp(dryRun = false): Promise<number> {
  if (dryRun) {
    const row = await db
      .query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM emails e
         JOIN estimate_emails ee ON ee.email_id = e.id
         JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
         WHERE e.project_id IS NULL
           AND e.is_excluded = 0
           AND e.id IN (
             SELECT email_id
             FROM estimate_emails
             GROUP BY email_id
             HAVING COUNT(*) = 1
           )
           AND ee.estimate_id IN (
             SELECT estimate_id
             FROM project_estimates
             GROUP BY estimate_id
             HAVING COUNT(*) = 1
           )`
      )
      .get();
    return Number.parseInt(row?.cnt ?? "0", 10);
  }

  const row = await db
    .query<{ rows_updated: number }>(
      `WITH to_update AS (
         SELECT e.id, pe.project_id
         FROM emails e
         JOIN estimate_emails ee ON ee.email_id = e.id
         JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
         WHERE e.project_id IS NULL
           AND e.is_excluded = 0
           AND e.id IN (
             SELECT email_id
             FROM estimate_emails
             GROUP BY email_id
             HAVING COUNT(*) = 1
           )
           AND ee.estimate_id IN (
             SELECT estimate_id
             FROM project_estimates
             GROUP BY estimate_id
             HAVING COUNT(*) = 1
           )
       ),
       updated AS (
         UPDATE emails
         SET project_id = tu.project_id,
             updated_at = NOW()
         FROM to_update tu
         WHERE emails.id = tu.id AND emails.project_id IS NULL
         RETURNING 1
       )
       SELECT COUNT(*)::int AS rows_updated FROM updated`
    )
    .get();

  return row?.rows_updated ?? 0;
}

// ── Post-pass: project id backfill ────────────────────────────────────

export async function runProjectIdBackfill(dryRun = false): Promise<number> {
  if (dryRun) {
    const row = await db
      .query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM emails e
         JOIN emails anchor
           ON anchor.conversation_id = e.conversation_id
          AND anchor.conversation_id IS NOT NULL
          AND anchor.project_id IS NOT NULL
         WHERE e.project_id IS NULL
           AND e.is_excluded = 0
           AND e.conversation_id IN (
             SELECT conversation_id
             FROM emails
             WHERE conversation_id IS NOT NULL
               AND project_id IS NOT NULL
             GROUP BY conversation_id
             HAVING COUNT(DISTINCT project_id) = 1
           )`
      )
      .get();
    return Number.parseInt(row?.cnt ?? "0", 10);
  }

  const row = await db
    .query<{ rows_updated: number }>(
      `WITH to_update AS (
         SELECT DISTINCT e.id AS email_id, anchor.project_id
         FROM emails e
         JOIN emails anchor
           ON anchor.conversation_id = e.conversation_id
          AND anchor.conversation_id IS NOT NULL
          AND anchor.project_id IS NOT NULL
         WHERE e.project_id IS NULL
           AND e.is_excluded = 0
           AND e.conversation_id IN (
             SELECT conversation_id
             FROM emails
             WHERE conversation_id IS NOT NULL
               AND project_id IS NOT NULL
             GROUP BY conversation_id
             HAVING COUNT(DISTINCT project_id) = 1
           )
       ),
       updated AS (
         UPDATE emails
         SET project_id = tu.project_id,
             updated_at = NOW()
         FROM to_update tu
         WHERE emails.id = tu.email_id AND emails.project_id IS NULL
         RETURNING 1
       )
       SELECT COUNT(*)::int AS rows_updated FROM updated`
    )
    .get();

  return row?.rows_updated ?? 0;
}

export async function runEstimateLinkerMaintenance(dryRun = false) {
  const conversationLinksInserted = await runConversationBackfill(dryRun);
  const directProjectsStamped = await runDirectProjectStamp(dryRun);
  const projectIdsBackfilled = await runProjectIdBackfill(dryRun);

  return {
    conversationLinksInserted,
    directProjectsStamped,
    projectIdsBackfilled,
  };
}
