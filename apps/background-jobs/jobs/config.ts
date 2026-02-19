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

export const CONTACT_ENRICHMENT_BATCH_SIZE = parsePositiveInt(
  process.env.CONTACT_ENRICHMENT_BATCH_SIZE,
  50
);
export const MONDAY_STATUS_SYNC_ENABLED = parseBooleanFlag(
  process.env.MONDAY_STATUS_SYNC_ENABLED,
  true
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
export const BUILDINGCONNECTED_SYNC_ENABLED = parseBooleanFlag(
  process.env.BUILDINGCONNECTED_SYNC_ENABLED,
  true
);
export const BUILDINGCONNECTED_SYNC_BATCH_SIZE = parsePositiveInt(
  process.env.BUILDINGCONNECTED_SYNC_BATCH_SIZE,
  50
);

// -- Email triage backfill --

export const EMAIL_TRIAGE_BACKFILL_ENABLED = parseBooleanFlag(
  process.env.EMAIL_TRIAGE_BACKFILL_ENABLED,
  true
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
export const ESTIMATE_TRIAGE_MAX_ROWS = parsePositiveInt(
  process.env.ESTIMATE_TRIAGE_MAX_ROWS,
  4
);
export const ESTIMATE_TRIAGE_PROVIDER = (
  process.env.ESTIMATE_TRIAGE_PROVIDER ?? "glm-ocr"
).trim();

// -- Mailbox fallback sync --

export const MAILBOX_FALLBACK_SYNC_ENABLED = parseBooleanFlag(
  process.env.MAILBOX_FALLBACK_SYNC_ENABLED,
  true
);
export const MAILBOX_FALLBACK_SYNC_LOOKBACK_HOURS = parsePositiveInt(
  process.env.MAILBOX_FALLBACK_SYNC_LOOKBACK_HOURS,
  6
);
export const MAILBOX_FALLBACK_SYNC_MAX_PER_MAILBOX = parsePositiveInt(
  process.env.MAILBOX_FALLBACK_SYNC_MAX_PER_MAILBOX,
  250
);
export const MAILBOX_FALLBACK_SYNC_CONCURRENCY = parsePositiveInt(
  process.env.MAILBOX_FALLBACK_SYNC_CONCURRENCY,
  2
);

// -- Body-link backfill --

export const BODY_LINK_BACKFILL_ENABLED = parseBooleanFlag(
  process.env.BODY_LINK_BACKFILL_ENABLED,
  true
);
export const BODY_LINK_BACKFILL_LOOKBACK_DAYS = parsePositiveInt(
  process.env.BODY_LINK_BACKFILL_LOOKBACK_DAYS,
  365
);
export const BODY_LINK_BACKFILL_LIMIT = parsePositiveInt(
  process.env.BODY_LINK_BACKFILL_LIMIT,
  200
);
export const BODY_LINK_BACKFILL_MAX_LINKS = parsePositiveInt(
  process.env.BODY_LINK_BACKFILL_MAX_LINKS,
  12
);
export const BODY_LINK_BACKFILL_MAILBOX_FILTER = (
  process.env.BODY_LINK_BACKFILL_MAILBOX_FILTER ?? ""
)
  .trim()
  .toLowerCase();

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

// Scheduled full sync (company + marketing) on a recurring timer
export const PERMIT_SYNC_ENABLED = parseBooleanFlag(
  process.env.PERMIT_SYNC_ENABLED,
  true
);
// Timeout for the full sync HTTP request (longer than payment sync since it scrapes marketing too)
export const PERMIT_SYNC_TIMEOUT_MS = parsePositiveInt(
  process.env.PERMIT_SYNC_TIMEOUT_MS,
  5 * 60 * 1000, // 5 minutes
  30_000
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

// Permit detail scrape — enriches individual company permits that have no scraped data yet.
// Disabled by default until dust_permits_filed_by_desert_services gets a detail_scraped_at
// column (like marketing_permits) so sync upserts don't clear the "needs scrape" signal.
export const PERMIT_SCRAPE_ENABLED = parseBooleanFlag(
  process.env.PERMIT_SCRAPE_ENABLED,
  false
);
export const PERMIT_SCRAPE_BATCH_SIZE = parsePositiveInt(
  process.env.PERMIT_SCRAPE_BATCH_SIZE,
  5,
  1
);

// -- Estimate file sweep --

export const ESTIMATE_FILE_SWEEP_BATCH_SIZE = parsePositiveInt(
  process.env.ESTIMATE_FILE_SWEEP_BATCH_SIZE,
  150
);
export const ESTIMATE_FILE_SWEEP_CURSOR_KEY = "estimate_file_sweep_offset_v1";

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
