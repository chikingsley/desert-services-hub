/**
 * Mailbox Sync — Trigger.dev scheduled task
 *
 * Pulls recent emails from Microsoft Graph API across all mailboxes.
 * Replaces the pgmq `mailbox_fallback_sync` job. This is the primary
 * way emails enter the system — the webhook (email-sync) handles
 * real-time notifications, while this task catches anything missed.
 *
 * Pipeline per email:
 *   1. Fetch from Graph API with receivedDateTime filter
 *   2. Skip if already in Postgres (by message_id)
 *   3. Insert via insertEmail()
 *   4. Create attachment stubs
 *   5. Domain enrichment + platform extraction
 *   6. Account/contact find-or-create
 *
 * Downstream: attachment-intake and body-link-intake pick up from here.
 */

import { db } from "@lib/db/client";
import { insertAttachment } from "@lib/db/repositories/attachment";
import { insertEmail } from "@lib/db/repositories/email";
import {
  getAllMailboxes,
  updateMailboxSyncState,
} from "@lib/db/repositories/mailbox";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import {
  computeDomainEnrichment,
  extractRealSender,
  findOrCreateAccount,
  findOrCreateContact,
  linkContactToEmail,
  updateEmailEnrichment,
} from "./email-enrichment";
import { graphGet } from "./graph";
import {
  EMAIL_FIELDS,
  type GraphAttachment,
  type GraphEmail,
  type GraphListResponse,
  graphEmailToInsertData,
} from "./graph-email";

const LOOKBACK_HOURS = 6;
const MAX_EMAILS_PER_MAILBOX = 200;
const PAGE_SIZE = 50;

// ── Helpers ─────────────────────────────────────────────────────

function buildSinceFilter(hoursAgo: number): string {
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return since.toISOString();
}

async function getExistingMessageIds(
  mailboxId: number,
  sinceIso: string
): Promise<Set<string>> {
  const rows = await db
    .query<{ message_id: string }, [number, string]>(
      `SELECT message_id FROM emails
       WHERE mailbox_id = $1 AND received_at >= $2`
    )
    .all(mailboxId, sinceIso);
  return new Set(rows.map((r) => r.message_id));
}

/** Fetch email pages from Graph API, following @odata.nextLink pagination. */
async function fetchRecentEmails(
  mailboxEmail: string,
  sinceIso: string,
  maxEmails: number
): Promise<GraphEmail[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const userPath = encodeURIComponent(mailboxEmail);
  let url = `users/${userPath}/messages?$filter=${filter}&$select=${EMAIL_FIELDS}&$orderby=receivedDateTime desc&$top=${PAGE_SIZE}`;

  const emails: GraphEmail[] = [];

  while (url && emails.length < maxEmails) {
    const response = await graphGet<GraphListResponse>(url);
    for (const email of response.value) {
      emails.push(email);
      if (emails.length >= maxEmails) {
        break;
      }
    }
    url = response["@odata.nextLink"] ?? "";
    // nextLink is a full URL — graphGet handles both full URLs and relative paths
  }

  return emails;
}

/** Create attachment stubs for a single email. */
async function syncAttachmentStubs(
  mailboxEmail: string,
  messageId: string,
  emailId: number
): Promise<number> {
  const userPath = encodeURIComponent(mailboxEmail);
  const msgPath = encodeURIComponent(messageId);
  const response = await graphGet<{ value: GraphAttachment[] }>(
    `users/${userPath}/messages/${msgPath}/attachments?$select=id,name,contentType,size,isInline`
  );

  let created = 0;
  for (const att of response.value) {
    if (att.isInline) {
      continue;
    }
    await insertAttachment({
      emailId,
      attachmentId: att.id,
      name: att.name,
      contentType: att.contentType,
      size: att.size,
    });
    created++;
  }
  return created;
}

/** Run enrichment pipeline on a single email (same as email-sync). */
async function enrichEmail(
  emailId: number,
  fromEmail: string | null,
  fromName: string | null,
  subject: string | null,
  bodyFull: string | null,
  bodyPreview: string | null
): Promise<{ accountId: number | null; contactId: number | null }> {
  const domainData = computeDomainEnrichment(
    fromEmail,
    subject,
    bodyFull,
    bodyPreview
  );

  const platform = extractRealSender(
    domainData.fromDomain,
    fromName,
    bodyFull,
    subject
  );

  const effectiveDomain =
    platform?.realSenderDomain ??
    domainData.originalSenderDomain ??
    domainData.fromDomain;

  let accountId: number | null = null;
  if (effectiveDomain) {
    accountId = await findOrCreateAccount(
      effectiveDomain,
      platform?.realSenderCompany
    );
  }

  await updateEmailEnrichment(emailId, domainData, platform, accountId);

  const effectiveEmail =
    platform?.realSenderEmail ?? domainData.originalSenderEmail ?? fromEmail;
  const effectiveName = platform?.realSenderName ?? fromName;

  let contactId: number | null = null;
  if (effectiveEmail) {
    contactId = await findOrCreateContact(
      effectiveEmail,
      effectiveName,
      accountId
    );
    if (contactId && emailId) {
      await linkContactToEmail(contactId, emailId, "from");
    }
  }

  return { accountId, contactId };
}

