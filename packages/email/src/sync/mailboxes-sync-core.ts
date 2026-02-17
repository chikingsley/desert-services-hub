/**
 * Email mailbox sync core routines.
 */

import { htmlToText } from "@email/html-to-text";
import type { GraphEmailClient } from "@email/index";
import { isSpam } from "@email/spam-filter";
import type { SyncProgress, SyncResult } from "@email/sync/config";
import { db } from "@lib/db/hub";
import {
  getOrCreateMailbox,
  insertAttachment,
  insertEmail,
  updateMailboxSyncState,
} from "@lib/db/repositories";
import type { InsertAttachmentData, InsertEmailData } from "@lib/db/types";
import { linkEmail } from "@lib/linking/link-email";

type EmailForSync = Awaited<
  ReturnType<GraphEmailClient["getAllEmailsPaginated"]>
>[number];

interface SingleEmailSyncResult {
  attachmentCount: number;
}

const enqueueEmailResolveIfNotQueued = db.prepare(`
  INSERT INTO webhook_jobs (job_type, payload)
  SELECT 'email_resolve', ?
  WHERE NOT EXISTS (
    SELECT 1
      FROM webhook_jobs
     WHERE job_type = 'email_resolve'
       AND status IN ('pending', 'processing')
       AND payload::jsonb->>'emailId' = ?
  )
`);

async function fetchMailboxEmails(
  client: GraphEmailClient,
  mailboxEmail: string,
  since: Date,
  before: Date | undefined,
  maxEmails: number,
  includeBodyInListing: boolean,
  fetchBodies: boolean
): Promise<{
  allEmails: EmailForSync[];
  nonSpamEmails: EmailForSync[];
  spamFiltered: number;
}> {
  const allEmails = await client.getAllEmailsPaginated(
    mailboxEmail,
    since,
    maxEmails,
    { before, includeBody: includeBodyInListing }
  );

  const nonSpamEmails = allEmails.filter(
    (email) => !isSpam(email.fromEmail, email.subject).isSpam
  );

  if (!includeBodyInListing && fetchBodies) {
    const emailIds = nonSpamEmails.map((email) => email.id);
    const bodies = await client.getEmailBodiesBatch(emailIds, mailboxEmail);
    for (const email of nonSpamEmails) {
      const body = bodies.get(email.id);
      if (body) {
        email.bodyContent = body;
      }
    }
  }

  return {
    allEmails,
    nonSpamEmails,
    spamFiltered: allEmails.length - nonSpamEmails.length,
  };
}

function createEmailData(
  mailboxId: number,
  email: EmailForSync,
  fullText: string,
  attachmentNames: string[]
): InsertEmailData {
  return {
    attachmentNames,
    bodyFull: fullText,
    bodyHtml: email.bodyContent ?? null,
    bodyPreview: fullText.substring(0, 500),
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
  };
}

// Conversation→project linking is now handled by linkEmail() from @lib/linking/link-email

async function getEmailAttachments(
  client: GraphEmailClient,
  mailboxEmail: string,
  messageId: string
): Promise<InsertAttachmentData[]> {
  try {
    const attachments = await client.getAttachments(messageId, mailboxEmail);
    return attachments.map((attachment) => ({
      attachmentId: attachment.id,
      contentType: attachment.contentType ?? null,
      emailId: 0,
      name: attachment.name,
      size: attachment.size ?? null,
      storageBucket: null,
      storagePath: null,
    }));
  } catch {
    return [];
  }
}

async function syncSingleEmail(
  client: GraphEmailClient,
  mailboxEmail: string,
  mailboxId: number,
  email: EmailForSync,
  fetchAttachments: boolean
): Promise<SingleEmailSyncResult> {
  const attachmentRows = fetchAttachments
    ? await getEmailAttachments(client, mailboxEmail, email.id)
    : [];
  const attachmentNames = attachmentRows.map((a) => a.name);
  const fullText = await htmlToText(email.bodyContent);
  const emailId = await insertEmail(
    createEmailData(mailboxId, email, fullText, attachmentNames)
  );

  await linkEmail(emailId);
  await enqueueEmailResolveIfNotQueued.run(
    JSON.stringify({ emailId }),
    String(emailId)
  );

  let attachmentCount = 0;
  for (const attachment of attachmentRows) {
    await insertAttachment({ ...attachment, emailId });
    attachmentCount += 1;
  }

  return { attachmentCount };
}

async function syncEmailRows(
  client: GraphEmailClient,
  mailboxEmail: string,
  mailboxId: number,
  emails: EmailForSync[],
  fetchAttachments: boolean,
  onProgress?: (progress: SyncProgress) => void
): Promise<{ storedCount: number; attachmentCount: number }> {
  let storedCount = 0;
  let attachmentCount = 0;

  for (const email of emails) {
    const result = await syncSingleEmail(
      client,
      mailboxEmail,
      mailboxId,
      email,
      fetchAttachments
    );
    storedCount += 1;
    attachmentCount += result.attachmentCount;

    if (storedCount % 100 === 0) {
      onProgress?.({
        attachmentsStored: attachmentCount,
        emailsFetched: emails.length,
        emailsStored: storedCount,
        mailbox: mailboxEmail,
        phase: "storing",
      });
    }
  }

  return { storedCount, attachmentCount };
}

export async function syncMailboxFull(
  client: GraphEmailClient,
  mailboxEmail: string,
  since: Date,
  before: Date | undefined,
  maxEmails: number,
  includeBodyInListing: boolean,
  fetchBodies: boolean,
  fetchAttachments: boolean,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const reportProgress = (progress: SyncProgress) => {
    onProgress?.(progress);
  };

  try {
    reportProgress({ mailbox: mailboxEmail, phase: "starting" });
    const mailbox = await getOrCreateMailbox(mailboxEmail);

    reportProgress({ mailbox: mailboxEmail, phase: "fetching" });
    const { allEmails, nonSpamEmails, spamFiltered } = await fetchMailboxEmails(
      client,
      mailboxEmail,
      since,
      before,
      maxEmails,
      includeBodyInListing,
      fetchBodies
    );
    reportProgress({
      emailsFetched: allEmails.length,
      mailbox: mailboxEmail,
      phase: "storing",
    });

    const { attachmentCount, storedCount } = await syncEmailRows(
      client,
      mailboxEmail,
      mailbox.id,
      nonSpamEmails,
      fetchAttachments,
      onProgress
    );

    await updateMailboxSyncState(mailbox.id, storedCount);

    if (spamFiltered > 0) {
      console.log(`   [${mailboxEmail}] Filtered ${spamFiltered} spam emails`);
    }

    reportProgress({
      attachmentsStored: attachmentCount,
      emailsFetched: allEmails.length,
      emailsStored: storedCount,
      mailbox: mailboxEmail,
      phase: "complete",
    });

    return {
      attachmentsStored: attachmentCount,
      emailsStored: storedCount,
      mailbox: mailboxEmail,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reportProgress({
      error: errorMessage,
      mailbox: mailboxEmail,
      phase: "error",
    });

    return {
      attachmentsStored: 0,
      emailsStored: 0,
      error: errorMessage,
      mailbox: mailboxEmail,
    };
  }
}
