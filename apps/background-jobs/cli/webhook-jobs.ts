#!/usr/bin/env bun

/**
 * Webhook Jobs CLI
 *
 * Helper for inspecting and reprocessing rows in the `webhook_jobs` table.
 *
 * Usage:
 *   bun apps/background-jobs/cli/webhook-jobs.ts list --limit 20
 *   bun apps/background-jobs/cli/webhook-jobs.ts list --type dust_permit_payment
 *   bun apps/background-jobs/cli/webhook-jobs.ts show 123
 *   bun apps/background-jobs/cli/webhook-jobs.ts requeue 123 [--force] [--keep-attempts]
 *   bun apps/background-jobs/cli/webhook-jobs.ts clone 123
 *   bun apps/background-jobs/cli/webhook-jobs.ts latest dust_permit_payment
 *
 * Notes:
 * - Re-running completed jobs can create duplicate notification drafts.
 * - If DATABASE_URL is unset, we default to the local Supabase Postgres port.
 */

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type JobStatus = "pending" | "processing" | "failed" | "completed";

interface WebhookJobRow {
  id: number;
  job_type: string;
  monday_item_id: string | null;
  payload: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function usage(exitCode = 1): never {
  console.log("Webhook Jobs CLI");
  console.log("");
  console.log(
    "Usage: bun apps/background-jobs/cli/webhook-jobs.ts <command> [args] [--flags]"
  );
  console.log("");
  console.log("Commands:");
  console.log("  list [--type <job_type>] [--status <status>] [--limit <n>]");
  console.log("  show <job_id>");
  console.log("  latest <job_type>");
  console.log(
    "  clone <job_id>              # insert a new job with same payload"
  );
  console.log("  requeue <job_id> [--force] [--keep-attempts]");
  console.log("");
  console.log("Examples:");
  console.log(
    "  bun apps/background-jobs/cli/webhook-jobs.ts list --type dust_permit_payment --limit 10"
  );
  console.log("  bun apps/background-jobs/cli/webhook-jobs.ts show 1234");
  console.log("  bun apps/background-jobs/cli/webhook-jobs.ts clone 1234");
  console.log(
    "  bun apps/background-jobs/cli/webhook-jobs.ts requeue 1234 --force"
  );
  process.exit(exitCode);
}

function parseIntStrict(value: string, label: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return n;
}

function flagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return null;
  }
  return args[idx + 1] ?? null;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function safeJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

function summarize(job: WebhookJobRow): string {
  const parsed = safeJson(job.payload);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "";
  }

  const obj = parsed as Record<string, unknown>;

  // Common fields we care about when debugging.
  const parts: string[] = [];
  let emailId: number | string | null = null;
  if (typeof obj.emailId === "number" || typeof obj.emailId === "string") {
    emailId = obj.emailId;
  }
  const mailboxEmail =
    typeof obj.mailboxEmail === "string" ? obj.mailboxEmail : null;
  const messageId = typeof obj.messageId === "string" ? obj.messageId : null;

  if (emailId != null) {
    parts.push(`emailId=${emailId}`);
  }
  if (mailboxEmail) {
    parts.push(`mailbox=${mailboxEmail}`);
  }
  if (messageId) {
    parts.push(`msg=${messageId.slice(0, 10)}…`);
  }

  return parts.join(" ");
}

function fmtTime(ts: string | null): string {
  if (!ts) {
    return "-";
  }
  // Render as "YYYY-MM-DD HH:MM:SS" in local time for quick scanning.
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) {
    return ts;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function printJobTable(rows: WebhookJobRow[]): void {
  const header = [
    padRight("id", 7),
    padRight("type", 22),
    padRight("status", 11),
    padRight("attempts", 10),
    padRight("created", 19),
    "summary",
  ].join("  ");
  console.log(header);
  console.log("-".repeat(Math.min(120, header.length)));

  for (const r of rows) {
    const attempts = `${r.attempts}/${r.max_attempts}`;
    const line = [
      padLeft(String(r.id), 7),
      padRight(r.job_type, 22),
      padRight(r.status, 11),
      padRight(attempts, 10),
      padRight(fmtTime(r.created_at), 19),
      summarize(r),
    ].join("  ");
    console.log(line);
  }
}

const argv = process.argv.slice(2);
const command = (argv[0] ?? "list").toLowerCase();
const rest = argv.slice(1);

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
}

const { db } = await import("@lib/db/hub");

if (["-h", "--help", "help"].includes(command)) {
  usage(0);
}

