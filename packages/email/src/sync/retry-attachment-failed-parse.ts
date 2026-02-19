/**
 * Requeue attachment extraction failures that look retryable (parse/OCR path).
 *
 * Operates on the unified `documents` table (source='email_attachment').
 *
 * Default retry signal:
 *   "insufficient data left in message"
 *
 * Usage:
 *   bun packages/email/cli/retry-attachment-failed-parse.ts
 *   bun packages/email/cli/retry-attachment-failed-parse.ts --mailbox denise@desertservices.net
 *   bun packages/email/cli/retry-attachment-failed-parse.ts --dry-run
 *   bun packages/email/cli/retry-attachment-failed-parse.ts --match "custom error text"
 */

import { db } from "@lib/db/client";

interface RetryRow {
  email: string;
  retriable: number;
}

function getArgValue(args: string[], flag: string): string | undefined {
  const eqArg = args.find((a) => a.startsWith(`--${flag}=`));
  if (eqArg) {
    return eqArg.slice(`--${flag}=`.length);
  }
  const idx = args.indexOf(`--${flag}`);
  const nextArg = args[idx + 1];
  if (idx !== -1 && nextArg && !nextArg.startsWith("--")) {
    return nextArg;
  }
  return undefined;
}

export async function runRetryAttachmentFailedParse(
  args: string[] = []
): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const mailboxArg = (getArgValue(args, "mailbox") ?? "").toLowerCase().trim();
  const matchText = (
    getArgValue(args, "match") ?? "insufficient data left in message"
  )
    .trim()
    .toLowerCase();

  const rows = await db
    .query<RetryRow, [string, string, string]>(
      `SELECT
         m.email,
         COUNT(*)::int AS retriable
       FROM documents d
       JOIN emails e ON e.id = d.email_id
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE d.source = 'email_attachment'
         AND d.extraction_status = 'failed'
         AND lower(COALESCE(d.extraction_error, '')) LIKE '%' || $1 || '%'
         AND ($2 = '' OR lower(m.email) = ANY(string_to_array($3, ',')))
       GROUP BY m.email
       ORDER BY m.email`
    )
    .all(matchText, mailboxArg, mailboxArg);

  const totalRetriable = rows.reduce((sum, row) => sum + row.retriable, 0);

  console.log("=".repeat(60));
  console.log("REQUEUE ATTACHMENT FAILED-PARSE");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Mailbox filter: ${mailboxArg || "none"}`);
  console.log(`Match text: ${matchText}`);
  console.log(`Retriable rows: ${totalRetriable}`);

  for (const row of rows) {
    console.log(`- ${row.email}: ${row.retriable}`);
  }

  if (dryRun || totalRetriable === 0) {
    return;
  }

  await db.run(
    `UPDATE documents d
     SET extraction_status = 'pending',
         extraction_error = NULL,
         extracted_at = NULL,
         updated_at = now()
     WHERE d.source = 'email_attachment'
       AND d.extraction_status = 'failed'
       AND d.id IN (
         SELECT d2.id
         FROM documents d2
         JOIN emails e ON e.id = d2.email_id
         JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE d2.source = 'email_attachment'
           AND d2.extraction_status = 'failed'
           AND lower(COALESCE(d2.extraction_error, '')) LIKE '%' || $1 || '%'
           AND ($2 = '' OR lower(m.email) = ANY(string_to_array($3, ',')))
       )`,
    [matchText, mailboxArg, mailboxArg]
  );

  const pendingRow = await db
    .query<{ pending: number }, [string, string]>(
      `SELECT COUNT(*)::int AS pending
       FROM documents d
       JOIN emails e ON e.id = d.email_id
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE d.source = 'email_attachment'
         AND d.extraction_status = 'pending'
         AND ($1 = '' OR lower(m.email) = ANY(string_to_array($2, ',')))`
    )
    .get(mailboxArg, mailboxArg);

  console.log("-".repeat(60));
  console.log(
    `Requeued failed-parse attachments: ${totalRetriable} (pending now: ${pendingRow?.pending ?? 0})`
  );
}
