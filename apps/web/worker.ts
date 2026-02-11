/**
 * Background Job Worker
 *
 * Polls the webhook_jobs queue in Supabase Postgres and processes jobs asynchronously.
 * Runs in-process alongside the Bun HTTP server.
 *
 * Job types:
 *   sync_item              -- Fetch a single item from Monday, upsert all fields into Supabase Postgres
 *   download_files         -- Download new files from a Monday item, run PDF extraction
 *   sync_full              -- Full board sync (all ~4800 estimates from Monday -> Supabase Postgres)
 *   intake                 -- Canonical file/email intake processing path
 *   contract_intake        -- Legacy contract intake (compat only; being deprecated)
 *   dust_permit_payment    -- PointAndPay payment email → billing + submitted notifications
 *   dust_permit_issued_email -- Maricopa issued email → issued notification with PDF
 */

import type { GraphEmailClient } from "@email/client";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import {
  getEmailByMessageId,
  getOrCreateMailbox,
  insertAttachment,
  insertEmail,
  linkEmailToProject,
} from "@lib/db/repositories";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import type { InsertAttachmentData, InsertEmailData } from "@lib/db/types";
import { htmlToText } from "@lib/html-to-text";
import {
  createSharePointClientFromEnv,
  uploadLocalFileToProjectSubfolder,
} from "@lib/sharepoint/intake-upload";
import { isSpam } from "@lib/spam-filter";
import { getItemRich } from "@monday/client";
import { ESTIMATING_COLUMNS } from "@monday/types";
import { z } from "zod";
import { runEstimateExtractionTriage } from "@/apps/web/lib/estimate-extraction-triage";
import { itemHasFiles, processItemFiles } from "@/apps/web/pipeline";
import type { ContractsEmailIntakePayload } from "@/apps/workers/contract-intake/lib/files-intake";
import { processFilesIntake } from "@/apps/workers/contract-intake/lib/files-intake";
import { processContractIntake } from "@/apps/workers/contract-intake/lib/intake";
import { pollEstimateEmailLinker } from "@/apps/workers/estimate-email-linker/lib/poll";
import { syncEstimates } from "@/apps/workers/estimate-poller/lib/sync";
import { syncSharePointFolders } from "@/apps/workers/estimates-sync-worker/lib/sharepoint-sync";
import { processUnprocessedAttachments } from "@/apps/workers/files-email-intake/lib/attachment-backfill";
import {
  detectDustPermitEmailTrigger,
  handleIssuedEmail,
  handlePaymentEmail,
  type IssuedJobPayload,
  type PaymentJobPayload,
} from "@/apps/workers/notifications/lib/email-triggers";
import { pollFolderWatcher } from "@/apps/workers/outlook-folder-watcher/lib/poll";

// ============================================================================
// Config
// ============================================================================

const parsedPollInterval = Number.parseInt(
  process.env.WORKER_POLL_INTERVAL_MS ?? "250",
  10
);
const POLL_INTERVAL_MS = Number.isFinite(parsedPollInterval)
  ? Math.max(50, parsedPollInterval)
  : 250;
const parsedMaxConcurrency = Number.parseInt(
  process.env.WORKER_MAX_CONCURRENCY ?? "4",
  10
);
const MAX_CONCURRENT_JOBS = Number.isFinite(parsedMaxConcurrency)
  ? Math.max(1, parsedMaxConcurrency)
  : 4;
const FULL_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const FOLDER_WATCHER_INTERVAL_MS = 30 * 1000; // 30 seconds
const ESTIMATE_LINKER_INTERVAL_MS = 60 * 1000; // 60 seconds
const ATTACHMENT_BACKFILL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const GROUP_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const ESTIMATE_TRIAGE_ENABLED = !["0", "false", "no", "off"].includes(
  (process.env.ESTIMATE_TRIAGE_ENABLED ?? "1").trim().toLowerCase()
);
const parsedEstimateTriageInterval = Number.parseInt(
  process.env.ESTIMATE_TRIAGE_INTERVAL_MS ?? "300000",
  10
);
const ESTIMATE_TRIAGE_INTERVAL_MS = Number.isFinite(
  parsedEstimateTriageInterval
)
  ? Math.max(30_000, parsedEstimateTriageInterval)
  : 300_000;
const parsedEstimateTriageMaxRows = Number.parseInt(
  process.env.ESTIMATE_TRIAGE_MAX_ROWS ?? "4",
  10
);
const ESTIMATE_TRIAGE_MAX_ROWS = Number.isFinite(parsedEstimateTriageMaxRows)
  ? Math.max(1, parsedEstimateTriageMaxRows)
  : 4;
const ESTIMATE_TRIAGE_PROVIDER = (
  process.env.ESTIMATE_TRIAGE_PROVIDER ?? "mistral"
).trim();
const STALE_JOB_MINUTES = 5;
const PERMIT_WORKER_URL = (
  process.env.PERMIT_WORKER_URL ?? "http://permit-worker:47822"
).replace(/\/$/, "");
const parsedPaymentSyncCooldown = Number.parseInt(
  process.env.PAYMENT_PERMIT_SYNC_COOLDOWN_MS ?? "0",
  10
);
const PAYMENT_PERMIT_SYNC_COOLDOWN_MS = Number.isFinite(
  parsedPaymentSyncCooldown
)
  ? Math.max(0, parsedPaymentSyncCooldown)
  : 0;
const parsedPaymentSyncTimeout = Number.parseInt(
  process.env.PAYMENT_PERMIT_SYNC_TIMEOUT_MS ?? "180000",
  10
);
const PAYMENT_PERMIT_SYNC_TIMEOUT_MS = Number.isFinite(parsedPaymentSyncTimeout)
  ? Math.max(10_000, parsedPaymentSyncTimeout)
  : 180_000;
