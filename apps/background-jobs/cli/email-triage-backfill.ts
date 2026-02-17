#!/usr/bin/env bun

/**
 * Email Triage Backfill
 *
 * Classifies unclassified emails by running them through the triage pipeline.
 * Persists classifications, links projects/estimates, and dispatches actions.
 *
 * Uses cursor-based pagination so it can be stopped and resumed.
 *
 * Usage:
 *   bun apps/background-jobs/cli/email-triage-backfill.ts [options]
 *
 * Options:
 *   --batch N         Emails per batch (default: 50)
 *   --concurrency N   Parallel LLM calls (default: 3)
 *   --limit N         Total emails to process, 0 = unlimited (default: 0)
 *   --since-days N    Only emails from last N days, 0 = all (default: 0)
 *   --delay-ms N      Delay between batches in ms (default: 1000)
 *   --dry-run         Print what would be classified, don't persist
 *   --help            Show usage
 */

import { triageEmail } from "@background-jobs/lib/email-triage/triage";
import { db } from "@lib/db/hub";

interface BackfillRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string;
  message_id: string | null;
  has_attachments: number;
  body_preview: string | null;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseArgs(argv: string[]) {
  let batch = 50;
  let concurrency = 3;
  let limit = 0;
  let sinceDays = 0;
  let delayMs = 1000;
  let dryRun = false;

  const remaining = [...argv];
  while (remaining.length > 0) {
    const arg = remaining.shift();
    switch (arg) {
      case "--batch":
        batch = parsePositiveInt(remaining.shift(), batch);
        break;
      case "--concurrency":
        concurrency = parsePositiveInt(remaining.shift(), concurrency);
        break;
      case "--limit":
        limit = parsePositiveInt(remaining.shift(), limit);
        break;
      case "--since-days":
        sinceDays = parsePositiveInt(remaining.shift(), sinceDays);
        break;
      case "--delay-ms":
        delayMs = parsePositiveInt(remaining.shift(), delayMs);
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
        console.log(
          "Usage: bun apps/background-jobs/cli/email-triage-backfill.ts " +
            "[--batch N] [--concurrency N] [--limit N] [--since-days N] [--delay-ms N] [--dry-run]"
        );
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return { batch, concurrency, limit, sinceDays, delayMs, dryRun };
}

async function fetchBatch(
  afterId: number,
  batchSize: number,
  sinceDate: string | null
): Promise<BackfillRow[]> {
  const sinceClause = sinceDate ? "AND e.received_at >= $3" : "";
  const query = `SELECT e.id, e.subject, e.from_email, m.email as mailbox_email,
            e.message_id, e.has_attachments, e.body_preview
     FROM emails e
     JOIN mailboxes m ON e.mailbox_id = m.id
     WHERE e.classification IS NULL
       AND e.is_excluded = 0
       AND e.id > $1
       ${sinceClause}
     ORDER BY e.id ASC
     LIMIT $2`;

  const params: unknown[] = [afterId, batchSize];
  if (sinceDate) {
    params.push(sinceDate);
  }

  return await db.query<BackfillRow>(query).all(...params);
}

async function processOne(
  row: BackfillRow,
  dryRun: boolean
): Promise<{ ok: boolean; category: string | null }> {
  if (dryRun) {
    console.log(
      `  [dry-run] would triage email=${row.id} "${(row.subject ?? "").slice(0, 50)}"`
    );
    return { ok: true, category: null };
  }

  const outcome = await triageEmail(row.id, {
    emailId: row.id,
    messageId: row.message_id ?? "",
    mailboxEmail: row.mailbox_email,
    subject: row.subject ?? null,
    fromEmail: row.from_email ?? null,
    bodyText: row.body_preview ?? null,
    hasAttachments: Boolean(row.has_attachments),
  });

  if (outcome.error) {
    return { ok: false, category: null };
  }

  return { ok: true, category: outcome.result?.category ?? null };
}

async function runBatchConcurrent(
  rows: BackfillRow[],
  concurrency: number,
  dryRun: boolean
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  let idx = 0;

  const worker = async () => {
    while (idx < rows.length) {
      const row = rows[idx++];
      if (!row) {
        break;
      }
      try {
        const result = await processOne(row, dryRun);
        if (result.ok) {
          processed++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, rows.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { processed, errors };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeSinceDate(sinceDays: number): string | null {
  return sinceDays > 0
    ? new Date(Date.now() - sinceDays * 86_400_000).toISOString()
    : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceDate = computeSinceDate(args.sinceDays);

  console.log("\n  Email Triage Backfill");
  console.log(
    `  batch=${args.batch} concurrency=${args.concurrency} limit=${args.limit || "unlimited"} delay=${args.delayMs}ms`
  );
  if (sinceDate) {
    console.log(`  since: ${sinceDate}`);
  }
  if (args.dryRun) {
    console.log("  MODE: dry-run (no writes)");
  }
  console.log("");

  let afterId = 0;
  let totalProcessed = 0;
  let totalErrors = 0;
  let batchNum = 0;

  while (true) {
    const remaining = args.limit > 0 ? args.limit - totalProcessed : args.batch;
    if (remaining <= 0) {
      break;
    }

    const batchSize = Math.min(args.batch, remaining);
    const rows = await fetchBatch(afterId, batchSize, sinceDate);

    if (rows.length === 0) {
      console.log("  No more unclassified emails. Done.");
      break;
    }

    batchNum++;
    const firstId = rows[0]?.id;
    const lastId = rows.at(-1)?.id;
    console.log(
      `  batch #${batchNum}: ${rows.length} emails (id ${firstId}..${lastId})`
    );

    const { processed, errors } = await runBatchConcurrent(
      rows,
      args.concurrency,
      args.dryRun
    );
    totalProcessed += processed;
    totalErrors += errors;
    afterId = lastId ?? afterId;

    console.log(
      `  batch #${batchNum} done: ${processed} ok, ${errors} errors | total: ${totalProcessed} processed, ${totalErrors} errors`
    );

    if (rows.length < batchSize) {
      console.log("  Reached end of unclassified emails.");
      break;
    }

    if (args.limit > 0 && totalProcessed >= args.limit) {
      console.log(`  Reached limit of ${args.limit}.`);
      break;
    }

    if (args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  console.log(
    `\n  Backfill complete: ${totalProcessed} processed, ${totalErrors} errors\n`
  );
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
