/**
 * Retriage emails — re-run the triage pipeline on selected emails.
 *
 * Clears existing classification so the full pipeline runs fresh,
 * then calls triageEmail() with the same path as webhook + backfill.
 *
 * Usage:
 *   bun packages/email/cli/retriage.ts --unclassified --limit 50
 *   bun packages/email/cli/retriage.ts --since 2026-01-01
 *   bun packages/email/cli/retriage.ts --email-id 12345
 *   bun packages/email/cli/retriage.ts --mailbox contracts@desertservices.net
 *   bun packages/email/cli/retriage.ts --classification INTERNAL --limit 100
 *   bun packages/email/cli/retriage.ts --project-id 42
 *   bun packages/email/cli/retriage.ts --dry-run --unclassified --limit 10
 */

import { db } from "@lib/db/client";
import { triageEmail } from "@lib/triage/triage";
import type { TriageEmailMeta } from "@lib/triage/types";

interface TriageRow {
  id: number;
  message_id: string | null;
  subject: string | null;
  from_email: string | null;
  body_preview: string | null;
  has_attachments: number;
  mailbox_email: string;
  classification: string | null;
}

interface RetriageResult {
  total: number;
  triaged: number;
  errors: number;
  skipped: number;
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

function buildQuery(args: string[]): { sql: string; params: unknown[] } {
  const conditions: string[] = ["e.is_excluded = 0"];
  const params: unknown[] = [];
  let paramIdx = 1;

  const emailId = getArgValue(args, "email-id");
  if (emailId) {
    conditions.push(`e.id = $${paramIdx++}`);
    params.push(Number(emailId));
  }

  const since = getArgValue(args, "since");
  if (since) {
    conditions.push(`e.received_at >= $${paramIdx++}`);
    params.push(since);
  }

  const mailbox = getArgValue(args, "mailbox");
  if (mailbox) {
    conditions.push(`lower(m.email) = lower($${paramIdx++})`);
    params.push(mailbox);
  }

  const classification = getArgValue(args, "classification");
  if (classification) {
    conditions.push(`e.classification = $${paramIdx++}`);
    params.push(classification.toUpperCase());
  }

  const projectId = getArgValue(args, "project-id");
  if (projectId) {
    conditions.push(`e.project_id = $${paramIdx++}`);
    params.push(Number(projectId));
  }

  if (args.includes("--unclassified")) {
    conditions.push("e.classification IS NULL");
  }

  if (args.includes("--no-project")) {
    conditions.push("e.project_id IS NULL");
  }

  const limitStr = getArgValue(args, "limit");
  const limit = limitStr ? Math.max(1, Number(limitStr)) : 50;

  const sql = `
    SELECT
      e.id, e.message_id, e.subject, e.from_email,
      e.body_preview, e.has_attachments,
      m.email as mailbox_email,
      e.classification
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.id ASC
    LIMIT $${paramIdx}
  `;
  params.push(limit);

  return { sql, params };
}

export async function runRetriage(args: string[] = []): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const provider = (getArgValue(args, "provider") ?? "gemini") as
    | "gemini"
    | "local";
  const concurrency = Math.max(
    1,
    Number(getArgValue(args, "concurrency") ?? "3")
  );
  const clearFirst = args.includes("--clear");

  const { sql, params } = buildQuery(args);
  const rows = await db.query<TriageRow>(sql).all(...params);

  console.log("=".repeat(60));
  console.log("RETRIAGE EMAILS");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Provider: ${provider}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Clear existing classification: ${clearFirst}`);
  console.log(`Matched: ${rows.length} emails`);

  if (rows.length === 0) {
    console.log("No emails matched filters.");
    return;
  }

  // Show a preview
  const preview = rows.slice(0, 5);
  for (const row of preview) {
    console.log(
      `  #${row.id} [${row.classification ?? "null"}] ${row.mailbox_email} — ${row.subject?.slice(0, 60) ?? "(no subject)"}`
    );
  }
  if (rows.length > 5) {
    console.log(`  ... and ${rows.length - 5} more`);
  }

  if (dryRun) {
    console.log("\nDry run — no changes made.");
    return;
  }

  // Optionally clear existing classifications so triage runs fresh
  if (clearFirst) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await db.run(
      `UPDATE emails
       SET classification = NULL,
           classification_method = NULL,
           classification_confidence = NULL,
           classified_at = NULL,
           updated_at = now()
       WHERE id IN (${placeholders})`,
      ids
    );
    console.log(`Cleared classification on ${ids.length} emails.`);
  }

  const result: RetriageResult = { total: rows.length, triaged: 0, errors: 0, skipped: 0 };
  let idx = 0;

  const worker = async () => {
    while (idx < rows.length) {
      const row = rows[idx++];
      if (!row) break;

      const meta: TriageEmailMeta = {
        emailId: row.id,
        messageId: row.message_id ?? "",
        mailboxEmail: row.mailbox_email,
        subject: row.subject ?? null,
        fromEmail: row.from_email ?? null,
        bodyText: row.body_preview ?? null,
        hasAttachments: Boolean(row.has_attachments),
      };

      try {
        const outcome = await triageEmail(row.id, meta, { provider });
        if (outcome.skipped) {
          result.skipped++;
        } else if (outcome.error) {
          result.errors++;
          console.error(`  #${row.id} error: ${outcome.error}`);
        } else {
          result.triaged++;
        }
      } catch (err) {
        result.errors++;
        console.error(
          `  #${row.id} exception: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // Progress
      const done = result.triaged + result.errors + result.skipped;
      if (done % 10 === 0 || done === rows.length) {
        console.log(
          `  Progress: ${done}/${rows.length} (triaged=${result.triaged}, skipped=${result.skipped}, errors=${result.errors})`
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => worker())
  );

  console.log("-".repeat(60));
  console.log(
    `Done: ${result.triaged} triaged, ${result.skipped} skipped, ${result.errors} errors (of ${result.total} total)`
  );
}