const parsedEstimateSweepBatchSize = Number.parseInt(
  process.env.ESTIMATE_FILE_SWEEP_BATCH_SIZE ?? "150",
  10
);
const ESTIMATE_FILE_SWEEP_BATCH_SIZE = Number.isFinite(
  parsedEstimateSweepBatchSize
)
  ? Math.max(1, parsedEstimateSweepBatchSize)
  : 150;
const ESTIMATE_FILE_SWEEP_CURSOR_KEY = "estimate_file_sweep_offset_v1";
const SKIP_GROUPS = new Set([
  "Shell Estimates ( Do Not Move)",
  "Sales Team Estimates",
]);

const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);

const FWD_RE = /^(fw|fwd|forwarded):/i;
const POINT_AND_PAY_INVOICE_RE = /Account Number:\s*(IV\d+)/i;
const NON_EMPTY_STRING_SCHEMA = z.string().trim().min(1);
const EMAIL_NOTIFICATION_PAYLOAD_SCHEMA = z.object({
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  changeType: NON_EMPTY_STRING_SCHEMA,
});
const CONTRACT_INTAKE_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  subject: NON_EMPTY_STRING_SCHEMA,
  pdfPaths: z.array(NON_EMPTY_STRING_SCHEMA),
});
type IntakeJobPayload = ContractsEmailIntakePayload & {
  emailId?: number;
  legacyContractIntake?: boolean;
};

const INTAKE_PAYLOAD_SCHEMA: z.ZodType<IntakeJobPayload> = z.object({
  originalSubject: z.string(),
  originalFrom: z.string(),
  bodyText: z.string(),
  attachmentPaths: z.array(NON_EMPTY_STRING_SCHEMA),
  forwarderEmail: z.string(),
  emailId: z.number().int().positive().optional(),
  legacyContractIntake: z.boolean().optional(),
});
const PAYMENT_PAYLOAD_SCHEMA: z.ZodType<PaymentJobPayload> = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  bodyText: z.string(),
});
const ISSUED_PAYLOAD_SCHEMA: z.ZodType<IssuedJobPayload> = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  bodyText: z.string(),
  subject: NON_EMPTY_STRING_SCHEMA,
});

// Lazy Graph client for email notification processing
let _graphClient: GraphEmailClient | null = null;
let _sharePointClient:
  | ReturnType<typeof createSharePointClientFromEnv>
  | undefined;
function getSharePointClient(): ReturnType<
  typeof createSharePointClientFromEnv
> {
  if (_sharePointClient === undefined) {
    _sharePointClient = createSharePointClientFromEnv();
  }
  return _sharePointClient;
}
let permitSyncInFlight: Promise<void> | null = null;
let lastPermitSyncCompletedAt = 0;
function getGraphClient(): GraphEmailClient {
  if (!_graphClient) {
    _graphClient = createGraphClient();
  }
  return _graphClient;
}

function extractPointAndPayInvoiceNumber(bodyText: string): string | null {
  const match = bodyText.match(POINT_AND_PAY_INVOICE_RE);
  return match?.[1] ?? null;
}

async function getPermitSyncWatermark(): Promise<number> {
  const row = await permitSyncWatermark.get();
  return Number(row?.updated_at ?? 0);
}

async function waitForPermitSyncWatermarkAdvance(
  previousWatermark: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentWatermark = await getPermitSyncWatermark();
    if (currentWatermark > previousWatermark) {
      return true;
    }
    await Bun.sleep(2000);
  }
  return false;
}

async function runPermitSyncNow(): Promise<void> {
  const startedAt = Date.now();
  const previousWatermark = await getPermitSyncWatermark();

  const fetchTimeoutMs = Math.min(60_000, PAYMENT_PERMIT_SYNC_TIMEOUT_MS);
  const controller = new AbortController();
  const fetchTimer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(`${PERMIT_WORKER_URL}/api/sync/company`, {
      method: "POST",
      signal: controller.signal,
    });

    const rawBody = await response.text().catch(() => "");
    let payload: { success?: unknown; error?: unknown } | null = null;
    try {
      const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
      payload =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as { success?: unknown; error?: unknown })
          : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const snippet = rawBody.slice(0, 200);
      throw new Error(
        `Permit company sync HTTP ${response.status}: ${snippet || "(empty)"}`
      );
    }

    if (payload && typeof payload.success === "boolean" && !payload.success) {
      const err =
        typeof payload.error === "string" && payload.error.trim().length > 0
          ? payload.error.trim()
          : "unknown error";
      throw new Error(`Permit company sync failed: ${err}`);
    }

    lastPermitSyncCompletedAt = Date.now();
    return;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(
        "[worker] Permit company sync request timed out; waiting for watermark..."
      );
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[worker] Permit company sync request failed: ${msg}`);
      throw error;
    }
  } finally {
    clearTimeout(fetchTimer);
  }

  const remainingMs = Math.max(
    0,
    PAYMENT_PERMIT_SYNC_TIMEOUT_MS - (Date.now() - startedAt)
  );
  const advanced = await waitForPermitSyncWatermarkAdvance(
    previousWatermark,
    remainingMs
  );

  if (!advanced) {
    throw new Error("Permit sync did not complete in time");
  }

  lastPermitSyncCompletedAt = Date.now();
}

async function ensurePermitSyncForPayment(options?: {
  force?: boolean;
}): Promise<void> {
  const force = options?.force ?? false;

  if (
    !force &&
    lastPermitSyncCompletedAt > 0 &&
    Date.now() - lastPermitSyncCompletedAt < PAYMENT_PERMIT_SYNC_COOLDOWN_MS
  ) {
    return;
  }

  if (!permitSyncInFlight) {
    permitSyncInFlight = runPermitSyncNow().finally(() => {
      permitSyncInFlight = null;
    });
  }

  await permitSyncInFlight;
}

// ============================================================================
// Queue Operations
// ============================================================================

interface WebhookJob {
  id: number;
  job_type: string;
  monday_item_id: string | null;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
}

const selectNextJob = db.query<WebhookJob>(`
  SELECT * FROM webhook_jobs
  WHERE status = 'pending' OR (status = 'failed' AND attempts < max_attempts)
  ORDER BY
    CASE WHEN job_type = 'email_notification' THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1
