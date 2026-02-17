#!/usr/bin/env bun

/**
 * Email Triage Dry-Run CLI
 *
 * Runs the unified triage system against recent emails in the database
 * WITHOUT enqueuing jobs or persisting changes. Shows what the LLM would
 * classify each email as, what project/estimate it would link to, and
 * what action would be dispatched.
 *
 * Usage:
 *   bun apps/background-jobs/cli/email-triage-dry-run.ts [options]
 *
 * Options:
 *   --limit N         Max emails to process (default: 10)
 *   --since-days N    Look back N days (default: 30)
 *   --email-id N      Triage a specific email by ID
 *   --help            Show usage
 */

import { runOpencodeJsonPrompt } from "@background-jobs/lib/email-intent/opencode";
import { gatherTriageContext } from "@background-jobs/lib/email-triage/triage-context";
import { parseTriageOutput } from "@background-jobs/lib/email-triage/triage-parse";
import { buildTriagePrompt } from "@background-jobs/lib/email-triage/triage-prompt";
import { db } from "@lib/db/hub";

interface EmailRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  received_at: string;
  classification: string | null;
  classification_method: string | null;
  project_id: number | null;
  has_attachments: boolean;
  mailbox_email: string;
}

const MODEL = (
  process.env.EMAIL_TRIAGE_MODEL ?? "zai-coding-plan/glm-4.7-flash"
).trim();
const TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.EMAIL_TRIAGE_TIMEOUT_MS ?? "15000", 10) || 15_000
);

const ACTION_JOBS: Record<string, string> = {
  "PAYMENT:payment_confirmation": "dust_permit_payment",
  "DUST_PERMIT:permit_issued": "dust_permit_issued_email",
  "CONTRACT:new_contract": "contract_email_received",
  "CONTRACT:contract_revision": "contract_email_received",
  "CHANGE_ORDER:contract_revision": "contract_email_received",
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!(Number.isFinite(parsed) && parsed >= 1)) {
    return fallback;
  }
  return parsed;
}

function parseArgs(argv: string[]) {
  let limit = 10;
  let sinceDays = 30;
  let emailId: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--limit": {
        limit = parsePositiveInt(argv[i + 1], limit);
        i++;
        break;
      }
      case "--since-days": {
        sinceDays = parsePositiveInt(argv[i + 1], sinceDays);
        i++;
        break;
      }
      case "--email-id": {
        emailId = parsePositiveInt(argv[i + 1], 0);
        i++;
        break;
      }
      case "--help": {
        console.log(
          "Usage: bun apps/background-jobs/cli/email-triage-dry-run.ts [--limit N] [--since-days N] [--email-id N] [--help]"
        );
        process.exit(0);
        break;
      }
      default:
        break;
    }
  }

  return { limit, sinceDays, emailId };
}

function fetchRecentEmails(
  limit: number,
  sinceDays: number
): Promise<EmailRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  return db
    .query<EmailRow>(
      `SELECT e.id, e.subject, e.from_email, e.received_at,
              e.classification, e.classification_method, e.project_id,
              e.has_attachments, m.email as mailbox_email
       FROM emails e
       JOIN mailboxes m ON e.mailbox_id = m.id
       WHERE e.received_at >= $1
         AND e.is_excluded = 0
       ORDER BY e.received_at DESC
       LIMIT $2`
    )
    .all(since.toISOString(), limit);
}

function fetchSingleEmail(emailId: number): Promise<EmailRow[]> {
  return db
    .query<EmailRow>(
      `SELECT e.id, e.subject, e.from_email, e.received_at,
              e.classification, e.classification_method, e.project_id,
              e.has_attachments, m.email as mailbox_email
       FROM emails e
       JOIN mailboxes m ON e.mailbox_id = m.id
       WHERE e.id = $1`
    )
    .all(emailId);
}

/** Triage a single email and print results. Returns "processed" | "error" | "skipped". */
async function triageOne(
  email: EmailRow
): Promise<"processed" | "error" | "skipped"> {
  const context = await gatherTriageContext(email.id, email.mailbox_email);
  if (!context) {
    console.log("  SKIP: could not gather context");
    return "skipped";
  }

  console.log(
    `  context: thread=${context.thread.length} docs=${context.documents.length} ` +
      `attachments=${context.attachments.length} ` +
      `projects=${context.candidates.projects.length} estimates=${context.candidates.estimates.length}`
  );

  const prompt = buildTriagePrompt(context);
  console.log(`  prompt: ${prompt.length} chars`);

  const start = Date.now();
  const raw = await runOpencodeJsonPrompt(prompt, {
    model: MODEL,
    timeoutMs: TIMEOUT_MS,
  });
  const elapsed = Date.now() - start;

  const validProjectIds = new Set(context.candidates.projects.map((p) => p.id));
  const validEstimateIds = new Set(
    context.candidates.estimates.map((e) => e.id)
  );
  const result = parseTriageOutput(raw, validProjectIds, validEstimateIds);

  if (!result) {
    console.log(`  PARSE FAILED (${elapsed}ms): ${JSON.stringify(raw)}`);
    return "error";
  }

  console.log(`  TRIAGE (${elapsed}ms):`);
  console.log(`    category:    ${result.category}`);
  console.log(`    subcategory: ${result.subcategory ?? "null"}`);
  console.log(`    project_id:  ${result.projectId ?? "null"}`);
  console.log(`    estimate_id: ${result.estimateId ?? "null"}`);
  console.log(`    confidence:  ${result.confidence}`);
  console.log(`    reason:      ${result.reason}`);

  const actionKey = `${result.category}:${result.subcategory ?? "general"}`;
  const job = ACTION_JOBS[actionKey];
  console.log(
    `    action:      ${job ? `enqueue ${job}` : "classify + link only"}`
  );

  return "processed";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("\n  Email Triage Dry-Run");
  console.log(`  Model: ${MODEL}`);
  console.log(`  Timeout: ${TIMEOUT_MS}ms`);

  const emails = args.emailId
    ? await fetchSingleEmail(args.emailId)
    : await fetchRecentEmails(args.limit, args.sinceDays);

  console.log(`  Emails to process: ${emails.length}\n`);

  if (emails.length === 0) {
    console.log("  No emails found.\n");
    return;
  }

  let processed = 0;
  let errors = 0;

  for (const email of emails) {
    const label = `[${email.id}] "${(email.subject ?? "(no subject)").slice(0, 60)}"`;
    console.log(`\n${"─".repeat(72)}`);
    console.log(`  ${label}`);
    console.log(
      `  from: ${email.from_email ?? "?"} | ${email.received_at} | attachments: ${email.has_attachments}`
    );
    console.log(
      `  current: classification=${email.classification ?? "null"} method=${email.classification_method ?? "null"} project=${email.project_id ?? "null"}`
    );

    try {
      const outcome = await triageOne(email);
      if (outcome === "processed") {
        processed++;
      }
      if (outcome === "error") {
        errors++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR: ${msg}`);
      errors++;
    }
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  Done: ${processed} processed, ${errors} errors\n`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
