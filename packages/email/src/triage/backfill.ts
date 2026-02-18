/**
 * Email Triage Backfill — persistent batch processor
 *
 * Called on a timer from worker.ts. Fetches oldest unclassified emails and
 * runs them through the triage pipeline in bounded concurrent workers.
 */

import { db } from "@lib/db/hub";
import { triageEmail } from "./triage";
import type {
  TriageBackfillOptions,
  TriageBackfillResult,
  UnclassifiedRow,
} from "./types";

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
          {
            provider,
            internalDomains: options.internalDomains,
            enqueueJob: options.enqueueJob,
          }
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