`);

const claimJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'processing', started_at = now(), attempts = attempts + 1 WHERE id = ? AND status IN ('pending', 'failed')"
);

const completeJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'completed', completed_at = now(), error = NULL WHERE id = ?"
);

const failJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'failed', error = ? WHERE id = ?"
);

const requeueStale = db.prepare(`
  UPDATE webhook_jobs SET status = 'pending', started_at = NULL
  WHERE status = 'processing' AND started_at < now() - interval '${STALE_JOB_MINUTES} minutes'
`);

const enqueueJob = db.prepare(
  "INSERT INTO webhook_jobs (job_type, monday_item_id, payload) VALUES (?, ?, ?)"
);

const enqueueDownloadFilesIfNotQueued = db.prepare(`
  INSERT INTO webhook_jobs (job_type, monday_item_id, payload)
  SELECT 'download_files', ?, '{}'
  WHERE NOT EXISTS (
    SELECT 1 FROM webhook_jobs
    WHERE job_type = 'download_files'
      AND monday_item_id = ?
      AND status IN ('pending', 'processing')
  )
`);

const enqueueFullSync = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('sync_full', '{}')"
);

const pendingFullSyncCount = db.query<{ count: number }>(
  "SELECT COUNT(*) as count FROM webhook_jobs WHERE job_type = 'sync_full' AND status IN ('pending', 'processing')"
);
const permitSyncWatermark = db.query<{ updated_at: number }>(
  "SELECT COALESCE(MAX(updated_at), 0) as updated_at FROM dust_permits_filed_by_desert_services"
);
const permitIdByInvoice = db.query<{ id: string }, [string]>(
  "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = ? LIMIT 1"
);
const getEstimatePollerConfigValue = db.query<{ value: string }>(
  "SELECT value FROM estimate_poller_config WHERE key = ?"
);
const setEstimatePollerConfigValue = db.prepare(
  "INSERT INTO estimate_poller_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
);

async function dequeue(): Promise<WebhookJob | null> {
  const job = await selectNextJob.get();
  if (!job) {
    return null;
  }

  const result = await claimJob.run(job.id);
  if (result.count === 0) {
    return null;
  }

  return { ...job, status: "processing", attempts: job.attempts + 1 };
}

function parseJobPayload<T>(job: WebhookJob, schema: z.ZodType<T>): T {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(job.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON payload for ${job.job_type} (job #${job.id}): ${message}`
    );
  }

  const parsed = schema.safeParse(rawPayload);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(
      `Invalid payload for ${job.job_type} (job #${job.id}): ${details}`
    );
  }

  return parsed.data;
}

async function enqueueEstimateFileSweep(
  mondayItemIds: string[]
): Promise<{ queued: number; batched: number; total: number }> {
  const ids = [...new Set(mondayItemIds)];
  if (ids.length === 0) {
    return { queued: 0, batched: 0, total: 0 };
  }

  const batchSize = Math.min(ESTIMATE_FILE_SWEEP_BATCH_SIZE, ids.length);
  const offsetRow = await getEstimatePollerConfigValue.get(
    ESTIMATE_FILE_SWEEP_CURSOR_KEY
  );
  let offset = Number.parseInt(offsetRow?.value ?? "0", 10);
  if (!Number.isFinite(offset) || offset < 0) {
    offset = 0;
  }
  if (offset >= ids.length) {
    offset = 0;
  }

  const batch: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(ids[(offset + i) % ids.length] as string);
  }

  let queued = 0;
  for (const itemId of batch) {
    const result = await enqueueDownloadFilesIfNotQueued.run(itemId, itemId);
    if (result.count > 0) {
      queued++;
    }
  }

  const nextOffset = (offset + batchSize) % ids.length;
  await setEstimatePollerConfigValue.run(
    ESTIMATE_FILE_SWEEP_CURSOR_KEY,
    String(nextOffset)
  );

  return { queued, batched: batch.length, total: ids.length };
}

// ============================================================================
// Item Sync Logic
// ============================================================================

const PROTOCOL_RE = /^https?:\/\//;
const WWW_RE = /^www\./;

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function extractLinkedId(
  item: { columnValues: Array<{ id: string; linkedItemIds?: string[] }> },
  columnId: string
): string | null {
  const col = item.columnValues.find((cv) => cv.id === columnId);
  return col?.linkedItemIds?.[0] ?? null;
}

async function lookupAccountDomain(
  accountMondayId: string | null
): Promise<string | null> {
  if (!accountMondayId) {
    return null;
  }
  const row = await db
    .query<{ domain: string }>(
      "SELECT domain FROM accounts WHERE monday_account_id = ?"
    )
    .get(accountMondayId);
  return row?.domain ?? null;
}

