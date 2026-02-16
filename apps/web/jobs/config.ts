/**
 * Worker configuration — all env parsing and constants.
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
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 1) {
    return 1;
  }
  return parsed;
}

// -- Polling intervals --

const parsedPollInterval = Number.parseInt(
  process.env.WORKER_POLL_INTERVAL_MS ?? "250",
  10
);
export const POLL_INTERVAL_MS = Number.isFinite(parsedPollInterval)
  ? Math.max(50, parsedPollInterval)
  : 250;

const parsedMaxConcurrency = Number.parseInt(
  process.env.WORKER_MAX_CONCURRENCY ?? "4",
  10
);
export const MAX_CONCURRENT_JOBS = Number.isFinite(parsedMaxConcurrency)
  ? Math.max(1, parsedMaxConcurrency)
  : 4;

export const FULL_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const FOLDER_WATCHER_INTERVAL_MS = 30 * 1000; // 30 seconds
export const ESTIMATE_LINKER_INTERVAL_MS = 60 * 1000; // 60 seconds
export const ATTACHMENT_BACKFILL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
export const CONTRACT_PACKET_AUTOLINK_INTERVAL_MS = 60 * 1000; // 60 seconds
export const RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const GROUP_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
export const STALE_JOB_MINUTES = 5;

// -- Project seed lifecycle --

const parsedProjectSeedStaleDays = Number.parseInt(
  process.env.PROJECT_SEED_STALE_DAYS ?? "45",
  10
);
export const PROJECT_SEED_STALE_DAYS = Number.isFinite(
  parsedProjectSeedStaleDays
)
  ? Math.max(1, parsedProjectSeedStaleDays)
  : 45;

// -- Attachment backfill --

export const ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST = parseCsvAllowlist(
  process.env.ATTACHMENT_BACKFILL_MAILBOX_ALLOWLIST
);
export const ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST =
  parseBooleanFlag(
    process.env.ATTACHMENT_BACKFILL_INCLUDE_NON_PROJECT_ALLOWLIST,
    false
  );
const parsedAttachmentBackfillBatchSize = Number.parseInt(
  process.env.ATTACHMENT_BACKFILL_BATCH_SIZE ?? "50",
  10
);
export const ATTACHMENT_BACKFILL_BATCH_SIZE = Number.isFinite(
  parsedAttachmentBackfillBatchSize
)
  ? Math.max(1, parsedAttachmentBackfillBatchSize)
  : 50;

// -- Estimate triage --

export const ESTIMATE_TRIAGE_ENABLED = !["0", "false", "no", "off"].includes(
  (process.env.ESTIMATE_TRIAGE_ENABLED ?? "1").trim().toLowerCase()
);
const parsedEstimateTriageInterval = Number.parseInt(
  process.env.ESTIMATE_TRIAGE_INTERVAL_MS ?? "300000",
  10
);
export const ESTIMATE_TRIAGE_INTERVAL_MS = Number.isFinite(
  parsedEstimateTriageInterval
)
  ? Math.max(30_000, parsedEstimateTriageInterval)
  : 300_000;
const parsedEstimateTriageMaxRows = Number.parseInt(
  process.env.ESTIMATE_TRIAGE_MAX_ROWS ?? "4",
  10
);
export const ESTIMATE_TRIAGE_MAX_ROWS = Number.isFinite(
  parsedEstimateTriageMaxRows
)
  ? Math.max(1, parsedEstimateTriageMaxRows)
  : 4;
export const ESTIMATE_TRIAGE_PROVIDER = (
  process.env.ESTIMATE_TRIAGE_PROVIDER ?? "mistral"
).trim();

// -- Permit sync --

export const PERMIT_WORKER_URL = (
  process.env.PERMIT_WORKER_URL ?? "http://permit-worker:47822"
).replace(/\/$/, "");
const parsedPaymentSyncCooldown = Number.parseInt(
  process.env.PAYMENT_PERMIT_SYNC_COOLDOWN_MS ?? "0",
  10
);
export const PAYMENT_PERMIT_SYNC_COOLDOWN_MS = Number.isFinite(
  parsedPaymentSyncCooldown
)
  ? Math.max(0, parsedPaymentSyncCooldown)
  : 0;
const parsedPaymentSyncTimeout = Number.parseInt(
  process.env.PAYMENT_PERMIT_SYNC_TIMEOUT_MS ?? "180000",
  10
);
export const PAYMENT_PERMIT_SYNC_TIMEOUT_MS = Number.isFinite(
  parsedPaymentSyncTimeout
)
  ? Math.max(10_000, parsedPaymentSyncTimeout)
  : 180_000;

// -- Estimate file sweep --

const parsedEstimateSweepBatchSize = Number.parseInt(
  process.env.ESTIMATE_FILE_SWEEP_BATCH_SIZE ?? "150",
  10
);
export const ESTIMATE_FILE_SWEEP_BATCH_SIZE = Number.isFinite(
  parsedEstimateSweepBatchSize
)
  ? Math.max(1, parsedEstimateSweepBatchSize)
  : 150;
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
