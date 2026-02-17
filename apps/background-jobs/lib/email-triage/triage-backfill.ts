/**
 * Email Triage Backfill — persistent batch processor
 *
 * Called on a timer from worker.ts. Fetches a batch of unclassified emails
 * and runs them through the triage pipeline. Cursor-based: uses the lowest
 * unclassified email ID each tick, so it's safe to stop/restart at any point.
 */

import type { LlmProvider } from "@background-jobs/lib/llm";
import { db } from "@lib/db/hub";
import { triageEmail } from "./triage";

interface UnclassifiedRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string;
  message_id: string | null;
  has_attachments: boolean;
  body_preview: string | null;
}

export interface TriageBackfillOptions {
  batchSize: number;
  concurrency: number;
  /** LLM provider — "local" for Ollama backfill, "gemini" for cloud (default: "local") */
  provider?: LlmProvider;
}

export interface TriageBackfillResult {
  fetched: number;
  processed: number;
  errors: number;
  elapsedMs: number;
}

async function fetchBatch(batchSize: number): Promise<UnclassifiedRow[]> {
  return await db
    .query<UnclassifiedRow>(
      `SELECT e.id, e.subject, e.from_email, m.email as mailbox_email,
              e.message_id, e.has_attachments, e.body_preview
       FROM emails e
       JOIN mailboxes m ON e.mailbox_id = m.id
       WHERE e.classification IS NULL
         AND e.is_excluded = 0
       ORDER BY e.id ASC
       LIMIT $1`
    )
    .all(batchSize);
}

export async function processTriageBackfillBatch(
  options: TriageBackfillOptions
): Promise<TriageBackfillResult> {
  const { batchSize, concurrency, provider = "local" } = options;
  const start = Date.now();
  const rows = await fetchBatch(batchSize);

  if (rows.length === 0) {
    return {
      fetched: 0,
      processed: 0,
      errors: 0,
      elapsedMs: Date.now() - start,
    };
  }

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
        const outcome = await triageEmail(
          row.id,
          {
            emailId: row.id,
            messageId: row.message_id ?? "",
            mailboxEmail: row.mailbox_email,
            subject: row.subject ?? null,
            fromEmail: row.from_email ?? null,
            bodyText: row.body_preview ?? null,
            hasAttachments: Boolean(row.has_attachments),
          },
          { provider }
        );
        if (outcome.error) {
          errors++;
        } else {
          processed++;
        }
      } catch {
        errors++;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => worker())
  );

  return {
    fetched: rows.length,
    processed,
    errors,
    elapsedMs: Date.now() - start,
  };
}