const upsertEstimate = db.prepare(`
  INSERT INTO estimates (
    monday_item_id, name, estimate_number, contractor,
    group_id, group_title, monday_url,
    account_monday_id, account_domain,
    bid_status, bid_value, awarded_value, bid_source,
    awarded, due_date, location, sharepoint_url,
    synced_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
  ON CONFLICT(monday_item_id) DO UPDATE SET
    name = excluded.name,
    estimate_number = COALESCE(excluded.estimate_number, estimates.estimate_number),
    contractor = excluded.contractor,
    group_id = excluded.group_id,
    group_title = excluded.group_title,
    monday_url = excluded.monday_url,
    account_monday_id = COALESCE(excluded.account_monday_id, estimates.account_monday_id),
    account_domain = COALESCE(excluded.account_domain, estimates.account_domain),
    bid_status = excluded.bid_status,
    bid_value = excluded.bid_value,
    awarded_value = excluded.awarded_value,
    bid_source = excluded.bid_source,
    awarded = excluded.awarded,
    due_date = excluded.due_date,
    location = excluded.location,
    sharepoint_url = COALESCE(excluded.sharepoint_url, estimates.sharepoint_url),
    synced_at = now(),
    updated_at = now()
  RETURNING id
`);

async function syncItem(mondayItemId: string): Promise<void> {
  const item = await getItemRich(mondayItemId);
  if (!item) {
    console.log(`[worker] Item ${mondayItemId} not found in Monday`);
    return;
  }

  if (SKIP_GROUPS.has(item.groupTitle)) {
    return;
  }

  const cols = item.columns;
  const accountMondayId = extractLinkedId(
    item,
    ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  const accountDomain = await lookupAccountDomain(accountMondayId);

  // Parse SharePoint URL (link column returns "Label - URL" or just URL)
  let sharepointUrl = cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? null;
  if (sharepointUrl) {
    sharepointUrl = sharepointUrl
      .replace(PROTOCOL_RE, "https://")
      .replace(WWW_RE, "");
  }

  const bidValue = parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]);

  const upsertResult = (await upsertEstimate.run(
    item.id,
    item.name,
    cols[ESTIMATING_COLUMNS.ESTIMATE_ID.id] ?? null,
    cols[ESTIMATING_COLUMNS.CONTRACTOR.id] ?? null,
    item.groupId,
    item.groupTitle,
    item.url,
    accountMondayId,
    accountDomain,
    cols[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null,
    bidValue,
    parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes" ? 1 : 0,
    cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    sharepointUrl
  )) as Array<{ id: number }>;

  const estimateId = upsertResult[0]?.id;
  if (estimateId) {
    await ensureEstimateHasCurrentVersion(estimateId, {
      source: "sync",
      total: bidValue ?? 0,
    });
  }

  console.log(`[worker] Synced: ${item.name} (${item.id})`);

  // Enqueue file download if item has file columns with content
  if (itemHasFiles(item.columnValues)) {
    await enqueueJob.run("download_files", mondayItemId, "{}");
    console.log(`[worker] Enqueued download_files for ${mondayItemId}`);
  }
}

// ============================================================================
// Email Notification Processing (Outlook webhooks)
// ============================================================================

/**
 * Enrich a single email with basic domain/internal/forward fields.
 * Full enrichment (platform, account linking) runs in the periodic batch.
 */
async function enrichSingleEmail(emailId: number): Promise<void> {
  const row = await db
    .query<{ from_email: string | null; subject: string | null }>(
      "SELECT from_email, subject FROM emails WHERE id = ?"
    )
    .get(emailId);

  if (!row) {
    return;
  }

  const fromDomain = row.from_email?.includes("@")
    ? (row.from_email.split("@")[1]?.toLowerCase() ?? null)
    : null;
  const isInternal = fromDomain ? INTERNAL_DOMAINS.has(fromDomain) : false;
  const isForwarded = FWD_RE.test(row.subject ?? "");

  await db.run(
    "UPDATE emails SET from_domain = ?, is_internal = ?, is_forwarded = ? WHERE id = ?",
    [fromDomain, isInternal ? 1 : 0, isForwarded ? 1 : 0, emailId]
  );
}

/**
 * Process a single email change notification from Outlook.
 */
async function processEmailNotification(
  messageId: string,
  mailboxEmail: string,
  _changeType: string
): Promise<void> {
  const mailbox = await getOrCreateMailbox(mailboxEmail);

  // Dedup: if we already have this email (from polling), skip
  const existing = await getEmailByMessageId(messageId);
  if (existing) {
    return;
  }

  // Fetch the single message from Graph
  const client = getGraphClient();
  const email = await client.getEmail(messageId, mailboxEmail);
  if (!email) {
    console.log(`[worker] Email ${messageId} not found in ${mailboxEmail}`);
    return;
  }

  // Spam check
  if (isSpam(email.fromEmail, email.subject).isSpam) {
    return;
  }

  // Convert body and store
  const fullText = await htmlToText(email.bodyContent ?? "");

  const emailData: InsertEmailData = {
    messageId: email.id,
    internetMessageId: email.internetMessageId ?? null,
    mailboxId: mailbox.id,
    conversationId: email.conversationId ?? null,
    subject: email.subject,
    fromEmail: email.fromEmail,
    fromName: email.fromName,
    toEmails: email.toRecipients.map((r: { email: string }) => r.email),
    ccEmails: email.ccRecipients.map((r: { email: string }) => r.email),
    receivedAt: email.receivedDateTime.toISOString(),
    hasAttachments: email.hasAttachments ?? false,
    attachmentNames: [],
    bodyPreview: fullText.substring(0, 500),
    bodyFull: fullText,
    bodyHtml: email.bodyContent ?? null,
    categories: email.categories ?? [],
  };

  const emailId = await insertEmail(emailData);

  // Basic enrichment (domain, internal, forward flags)
  await enrichSingleEmail(emailId);

  // Fetch and store attachment metadata
  if (email.hasAttachments) {
    try {
      const attachments = await client.getAttachments(messageId, mailboxEmail);
      for (const att of attachments) {
        const attData: InsertAttachmentData = {
          emailId,
          attachmentId: att.id,
          name: att.name,
          contentType: att.contentType ?? null,
          size: att.size ?? null,
          storageBucket: null,
          storagePath: null,
        };
        await insertAttachment(attData);
      }
    } catch {
      // Attachment fetch failure is non-fatal
    }
  }

  // Auto-link to project via conversation thread
  if (email.conversationId) {
    const sibling = await db
      .query<{ project_id: number }>(
        `SELECT project_id FROM emails
         WHERE conversation_id = ? AND project_id IS NOT NULL AND id != ?
         LIMIT 1`
      )
      .get(email.conversationId, emailId);

    if (sibling) {
      await linkEmailToProject(emailId, sibling.project_id);
    }
  }

  console.log(`[worker] Webhook synced: "${email.subject}" in ${mailboxEmail}`);

  // Dust permit email trigger detection
  const trigger = detectDustPermitEmailTrigger(
    email.fromEmail,
    email.subject,
    fullText
  );
  if (trigger === "pointandpay_payment") {
    await enqueueJob.run(
      "dust_permit_payment",
      null,
      JSON.stringify({ emailId, messageId, mailboxEmail, bodyText: fullText })
    );
    console.log(
      `[worker] Enqueued dust_permit_payment for invoice in email #${emailId}`
    );
  } else if (trigger === "maricopa_issued") {
    await enqueueJob.run(
      "dust_permit_issued_email",
      null,
      JSON.stringify({
        emailId,
        messageId,
        mailboxEmail,
        bodyText: fullText,
        subject: email.subject,
      })
    );
    console.log(
      `[worker] Enqueued dust_permit_issued_email for email #${emailId}`
    );
  }
}

