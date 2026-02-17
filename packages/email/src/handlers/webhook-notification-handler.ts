/**
 * Shared email notification processing for webhook handlers.
 */

import type { GraphEmailClient } from "@email/client";
import { htmlToText } from "@email/html-to-text";
import { isSpam } from "@email/spam-filter";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import {
  getEmailByMessageId,
  getOrCreateMailbox,
  insertAttachment,
  insertEmail,
} from "@lib/db/repositories";
import type { InsertAttachmentData, InsertEmailData } from "@lib/db/types";
import { linkEmail } from "@lib/linking/link-email";

interface EmailMessageRow {
  bodyContent?: string | null;
  categories?: string[] | null;
  ccRecipients: Array<{ email: string }>;
  conversationId?: string | null;
  fromEmail: string;
  fromName: string;
  hasAttachments?: boolean;
  id: string;
  internetMessageId?: string | null;
  receivedDateTime: Date;
  subject: string;
  toRecipients: Array<{ email: string }>;
}

export type TriageAdapter = (
  emailId: number,
  meta: {
    messageId: string;
    mailboxEmail: string;
    subject: string | null;
    fromEmail: string | null;
    bodyText: string | null;
    hasAttachments: boolean;
  }
) => Promise<unknown>;

export interface EmailNotificationAdapters {
  triageAndDispatch: TriageAdapter;
  internalDomains: ReadonlySet<string>;
  forwardSubjectRegex: RegExp;
}

function getDomain(email: string | undefined | null): string | null {
  if (!email) {
    return null;
  }

  const atIndex = email.indexOf("@");
  if (atIndex === -1) {
    return null;
  }

  return email
    .slice(atIndex + 1)
    .toLowerCase()
    .trim();
}

function createEmailData(
  mailboxId: number,
  email: EmailMessageRow,
  bodyText: string
): InsertEmailData {
  return {
    attachmentNames: [],
    bodyFull: bodyText,
    bodyHtml: email.bodyContent ?? null,
    bodyPreview: bodyText.substring(0, 500),
    categories: email.categories ?? [],
    ccEmails: email.ccRecipients.map((recipient) => recipient.email),
    conversationId: email.conversationId ?? null,
    fromEmail: email.fromEmail,
    fromName: email.fromName,
    hasAttachments: email.hasAttachments ?? false,
    internetMessageId: email.internetMessageId ?? null,
    mailboxId,
    messageId: email.id,
    receivedAt: email.receivedDateTime.toISOString(),
    subject: email.subject,
    toEmails: email.toRecipients.map((recipient) => recipient.email),
  } satisfies InsertEmailData;
}

async function loadMessage(
  client: GraphEmailClient,
  messageId: string,
  mailboxEmail: string
): Promise<EmailMessageRow | null> {
  const email = await client.getEmail(messageId, mailboxEmail);
  return email as EmailMessageRow | null;
}

async function storeAttachments(
  client: GraphEmailClient,
  mailboxEmail: string,
  messageId: string,
  emailId: number
): Promise<number> {
  let inserted = 0;
  try {
    const attachments = await client.getAttachments(messageId, mailboxEmail);
    for (const attachment of attachments) {
      const attachmentData: InsertAttachmentData = {
        attachmentId: attachment.id,
        contentType: attachment.contentType ?? null,
        emailId,
        name: attachment.name,
        size: attachment.size ?? null,
        storageBucket: null,
        storagePath: null,
      };
      await insertAttachment(attachmentData);
      inserted++;
    }
  } catch {
    // Ignore transient attachment fetch failures; email row is still persisted.
  }

  return inserted;
}

// Conversation→project linking is now handled by linkEmail() from @lib/linking/link-email

export async function enrichSingleEmail(
  emailId: number,
  adapters: Pick<
    EmailNotificationAdapters,
    "internalDomains" | "forwardSubjectRegex"
  >
): Promise<void> {
  const row = await db
    .query<{ from_email: string | null; subject: string | null }>(
      "SELECT from_email, subject FROM emails WHERE id = ?"
    )
    .get(emailId);

  if (!row) {
    return;
  }

  const fromDomain = getDomain(row.from_email);
  const isInternal =
    fromDomain !== null && adapters.internalDomains.has(fromDomain);
  const isForwarded = adapters.forwardSubjectRegex.test(row.subject ?? "");

  await db.run(
    "UPDATE emails SET from_domain = ?, is_internal = ?, is_forwarded = ? WHERE id = ?",
    [fromDomain, isInternal ? 1 : 0, isForwarded ? 1 : 0, emailId]
  );
}

export async function processEmailNotification(
  messageId: string,
  mailboxEmail: string,
  _changeType: string,
  adapters: EmailNotificationAdapters
): Promise<void> {
  const mailbox = await getOrCreateMailbox(mailboxEmail);
  if (!mailbox) {
    return;
  }

  const existing = await getEmailByMessageId(messageId);
  if (existing) {
    return;
  }

  const client = createGraphClient();
  const email = await loadMessage(client, messageId, mailboxEmail);
  if (!email) {
    console.log(`[worker] Email ${messageId} not found in ${mailboxEmail}`);
    return;
  }

  if (isSpam(email.fromEmail, email.subject).isSpam) {
    return;
  }

  const bodyText = await htmlToText(email.bodyContent ?? "");
  const emailData = createEmailData(mailbox.id, email, bodyText);
  const emailId = await insertEmail(emailData);

  await enrichSingleEmail(emailId, adapters);
  await storeAttachments(client, mailboxEmail, messageId, emailId);
  await linkEmail(emailId);

  console.log(`[worker] Webhook synced: "${email.subject}" in ${mailboxEmail}`);

  await adapters.triageAndDispatch(emailId, {
    messageId,
    mailboxEmail,
    subject: email.subject,
    fromEmail: email.fromEmail,
    bodyText,
    hasAttachments: email.hasAttachments ?? false,
  });
}
