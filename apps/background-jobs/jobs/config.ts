/**
 * Worker configuration -- all env parsing and constants.
 */

function parseCsvAllowlist(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

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

function parseProbability(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
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
export const ATTACHMENT_BACKFILL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
export const CONTRACT_PACKET_AUTOLINK_INTERVAL_MS = 60 * 1000; // 60 seconds
export const RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const GROUP_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
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

export const ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST = parseCsvAllowlist(
  process.env.ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST
);
export const ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST =
  parseBooleanFlag(
    process.env.ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST,
    false
  );
export const ATTACHMENT_BACKFILL_BATCH_SIZE = parsePositiveInt(
  process.env.ATTACHMENT_BACKFILL_BATCH_SIZE,
  50
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

// -- Permit sync --

export const PERMIT_WORKER_URL = (
  process.env.PERMIT_WORKER_URL ?? "http://permit-worker:47822"
).replace(/\/$/, "");
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

// -- Email resolver --

export const EMAIL_RESOLVER_ENABLED = parseBooleanFlag(
  process.env.EMAIL_RESOLVER_ENABLED,
  true
);
export const EMAIL_RESOLVER_SPARK_ENABLED = parseBooleanFlag(
  process.env.EMAIL_RESOLVER_SPARK_ENABLED,
  false
);
export const EMAIL_RESOLVER_SPARK_MODEL = (
  process.env.EMAIL_RESOLVER_SPARK_MODEL ?? "openai/gpt-5.3-codex-spark"
).trim();
export const EMAIL_RESOLVER_SPARK_TIMEOUT_MS = parsePositiveInt(
  process.env.EMAIL_RESOLVER_SPARK_TIMEOUT_MS,
  8000,
  250
);
export const EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS = parsePositiveInt(
  process.env.EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS,
  12_000,
  250
);
export const EMAIL_RESOLVER_SPARK_MAX_CANDIDATES = parsePositiveInt(
  process.env.EMAIL_RESOLVER_SPARK_MAX_CANDIDATES,
  5,
  2
);
export const EMAIL_RESOLVER_SPARK_CONFIDENCE_MIN = parseProbability(
  process.env.EMAIL_RESOLVER_SPARK_CONFIDENCE_MIN,
  0.8
);

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