// ============================================================================
// Contract → Project Auto-Linking
// ============================================================================

/**
 * After a contract PDF is parsed, try to find the source email in the emails
 * table and inherit its project_id. Also stores email metadata on the contract.
 *
 * Matching strategy (in priority order):
 *   1. normalized_subject ILIKE match + from_email match → highest confidence
 *   2. normalized_subject ILIKE match alone → medium confidence
 *   3. conversation_id from a subject-matched email → thread-based
 */
const findEmailBySubjectAndSender = db.query<{
  id: number;
  project_id: number | null;
  conversation_id: string | null;
}>(
  `SELECT id, project_id, conversation_id FROM emails
   WHERE normalized_subject ILIKE '%' || $1 || '%'
     AND from_email = $2
   ORDER BY received_at DESC LIMIT 1`
);

const findEmailBySubject = db.query<{
  id: number;
  project_id: number | null;
  conversation_id: string | null;
}>(
  `SELECT id, project_id, conversation_id FROM emails
   WHERE normalized_subject ILIKE '%' || $1 || '%'
   ORDER BY received_at DESC LIMIT 1`
);

const findProjectByConversation = db.query<{ project_id: number }>(
  `SELECT project_id FROM emails
   WHERE conversation_id = $1 AND project_id IS NOT NULL
   LIMIT 1`
);

const updateDocumentLink = db.prepare(
  `UPDATE documents SET
     email_id = COALESCE($2, email_id),
     project_id = COALESCE($3, project_id),
     original_from = $4,
     original_subject = $5,
     forwarder_email = $6
   WHERE id = $1`
);

const getDocumentUploadMeta = db.query<{
  project_id: number | null;
  file_path: string | null;
  file_name: string | null;
  document_type: string | null;
}>(
  "SELECT project_id, file_path, file_name, document_type FROM documents WHERE id = ?"
);

function docTypeToSharePointSubfolder(documentType: string | null): string {
  const t = (documentType ?? "").toLowerCase();
  if (t.includes("noi")) {
    return "NOI";
  }
  if (t.includes("plan")) {
    return "Plans";
  }
  if (t.includes("estimate")) {
    return "Estimates";
  }
  return "Contracts";
}

async function autoLinkDocument(
  documentId: number,
  originalSubject: string,
  originalFrom: string,
  forwarderEmail: string
): Promise<void> {
  // Strip FW:/RE: prefixes for matching
  const normalized = originalSubject
    .replace(/^(?:fw|fwd|re|forwarded):\s*/gi, "")
    .trim();

  if (!normalized) {
    // Still store metadata even if we can't match
    await updateDocumentLink.run(
      documentId,
      null,
      null,
      originalFrom || null,
      originalSubject || null,
      forwarderEmail || null
    );
    return;
  }

  let emailId: number | null = null;
  let projectId: number | null = null;

  // Strategy 1: subject + sender match
  if (originalFrom) {
    const match = await findEmailBySubjectAndSender.get(
      normalized,
      originalFrom
    );
    if (match) {
      emailId = match.id;
      projectId = match.project_id;
      // If no project_id on this email, try conversation thread
      if (!projectId && match.conversation_id) {
        const convMatch = await findProjectByConversation.get(
          match.conversation_id
        );
        if (convMatch) {
          projectId = convMatch.project_id;
        }
      }
    }
  }

  // Strategy 2: subject match only
  if (!emailId) {
    const match = await findEmailBySubject.get(normalized);
    if (match) {
      emailId = match.id;
      projectId = match.project_id;
      if (!projectId && match.conversation_id) {
        const convMatch = await findProjectByConversation.get(
          match.conversation_id
        );
        if (convMatch) {
          projectId = convMatch.project_id;
        }
      }
    }
  }

  await updateDocumentLink.run(
    documentId,
    emailId,
    projectId,
    originalFrom || null,
    originalSubject || null,
    forwarderEmail || null
  );

  if (projectId) {
    console.log(
      `[doc-link] Document #${documentId} → project #${projectId} (via email #${emailId})`
    );
  } else if (emailId) {
    console.log(
      `[doc-link] Document #${documentId} → email #${emailId} (no project yet)`
    );
  } else {
    console.log(
      `[doc-link] Document #${documentId}: no matching email found for "${normalized}"`
    );
  }
}

