/**
 * Email Triage — Trigger.dev tasks
 *
 * Three tasks:
 *   - emailTriage:         cron every 5 min, classifies unclassified emails
 *   - emailTriageOne:      on-demand, triage a single email by ID
 *   - emailTriageBackfill: on-demand, high-throughput bulk classification
 *
 * The actual classification logic lives in @triage/ (packages/archive/email/sync/triage/).
 * These tasks are thin wrappers that provide scheduling + observability.
 *
 * Pipeline:
 *   1. Fetch unclassified emails from DB
 *   2. Gather context (thread, documents, attachments, project/estimate candidates)
 *   3. Call LLM (local Ollama or Gemini via pdf-analysis service)
 *   4. Parse + validate classification
 *   5. Persist classification + link to project/estimate
 *
 * Dispatch is DISABLED. Classification is read-only — tags emails but triggers
 * no downstream tasks. Action dispatch (Point and Pay, permit issued, contracts)
 * will be handled by deterministic sender-based rules, not LLM classification.
 */

import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 8;

// ── Scheduled backfill ─────────────────────────────────────

export const emailTriage = schedules.task({
  id: "email-triage",
  cron: "*/5 * * * *",
  maxDuration: 240,
  run: async () => {
    const { processTriageBackfillBatch } = await import("@triage/backfill");

    const result = await processTriageBackfillBatch({
      batchSize: DEFAULT_BATCH_SIZE,
      concurrency: DEFAULT_CONCURRENCY,
    });

    if (result.fetched > 0) {
      logger.info("Email triage batch complete", {
        fetched: result.fetched,
        processed: result.processed,
        errors: result.errors,
        elapsedMs: result.elapsedMs,
      });
    }

    return result;
  },
});

// ── Single email triage (on-demand) ────────────────────────

export const emailTriageOne = schemaTask({
  id: "email-triage-one",
  schema: z.object({
    emailId: z.number().int().positive(),
    mailboxEmail: z.string().min(1),
    provider: z.enum(["local", "gemini"]).optional(),
  }),
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async ({ emailId, mailboxEmail, provider }) => {
    const { db } = await import("@lib/db/client");
    const { triageEmail } = await import("@triage/triage");

    const row = await db
      .query<{
        subject: string | null;
        from_email: string | null;
        message_id: string | null;
        has_attachments: boolean;
        body_preview: string | null;
      }>(
        `SELECT subject, from_email, message_id, has_attachments, body_preview
         FROM emails WHERE id = $1`
      )
      .get(emailId);

    if (!row) {
      logger.warn("Email not found", { emailId });
      return { emailId, skipped: true, skipReason: "not_found" };
    }

    const outcome = await triageEmail(
      emailId,
      {
        emailId,
        messageId: row.message_id ?? "",
        mailboxEmail,
        subject: row.subject ?? null,
        fromEmail: row.from_email ?? null,
        bodyText: row.body_preview ?? null,
        hasAttachments: Boolean(row.has_attachments),
      },
      { provider }
    );

    logger.info("Email triaged", {
      emailId,
      category: outcome.result?.category ?? null,
      subcategory: outcome.result?.subcategory ?? null,
      confidence: outcome.result?.confidence ?? null,
      projectId: outcome.result?.projectId ?? null,
      estimateId: outcome.result?.estimateId ?? null,
      skipped: outcome.skipped,
      skipReason: outcome.skipReason ?? null,
      error: outcome.error ?? null,
      classified: outcome.dispatch?.classified ?? false,
      projectLinked: outcome.dispatch?.projectLinked ?? false,
      estimateLinked: outcome.dispatch?.estimateLinked ?? false,
      jobEnqueued: outcome.dispatch?.jobEnqueued ?? null,
    });

    return {
      emailId,
      category: outcome.result?.category ?? null,
      subcategory: outcome.result?.subcategory ?? null,
      confidence: outcome.result?.confidence ?? null,
      projectId: outcome.result?.projectId ?? null,
      estimateId: outcome.result?.estimateId ?? null,
      skipped: outcome.skipped,
      error: outcome.error ?? null,
    };
  },
});

// ── Bulk backfill (on-demand) ─────────────────────────────

export const emailTriageBackfill = schemaTask({
  id: "email-triage-backfill",
  schema: z.object({
    batchSize: z.number().min(1).max(1000).default(500),
    concurrency: z.number().min(1).max(20).default(10),
    loops: z.number().min(1).max(500).default(100),
    provider: z.enum(["local", "gemini"]).optional(),
  }),
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async ({ batchSize, concurrency, loops, provider }) => {
    const { processTriageBackfillBatch } = await import("@triage/backfill");

    let totalFetched = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    const startMs = Date.now();

    for (let i = 0; i < loops; i++) {
      const result = await processTriageBackfillBatch({
        batchSize,
        concurrency,
        provider,
      });

      totalFetched += result.fetched;
      totalProcessed += result.processed;
      totalErrors += result.errors;

      logger.info(`Backfill loop ${i + 1}/${loops}`, {
        fetched: result.fetched,
        processed: result.processed,
        errors: result.errors,
        loopMs: result.elapsedMs,
        totalProcessed,
        totalErrors,
      });

      if (result.fetched === 0) {
        logger.info("No more unclassified emails — backfill complete");
        break;
      }
    }

    const elapsedMs = Date.now() - startMs;
    const rate =
      totalProcessed > 0
        ? (totalProcessed / (elapsedMs / 1000)).toFixed(1)
        : "0";

    logger.info("Backfill finished", {
      totalFetched,
      totalProcessed,
      totalErrors,
      elapsedMs,
      ratePerSec: rate,
    });

    return {
      totalFetched,
      totalProcessed,
      totalErrors,
      elapsedMs,
      ratePerSec: rate,
    };
  },
});
