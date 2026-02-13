/**
 * Email notification processing — handle Outlook webhook email events.
 *
 * When Outlook sends a change notification, this module fetches the email
 * from Graph, stores it, enriches it, and detects dust permit triggers.
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
import { detectDustPermitEmailTrigger } from "@/apps/workers/notifications/lib/email-triggers";
import { FWD_RE, INTERNAL_DOMAINS } from "./config";
import { enqueueEmailResolve, enqueueJob } from "./queue";

// -- Lazy Graph client --

let _graphClient: GraphEmailClient | null = null;
function getGraphClient(): GraphEmailClient {
  if (!_graphClient) {
    _graphClient = createGraphClient();
  }
  return _graphClient;
}

// -- Functions --

/**
 * Enrich a single email with basic domain/internal/forward fields.
 * Full enrichment (platform, account linking) runs in the periodic batch.
 */
export async function enrichSingleEmail(emailId: number): Promise<void> {
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
export async function processEmailNotification(
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

  // Always enqueue deterministic resolution for project/estimate linkage.
  // Queue-level dedupe prevents duplicate in-flight jobs per email.
  await enqueueEmailResolve(emailId);

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