type FilesIntakeResult = Awaited<ReturnType<typeof processFilesIntake>>[number];

function startIntakePostProcessing(
  results: FilesIntakeResult[],
  filesPayload: ContractsEmailIntakePayload
): void {
  (async () => {
    let linkedCount = 0;
    for (const r of results) {
      if (!(r.documentId && filesPayload.originalSubject)) {
        continue;
      }

      try {
        await autoLinkDocument(
          r.documentId,
          filesPayload.originalSubject,
          filesPayload.originalFrom,
          filesPayload.forwarderEmail
        );
        linkedCount++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[doc-link] Failed for document #${r.documentId}: ${msg}`);
      }

      // Best-effort SharePoint upload once the document has a project_id.
      try {
        const sp = getSharePointClient();
        if (!sp) {
          continue;
        }

        const row = await getDocumentUploadMeta.get(r.documentId);
        if (!(row?.project_id && row.file_path && row.file_name)) {
          continue;
        }

        const subfolder = docTypeToSharePointSubfolder(
          row.document_type ?? null
        );

        const uploaded = await uploadLocalFileToProjectSubfolder(sp, {
          projectId: row.project_id,
          subfolder,
          localPath: row.file_path,
          originalFileName: row.file_name,
          stableSuffix: String(r.documentId),
        });

        if (uploaded) {
          console.log(
            `[doc-sharepoint] Document #${r.documentId} uploaded to ${uploaded.folderUrl}`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[doc-sharepoint] Upload failed for document #${r.documentId}: ${msg}`
        );
      }
    }

    if (linkedCount > 0) {
      console.log(
        `[doc-link] Intake post-processing linked ${linkedCount} document(s)`
      );
    }
  })().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Intake post-processing crashed: ${msg}`);
  });
}

// ============================================================================
// Job Processing
// ============================================================================

let activeJobs = 0;

async function processNextJob(): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return;
  }

  activeJobs += 1;
  let job: WebhookJob | null = null;
  try {
    job = await dequeue();
    if (!job) {
      return;
    }

    console.log(
      `[worker] Processing job #${job.id}: ${job.job_type} (attempt ${job.attempts})`
    );

    switch (job.job_type) {
      case "sync_item": {
        if (job.monday_item_id) {
          await syncItem(job.monday_item_id);
        }
        break;
      }

      case "download_files": {
        if (job.monday_item_id) {
          const count = await processItemFiles(job.monday_item_id);
          if (count > 0) {
            console.log(
              `[worker] Downloaded ${count} file(s) for ${job.monday_item_id}`
            );
          }
        }
        break;
      }

      case "sync_full": {
        let syncResult: Awaited<ReturnType<typeof syncEstimates>> | null = null;

        // Step 1: Monday → Postgres
        try {
          syncResult = await syncEstimates();
          console.log(
            `[worker] Full sync: ${syncResult.fetched} fetched, ${syncResult.upserted} upserted, ${syncResult.changes.length} changes`
          );
          for (const change of syncResult.changes) {
            console.log(
              `[worker]   ${change.name}: ${change.oldStatus ?? "(none)"} -> ${change.newStatus ?? "(none)"}`
            );
          }
        } catch (err) {
          console.error("[worker] Estimate sync failed:", err);
        }

        // Step 2: enqueue estimate file coverage sweep (rotating batch)
        if (syncResult) {
          try {
            const sweep = await enqueueEstimateFileSweep(
              syncResult.estimateFileItemIds
            );
            if (sweep.total > 0) {
              console.log(
                `[worker] Estimate extraction sweep: queued ${sweep.queued}/${sweep.batched} items (total with estimate files: ${sweep.total})`
              );
            }
          } catch (err) {
            console.error("[worker] Estimate extraction sweep failed:", err);
          }
        }

        // Step 3: Monday → SharePoint (folders, files)
        try {
          const spResult = await syncSharePointFolders();
          console.log(
            `[worker] SharePoint sync: ${spResult.processed} processed, ${spResult.created} created, ${spResult.moved} moved, ${spResult.filesUploaded} files uploaded, ${spResult.errors.length} errors`
          );
        } catch (err) {
          console.error("[worker] SharePoint sync failed:", err);
        }
        break;
      }

      case "email_notification": {
        const { messageId, mailboxEmail, changeType } = parseJobPayload(
          job,
          EMAIL_NOTIFICATION_PAYLOAD_SCHEMA
        );
        await processEmailNotification(messageId, mailboxEmail, changeType);
        break;
      }

      case "contract_intake": {
        console.warn(
          "[worker] Deprecated job_type `contract_intake` encountered; process and migrate enqueue sources to `intake`."
        );
        const { emailId, subject, pdfPaths } = parseJobPayload(
          job,
          CONTRACT_INTAKE_PAYLOAD_SCHEMA
        );
        await processContractIntake(emailId, subject, pdfPaths);
        break;
      }

      case "files_intake":
      case "contracts_email_intake":
      case "dust_permit_intake":
      case "intake": {
        if (job.job_type !== "intake") {
          console.warn(
            `[worker] Deprecated intake alias job_type \`${job.job_type}\` encountered; canonical type is \`intake\`.`
          );
        }

        const filesPayload = parseJobPayload(job, INTAKE_PAYLOAD_SCHEMA);

        if (filesPayload.legacyContractIntake && filesPayload.emailId) {
          await processContractIntake(
            filesPayload.emailId,
            filesPayload.originalSubject,
            filesPayload.attachmentPaths
          );
          break;
        }

        const results = await processFilesIntake(filesPayload);
        startIntakePostProcessing(results, filesPayload);
        break;
      }

      case "dust_permit_payment": {
        const paymentPayload = parseJobPayload(job, PAYMENT_PAYLOAD_SCHEMA);

        const invoiceNumber = extractPointAndPayInvoiceNumber(
          paymentPayload.bodyText
        );

        if (invoiceNumber) {
          const preSyncPermit = await permitIdByInvoice.get(invoiceNumber);

          // Best-effort pre-sync (keeps portal-export state fresh for invoice/permit mapping).
          try {
            // If we *don't* have the mapping yet, force a sync even if a cooldown is set.
            await ensurePermitSyncForPayment({ force: !preSyncPermit });
          } catch (error) {
            if (!preSyncPermit) {
              throw error;
            }
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(
              `[worker] Permit company sync failed (non-fatal; mapping already present): ${msg}`
            );
          }

          const postSyncPermit = await permitIdByInvoice.get(invoiceNumber);
          if (!postSyncPermit) {
            throw new Error(
              `No permit found for invoice ${invoiceNumber} after permit sync`
            );
          }
        }

        await handlePaymentEmail(paymentPayload);

        // Best-effort post-sync: capture any portal-side changes (e.g. invoice balance)
        // without risking duplicate notification drafts on retry.
        if (invoiceNumber) {
          try {
            await ensurePermitSyncForPayment();
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[worker] Post-payment permit sync failed: ${msg}`);
          }
        }
        break;
      }

      case "dust_permit_issued_email": {
        const issuedPayload = parseJobPayload(job, ISSUED_PAYLOAD_SCHEMA);
        await handleIssuedEmail(issuedPayload);
        break;
      }

      default:
        console.log(`[worker] Unknown job type: ${job.job_type}`);
    }

    await completeJob.run(job.id);
    console.log(`[worker] Completed job #${job.id}: ${job.job_type}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (job) {
      console.error(
        `[worker] Job #${job.id} failed (attempt ${job.attempts}/${job.max_attempts}): ${msg}`
      );
      await failJob.run(msg.slice(0, 1000), job.id);
    } else {
      console.error(`[worker] Job processing error: ${msg}`);
    }
  } finally {
    activeJobs -= 1;
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

let pollTimer: ReturnType<typeof setInterval> | null = null;
let fullSyncTimer: ReturnType<typeof setInterval> | null = null;
let folderWatcherTimer: ReturnType<typeof setInterval> | null = null;
let estimateLinkerTimer: ReturnType<typeof setInterval> | null = null;
let estimateTriageTimer: ReturnType<typeof setInterval> | null = null;
let attachmentBackfillTimer: ReturnType<typeof setInterval> | null = null;
let renewalTimer: ReturnType<typeof setInterval> | null = null;
let groupSyncTimer: ReturnType<typeof setInterval> | null = null;

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting background job processor");
  console.log(
    `[worker] Poll interval: ${POLL_INTERVAL_MS}ms, max concurrency: ${MAX_CONCURRENT_JOBS}, Full sync: ${FULL_SYNC_INTERVAL_MS / 60_000}min, Folder watcher: ${FOLDER_WATCHER_INTERVAL_MS / 1000}s, Estimate linker backfill: ${ESTIMATE_LINKER_INTERVAL_MS / 1000}s, Estimate triage: ${ESTIMATE_TRIAGE_ENABLED ? `${ESTIMATE_TRIAGE_INTERVAL_MS / 1000}s (${ESTIMATE_TRIAGE_MAX_ROWS}/run via ${ESTIMATE_TRIAGE_PROVIDER || "mistral"})` : "disabled"}, Attachment backfill: ${ATTACHMENT_BACKFILL_INTERVAL_MS / 60_000}min`
  );

  // Recover stale jobs from previous crashes
  try {
    const requeued = await requeueStale.run();
    if (requeued.count > 0) {
      console.log(`[worker] Requeued ${requeued.count} stale job(s)`);
    }
  } catch (err) {
    console.error("[worker] requeueStale failed:", err);
  }

  // Queue initial full sync if none pending
  try {
    const pending = await pendingFullSyncCount.get();
    if (Number(pending?.count ?? 0) === 0) {
      await enqueueFullSync.run();
      console.log("[worker] Queued initial full sync");
    }
  } catch (err) {
    console.error("[worker] enqueueFullSync failed:", err);
  }

  // Poll for jobs
  pollTimer = setInterval(() => {
    const availableSlots = Math.max(0, MAX_CONCURRENT_JOBS - activeJobs);
    for (let i = 0; i < availableSlots; i++) {
      processNextJob().catch((err) =>
        console.error("[worker] Poll error:", err)
      );
    }
  }, POLL_INTERVAL_MS);

  // Kick off initial workers immediately so we don't wait for first timer tick.
  for (let i = 0; i < MAX_CONCURRENT_JOBS; i++) {
    processNextJob().catch((err) => console.error("[worker] Poll error:", err));
  }

  // Periodic full sync
  fullSyncTimer = setInterval(async () => {
    const count = await pendingFullSyncCount.get();
    if (Number(count?.count ?? 0) === 0) {
      await enqueueFullSync.run();
      console.log("[worker] Queued periodic full sync");
    }
  }, FULL_SYNC_INTERVAL_MS);

  // Outlook folder watcher — polls Graph deltas for folder/message changes (every 30s)
  let folderWatcherRunning = false;
  folderWatcherTimer = setInterval(async () => {
    if (folderWatcherRunning) {
      return; // skip if previous poll still in-flight
    }
    folderWatcherRunning = true;
    try {
      await pollFolderWatcher();
    } catch (err) {
      console.error("[worker] Folder watcher error:", err);
    } finally {
      folderWatcherRunning = false;
    }
  }, FOLDER_WATCHER_INTERVAL_MS);
  // Run first poll immediately
  pollFolderWatcher().catch((err) =>
    console.error("[worker] Folder watcher initial poll error:", err)
  );

  // Estimate linker backfill — continuously populate estimate_emails for unlinked emails (every 60s)
  let estimateLinkerRunning = false;
  estimateLinkerTimer = setInterval(async () => {
    if (estimateLinkerRunning) {
      return;
    }
    estimateLinkerRunning = true;
    try {
      const stats = await pollEstimateEmailLinker({
        enableProjectSingle: false,
      });
      if (
        stats.processedEmails > 0 ||
        stats.linksInserted > 0 ||
        stats.skippedAmbiguous > 0
      ) {
        console.log(
          `[worker] Estimate linker: ${stats.linksInserted} linked, ${stats.processedEmails} processed, ${stats.skippedAmbiguous} ambiguous, ${stats.skippedNoSignal} no-signal`
        );
      }
    } catch (err) {
      console.error("[worker] Estimate linker error:", err);
    } finally {
      estimateLinkerRunning = false;
    }
  }, ESTIMATE_LINKER_INTERVAL_MS);
  pollEstimateEmailLinker({ enableProjectSingle: false }).catch((err) =>
    console.error("[worker] Estimate linker initial poll error:", err)
  );

  // Estimate extraction triage — classify failed rows and retry estimate-like docs.
  if (ESTIMATE_TRIAGE_ENABLED) {
    let estimateTriageRunning = false;
    const runTriage = async () => {
      if (estimateTriageRunning) {
        return;
      }
      estimateTriageRunning = true;
      try {
        const result = await runEstimateExtractionTriage({
          provider: ESTIMATE_TRIAGE_PROVIDER || "mistral",
          maxRows: ESTIMATE_TRIAGE_MAX_ROWS,
          includeNullNonPdf: true,
          onlyUntaggedFailed: true,
          log: (line) => console.log(`[worker] ${line}`),
        });

        if (result.candidateRows > 0) {
          console.log(
            `[worker] Estimate extraction triage summary: candidates=${result.candidateRows}, fixed=${result.fixedByRetry}, non_estimate=${result.markedNonEstimate}, non_pdf=${result.markedNonPdf}, unknown=${result.markedUnknown}, retry_failed=${result.retryStillFailed}, no_asset=${result.skippedNoAsset}`
          );
        }
      } catch (err) {
        console.error("[worker] Estimate extraction triage error:", err);
      } finally {
        estimateTriageRunning = false;
      }
    };

    estimateTriageTimer = setInterval(runTriage, ESTIMATE_TRIAGE_INTERVAL_MS);
    runTriage().catch((err) =>
      console.error(
        "[worker] Estimate extraction triage initial run error:",
        err
      )
    );
  }

  // Attachment backfill — process unprocessed email attachments (every 2 min)
  let backfillRunning = false;
  attachmentBackfillTimer = setInterval(async () => {
    if (backfillRunning) {
      return;
    }
    backfillRunning = true;
    try {
      const result = await processUnprocessedAttachments();
      if (result.processed > 0 || result.skipped > 0) {
        console.log(
          `[worker] Attachment backfill: ${result.succeeded} ok, ${result.failed} failed, ${result.skipped} skipped`
        );
      }
    } catch (err) {
      console.error("[worker] Attachment backfill error:", err);
    } finally {
      backfillRunning = false;
    }
  }, ATTACHMENT_BACKFILL_INTERVAL_MS);

  // Renew expiring Outlook subscriptions (every hour)
  renewalTimer = setInterval(async () => {
    try {
      const { renewExpiring } = await import("@email/subscriptions");
      const result = await renewExpiring(24);
      if (result.renewed > 0 || result.failed > 0) {
        console.log(
          `[worker] Subscription renewal: ${result.renewed} renewed, ${result.failed} failed`
        );
      }
    } catch (err) {
      console.error("[worker] Subscription renewal error:", err);
    }
  }, RENEWAL_INTERVAL_MS);

  // Periodic M365 group sync (internalcontracts@ etc) — every 15 min
  // Graph doesn't support app-only webhooks for group conversations, so we poll.
  groupSyncTimer = setInterval(async () => {
    try {
      const { syncAllGroups } = await import("@email/sync/groups");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
      const results = await syncAllGroups({ since });
      for (const r of results) {
        if (r.postsStored > 0) {
          console.log(
            `[worker] Group sync ${r.group}: ${r.postsStored} new posts`
          );
        }
      }
    } catch (err) {
      console.error("[worker] Group sync error:", err);
    }
  }, GROUP_SYNC_INTERVAL_MS);
}

export function stopWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (fullSyncTimer) {
    clearInterval(fullSyncTimer);
    fullSyncTimer = null;
  }
  if (folderWatcherTimer) {
    clearInterval(folderWatcherTimer);
    folderWatcherTimer = null;
  }
  if (estimateLinkerTimer) {
    clearInterval(estimateLinkerTimer);
    estimateLinkerTimer = null;
  }
  if (estimateTriageTimer) {
    clearInterval(estimateTriageTimer);
    estimateTriageTimer = null;
  }
  if (attachmentBackfillTimer) {
    clearInterval(attachmentBackfillTimer);
    attachmentBackfillTimer = null;
  }
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }
  if (groupSyncTimer) {
    clearInterval(groupSyncTimer);
    groupSyncTimer = null;
  }
  console.log("[worker] Stopped");
}
