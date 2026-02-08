/**
 * Background Job Worker
 *
 * Polls the webhook_jobs queue in hub.db and processes jobs asynchronously.
 * Runs in-process alongside the Bun HTTP server.
 *
 * Job types:
 *   sync_item              -- Fetch a single item from Monday, upsert all fields into hub.db
 *   download_files         -- Download new files from a Monday item, run PDF extraction
 *   sync_full              -- Full board sync (all ~4800 estimates from Monday -> hub.db)
 *   contract_intake        -- Classify + extract data from IC contract PDFs via LLM
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
import type { InsertAttachmentData, InsertEmailData } from "@lib/db/types";
import { htmlToText } from "@lib/html-to-text";
import { isSpam } from "@lib/spam-filter";
import { getItemRich } from "@monday/client";
import { ESTIMATING_COLUMNS } from "@monday/types";
import { itemHasFiles, processItemFiles } from "@/apps/web/pipeline";
import { processContractIntake } from "@/apps/workers/contract-intake/lib/intake";
import type { DustPermitIntakePayload } from "@/apps/workers/dust-permit-intake/lib/intake";
import { processDustPermitIntake } from "@/apps/workers/dust-permit-intake/lib/intake";
import { syncEstimates } from "@/apps/workers/estimate-poller/lib/sync";
import {
  detectDustPermitEmailTrigger,
  handleIssuedEmail,
  handlePaymentEmail,
  type IssuedJobPayload,
  type PaymentJobPayload,
} from "@/apps/workers/notifications/lib/email-triggers";

// ============================================================================
// Config
// ============================================================================

const POLL_INTERVAL_MS = 5000;
const FULL_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const GROUP_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const STALE_JOB_MINUTES = 5;
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

// Lazy Graph client for email notification processing
let _graphClient: GraphEmailClient | null = null;
function getGraphClient(): GraphEmailClient {
  if (!_graphClient) {
    _graphClient = createGraphClient();
  }
  return _graphClient;
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
  ORDER BY created_at ASC
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

const enqueueFullSync = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('sync_full', '{}')"
);

const pendingFullSyncCount = db.query<{ count: number }>(
  "SELECT COUNT(*) as count FROM webhook_jobs WHERE job_type = 'sync_full' AND status IN ('pending', 'processing')"
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

  await upsertEstimate.run(
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
    parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]),
    parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes" ? 1 : 0,
    cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    sharepointUrl
  );

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
// Job Processing
// ============================================================================

let processing = false;

async function processNextJob(): Promise<void> {
  if (processing) {
    return;
  }

  processing = true;
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
        const result = await syncEstimates();
        console.log(
          `[worker] Full sync: ${result.fetched} fetched, ${result.upserted} upserted, ${result.changes.length} changes`
        );
        for (const change of result.changes) {
          console.log(
            `[worker]   ${change.name}: ${change.oldStatus ?? "(none)"} -> ${change.newStatus ?? "(none)"}`
          );
        }
        break;
      }

      case "email_notification": {
        const { messageId, mailboxEmail, changeType } = JSON.parse(
          job.payload
        ) as {
          messageId: string;
          mailboxEmail: string;
          changeType: string;
        };
        await processEmailNotification(messageId, mailboxEmail, changeType);
        break;
      }

      case "contract_intake": {
        const { emailId, subject, pdfPaths } = JSON.parse(job.payload) as {
          emailId: number;
          subject: string;
          pdfPaths: string[];
        };
        await processContractIntake(emailId, subject, pdfPaths);
        break;
      }

      case "dust_permit_intake": {
        const dustPayload = JSON.parse(job.payload) as DustPermitIntakePayload;
        await processDustPermitIntake(dustPayload);
        break;
      }

      case "dust_permit_payment": {
        const paymentPayload = JSON.parse(job.payload) as PaymentJobPayload;
        await handlePaymentEmail(paymentPayload);
        break;
      }

      case "dust_permit_issued_email": {
        const issuedPayload = JSON.parse(job.payload) as IssuedJobPayload;
        await handleIssuedEmail(issuedPayload);
        break;
      }

      default:
        console.log(`[worker] Unknown job type: ${job.job_type}`);
    }

    await completeJob.run(job.id);
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
    processing = false;
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

let pollTimer: ReturnType<typeof setInterval> | null = null;
let fullSyncTimer: ReturnType<typeof setInterval> | null = null;
let renewalTimer: ReturnType<typeof setInterval> | null = null;
let groupSyncTimer: ReturnType<typeof setInterval> | null = null;

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting background job processor");
  console.log(
    `[worker] Poll interval: ${POLL_INTERVAL_MS / 1000}s, Full sync interval: ${FULL_SYNC_INTERVAL_MS / 60_000}min`
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
    processNextJob().catch((err) => console.error("[worker] Poll error:", err));
  }, POLL_INTERVAL_MS);

  // Periodic full sync
  fullSyncTimer = setInterval(async () => {
    const count = await pendingFullSyncCount.get();
    if (Number(count?.count ?? 0) === 0) {
      await enqueueFullSync.run();
      console.log("[worker] Queued periodic full sync");
    }
  }, FULL_SYNC_INTERVAL_MS);

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
