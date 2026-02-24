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

// -- Queue consumer controls --

export const POLL_INTERVAL_MS = parsePositiveInt(
  process.env.WORKER_POLL_INTERVAL_MS,
  250,
  50
);
export const MAX_CONCURRENT_JOBS = parsePositiveInt(
  process.env.WORKER_MAX_CONCURRENCY,
  4
);
export const MAX_LLM_CONCURRENT_JOBS = parsePositiveInt(
  process.env.MAX_LLM_CONCURRENT_JOBS,
  2,
  1
);

export const STALE_JOB_MINUTES = 5;

// -- Attachment backfill --

export const ATTACHMENT_BACKFILL_BATCH_SIZE = parsePositiveInt(
  process.env.ATTACHMENT_BACKFILL_BATCH_SIZE,
  200
);
export const ATTACHMENT_BACKFILL_CONCURRENCY = parsePositiveInt(
  process.env.ATTACHMENT_BACKFILL_CONCURRENCY,
  15
);

// -- Estimate triage --

export const ESTIMATE_TRIAGE_ENABLED = parseBooleanFlag(
  process.env.ESTIMATE_TRIAGE_ENABLED,
  true
);
export const ESTIMATE_TRIAGE_MAX_ROWS = parsePositiveInt(
  process.env.ESTIMATE_TRIAGE_MAX_ROWS,
  4
);
export const ESTIMATE_TRIAGE_PROVIDER = (
  process.env.ESTIMATE_TRIAGE_PROVIDER ?? "glm-ocr"
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

// -- AQData sync --

export const AQDATA_WORKER_URL = (
  process.env.AQDATA_WORKER_URL ?? "http://aqdata-worker:47823"
).trim();
export const AQDATA_SYNC_TIMEOUT_MS = parsePositiveInt(
  process.env.AQDATA_SYNC_TIMEOUT_MS,
  5 * 60 * 1000,
  10_000
);
export const AQDATA_SYNC_ENABLED = parseBooleanFlag(
  process.env.AQDATA_SYNC_ENABLED,
  true
);
export const AQDATA_DETAIL_SCRAPE_ENABLED = parseBooleanFlag(
  process.env.AQDATA_DETAIL_SCRAPE_ENABLED,
  true
);
export const AQDATA_DETAIL_SCRAPE_BATCH_SIZE = parsePositiveInt(
  process.env.AQDATA_DETAIL_SCRAPE_BATCH_SIZE,
  10,
  1
);

// -- Contract won bridge --

export const CONTRACT_WON_BRIDGE_ENABLED = parseBooleanFlag(
  process.env.CONTRACT_WON_BRIDGE_ENABLED,
  true
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