// ── Per-email processing ────────────────────────────────────────

type EmailOutcome = "stored" | "skipped" | "duplicate";

interface EmailProcessResult {
  attachments: number;
  enriched: boolean;
  outcome: EmailOutcome;
}

/** Insert one email + stubs + enrichment. Extracted to reduce nesting in syncOneMailbox. */
async function processOneEmail(
  email: GraphEmail,
  mailboxEmail: string,
  mailboxId: number
): Promise<EmailProcessResult> {
  const data = graphEmailToInsertData(email, mailboxId);
  const emailId = await insertEmail(data);

  if (!emailId) {
    return { attachments: 0, enriched: false, outcome: "skipped" };
  }

  let attachments = 0;
  if (email.hasAttachments) {
    try {
      attachments = await syncAttachmentStubs(mailboxEmail, email.id, emailId);
    } catch (attErr) {
      logger.warn("Attachment stub sync failed", {
        emailId,
        error: attErr instanceof Error ? attErr.message : String(attErr),
      });
    }
  }

  let enriched = false;
  try {
    await enrichEmail(
      emailId,
      data.fromEmail ?? null,
      data.fromName ?? null,
      data.subject ?? null,
      data.bodyFull ?? null,
      data.bodyPreview ?? null
    );
    enriched = true;
  } catch (enrichErr) {
    logger.warn("Email enrichment failed", {
      emailId,
      error: enrichErr instanceof Error ? enrichErr.message : String(enrichErr),
    });
  }

  return { attachments, enriched, outcome: "stored" };
}

// ── Per-mailbox sync ────────────────────────────────────────────

interface MailboxSyncResult {
  attachments: number;
  email: string;
  enriched: number;
  error: string | null;
  fetched: number;
  skipped: number;
  stored: number;
}

async function syncOneMailbox(
  mailboxEmail: string,
  mailboxId: number,
  sinceIso: string
): Promise<MailboxSyncResult> {
  const result: MailboxSyncResult = {
    attachments: 0,
    email: mailboxEmail,
    enriched: 0,
    error: null,
    fetched: 0,
    skipped: 0,
    stored: 0,
  };

  try {
    const emails = await fetchRecentEmails(
      mailboxEmail,
      sinceIso,
      MAX_EMAILS_PER_MAILBOX
    );
    result.fetched = emails.length;

    if (emails.length === 0) {
      return result;
    }

    const existing = await getExistingMessageIds(mailboxId, sinceIso);

    for (const email of emails) {
      if (existing.has(email.id)) {
        result.skipped++;
        continue;
      }

      try {
        const r = await processOneEmail(email, mailboxEmail, mailboxId);
        if (r.outcome === "stored") {
          result.stored++;
          result.attachments += r.attachments;
          if (r.enriched) {
            result.enriched++;
          }
        } else {
          result.skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("duplicate key") || msg.includes("unique_violation")) {
          result.skipped++;
        } else {
          logger.warn("Email insert failed", {
            messageId: email.id,
            error: msg,
          });
        }
      }
    }

    await updateMailboxSyncState(mailboxId, result.stored);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    logger.error("Mailbox sync failed", {
      email: mailboxEmail,
      error: result.error,
    });
  }

  return result;
}

// ── Task ────────────────────────────────────────────────────────

export const mailboxSync = schedules.task({
  id: "mailbox-sync",
  cron: "*/15 * * * *",
  maxDuration: 600,
  run: async () => {
    const mailboxes = await getAllMailboxes();
    if (mailboxes.length === 0) {
      logger.warn("No mailboxes found");
      return { mailboxes: 0, totalStored: 0, totalAttachments: 0, errors: 0 };
    }

    const sinceIso = buildSinceFilter(LOOKBACK_HOURS);

    logger.info("Starting mailbox sync", {
      mailboxes: mailboxes.length,
      since: sinceIso,
    });

    const results: MailboxSyncResult[] = [];

    for (const mailbox of mailboxes) {
      const result = await syncOneMailbox(mailbox.email, mailbox.id, sinceIso);
      results.push(result);

      if (result.stored > 0) {
        logger.info("Mailbox synced", {
          email: mailbox.email,
          fetched: result.fetched,
          stored: result.stored,
          skipped: result.skipped,
          attachments: result.attachments,
          enriched: result.enriched,
        });
      }
    }

    const totalStored = results.reduce((sum, r) => sum + r.stored, 0);
    const totalAttachments = results.reduce((sum, r) => sum + r.attachments, 0);
    const totalEnriched = results.reduce((sum, r) => sum + r.enriched, 0);
    const errors = results.filter((r) => r.error !== null).length;

    logger.info("Mailbox sync complete", {
      mailboxes: mailboxes.length,
      totalStored,
      totalAttachments,
      totalEnriched,
      errors,
    });

    return {
      mailboxes: mailboxes.length,
      totalStored,
      totalAttachments,
      totalEnriched,
      errors,
    };
  },
});
