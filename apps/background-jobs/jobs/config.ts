/**
 * Worker configuration -- all env parsing and constants.
 */

function parseBooleanFlag(
  value: string | undefined,
  fallback = false
): boolean {
  if (!value) {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min = 1
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
}

// -- Polling intervals --

export const POLL_INTERVAL_MS = parsePositiveInt(
  process.env.WORKER_POLL_INTERVAL_MS,
  250,
  50
);
export const MAX_CONCURRENT_JOBS = parsePositiveInt(
  process.env.WORKER_MAX_CONCURRENCY,
  4
);

export const FULL_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const FOLDER_WATCHER_INTERVAL_MS = 30 * 1000; // 30 seconds
export const ESTIMATE_LINKER_INTERVAL_MS = 60 * 1000; // 60 seconds
export const ATTACHMENT_BACKFILL_INTERVAL_MS = parsePositiveInt(
  process.env.ATTACHMENT_BACKFILL_INTERVAL_MS,
  30_000, // 30 seconds default (was 2min — faster for backlog)
  10_000
);
export const CONTRACT_PACKET_AUTOLINK_INTERVAL_MS = 60 * 1000; // 60 seconds
export const RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const GROUP_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
export const SWPPP_MASTER_SYNC_INTERVAL_MS = parsePositiveInt(
  process.env.SWPPP_MASTER_SYNC_INTERVAL_MS,
  60_000,
  30_000
);
export const NOTIFICATIONS_INTERVAL_MS = parsePositiveInt(
  process.env.NOTIFICATIONS_INTERVAL_MS,
  5 * 60 * 1000, // 5 minutes
  30_000
);
export const NOTIFICATIONS_MAX_EVENTS = parsePositiveInt(
  process.env.NOTIFICATIONS_MAX_EVENTS,
  100
);
export const NOTIFICATIONS_DELIVERY_MODE = (
  process.env.NOTIFICATIONS_DELIVERY_MODE ?? "log"
).trim() as "log" | "draft";
export const NOTIFICATIONS_MAILBOX = (
  process.env.NOTIFICATIONS_MAILBOX ?? "chi@desertservices.net"
).trim();
export const STALE_JOB_MINUTES = 5;

// -- Project seed lifecycle --

export const PROJECT_SEED_STALE_DAYS = parsePositiveInt(
  process.env.PROJECT_SEED_STALE_DAYS,
  45
);

// -- Attachment backfill --

export const ATTACHMENT_BACKFILL_BATCH_SIZE = parsePositiveInt(
  process.env.ATTACHMENT_BACKFILL_BATCH_SIZE,
  200
);
export const ATTACHMENT_BACKFILL_CONCURRENCY = parsePositiveInt(
  process.env.ATTACHMENT_BACKFILL_CONCURRENCY,
  15
);

// -- Email triage backfill --

export const EMAIL_TRIAGE_BACKFILL_ENABLED = parseBooleanFlag(
  process.env.EMAIL_TRIAGE_BACKFILL_ENABLED,
  true
);
export const EMAIL_TRIAGE_BACKFILL_INTERVAL_MS = parsePositiveInt(
  process.env.EMAIL_TRIAGE_BACKFILL_INTERVAL_MS,
  30_000, // 30 seconds between batches
  5000
);
export const EMAIL_TRIAGE_BACKFILL_BATCH_SIZE = parsePositiveInt(
  process.env.EMAIL_TRIAGE_BACKFILL_BATCH_SIZE,
  20
);
export const EMAIL_TRIAGE_BACKFILL_CONCURRENCY = parsePositiveInt(
  process.env.EMAIL_TRIAGE_BACKFILL_CONCURRENCY,
  3
);

// -- Estimate triage --

export const ESTIMATE_TRIAGE_ENABLED = parseBooleanFlag(
  process.env.ESTIMATE_TRIAGE_ENABLED,
  true
);
export const ESTIMATE_TRIAGE_INTERVAL_MS = parsePositiveInt(
  process.env.ESTIMATE_TRIAGE_INTERVAL_MS,
  300_000,
  30_000
);
export const ESTIMATE_TRIAGE_MAX_ROWS = parsePositiveInt(
  process.env.ESTIMATE_TRIAGE_MAX_ROWS,
  4
);
export const ESTIMATE_TRIAGE_PROVIDER = (
  process.env.ESTIMATE_TRIAGE_PROVIDER ?? "mistral"
).trim();

export const EMAIL_RESOLVER_SPARK_MODEL = (
  process.env.EMAIL_RESOLVER_SPARK_MODEL ??
  process.env.EMAIL_TRIAGE_MODEL ??
  "zai-coding-plan/glm-4.7-flash"
).trim();

// -- Permit sync --

export const PAYMENT_PERMIT_SYNC_COOLDOWN_MS = parsePositiveInt(
  process.env.PAYMENT_PERMIT_SYNC_COOLDOWN_MS,
  0,
  0
);
export const PAYMENT_PERMIT_SYNC_TIMEOUT_MS = parsePositiveInt(
  process.env.PAYMENT_PERMIT_SYNC_TIMEOUT_MS,
  180_000,
  10_000
);

// -- Estimate file sweep --

export const ESTIMATE_FILE_SWEEP_BATCH_SIZE = parsePositiveInt(
  process.env.ESTIMATE_FILE_SWEEP_BATCH_SIZE,
  150
);
export const ESTIMATE_FILE_SWEEP_CURSOR_KEY = "estimate_file_sweep_offset_v1";

// -- Contract packet autolink --

export const CONTRACT_PACKET_AUTOLINK_BATCH_SIZE = 400;

// -- Domain constants --

export const SKIP_GROUPS = new Set([
  "Shell Estimates ( Do Not Move)",
  "Sales Team Estimates",
]);

export const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);

export const FWD_RE = /^(fw|fwd|forwarded):/i;
export const POINT_AND_PAY_INVOICE_RE = /Account Number:\s*(IV\d+)/i;