if (command === "list") {
  const type = flagValue(rest, "--type");
  const status = flagValue(rest, "--status") as JobStatus | null;
  const limitRaw = flagValue(rest, "--limit");
  const limit = limitRaw ? parseIntStrict(limitRaw, "limit") : 20;

  const where: string[] = [];
  const params: unknown[] = [];

  if (type) {
    where.push("job_type = ?");
    params.push(type);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit);

  const rows = await db
    .query<WebhookJobRow>(
      `SELECT id, job_type, monday_item_id, payload, status, attempts, max_attempts, error, created_at, started_at, completed_at
       FROM webhook_jobs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(...params);

  if (rows.length === 0) {
    console.log("No jobs found.");
    process.exit(0);
  }

  printJobTable(rows);
  process.exit(0);
}

if (command === "show") {
  const idRaw = rest[0];
  if (!idRaw) {
    usage(1);
  }
  const id = parseIntStrict(idRaw, "job_id");

  const job = await db
    .query<WebhookJobRow>(
      `SELECT id, job_type, monday_item_id, payload, status, attempts, max_attempts, error, created_at, started_at, completed_at
       FROM webhook_jobs
       WHERE id = ?`
    )
    .get(id);

  if (!job) {
    console.error(`Job not found: ${id}`);
    process.exit(2);
  }

  console.log(`id:           ${job.id}`);
  console.log(`type:         ${job.job_type}`);
  console.log(`status:       ${job.status}`);
  console.log(`attempts:     ${job.attempts}/${job.max_attempts}`);
  console.log(`created_at:   ${fmtTime(job.created_at)}`);
  console.log(`started_at:   ${fmtTime(job.started_at)}`);
  console.log(`completed_at: ${fmtTime(job.completed_at)}`);
  if (job.error) {
    console.log(`error:        ${job.error}`);
  }
  if (job.monday_item_id) {
    console.log(`monday_item:  ${job.monday_item_id}`);
  }
  console.log("");

  const parsed = safeJson(job.payload);
  if (parsed) {
    console.log("payload (json):");
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    console.log("payload (raw):");
    console.log(job.payload);
  }

  process.exit(0);
}

if (command === "latest") {
  const type = rest[0];
  if (!type) {
    usage(1);
  }

  const job = await db
    .query<WebhookJobRow>(
      `SELECT id, job_type, monday_item_id, payload, status, attempts, max_attempts, error, created_at, started_at, completed_at
       FROM webhook_jobs
       WHERE job_type = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(type);

  if (!job) {
    console.error(`No job found for type: ${type}`);
    process.exit(2);
  }

  printJobTable([job]);
  process.exit(0);
}

if (command === "clone") {
  const idRaw = rest[0];
  if (!idRaw) {
    usage(1);
  }
  const id = parseIntStrict(idRaw, "job_id");

  const row = await db
    .query<{ id: number }>(
      `INSERT INTO webhook_jobs (job_type, monday_item_id, payload, max_attempts)
       SELECT job_type, monday_item_id, payload, max_attempts
       FROM webhook_jobs
       WHERE id = ?
       RETURNING id`
    )
    .get(id);

  if (!row?.id) {
    console.error(`Failed to clone job: ${id}`);
    process.exit(2);
  }

  console.log(`Cloned job #${id} → new job #${row.id}`);
  process.exit(0);
}

if (command === "requeue") {
  const idRaw = rest[0];
  if (!idRaw) {
    usage(1);
  }
  const id = parseIntStrict(idRaw, "job_id");
  const force = hasFlag(rest, "--force");
  const keepAttempts = hasFlag(rest, "--keep-attempts");

  const job = await db
    .query<Pick<WebhookJobRow, "id" | "status" | "attempts" | "max_attempts">>(
      "SELECT id, status, attempts, max_attempts FROM webhook_jobs WHERE id = ?"
    )
    .get(id);

  if (!job) {
    console.error(`Job not found: ${id}`);
    process.exit(2);
  }

  if (job.status === "completed" && !force) {
    console.error(
      `Job #${id} is completed. Requeueing will re-run side effects (drafts, sync, etc). Re-run with --force if you really want this.`
    );
    process.exit(2);
  }

  const updateSql = keepAttempts
    ? `UPDATE webhook_jobs
         SET status = 'pending',
             started_at = NULL,
             completed_at = NULL,
             error = NULL
       WHERE id = ?`
    : `UPDATE webhook_jobs
         SET status = 'pending',
             started_at = NULL,
             completed_at = NULL,
             error = NULL,
             attempts = 0
       WHERE id = ?`;

  const result = await db.prepare(updateSql).run(id);
  const count = typeof result?.count === "number" ? result.count : 0;
  if (count === 0) {
    console.error(`Failed to requeue job: ${id}`);
    process.exit(2);
  }

  console.log(
    `Requeued job #${id} (attempts ${keepAttempts ? `${job.attempts}/${job.max_attempts}` : `0/${job.max_attempts}`})`
  );
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
usage(1);
