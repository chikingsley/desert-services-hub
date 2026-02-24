/**
 * Email Sync — Trigger.dev event-driven task
 *
 * Replaces the pgmq `email_notification` job. Triggered by Outlook webhooks
 * when a new email arrives. Pipeline:
 *
 *   1. Fetch email from Graph API
 *   2. Store in Postgres via insertEmail()
 *   3. Create attachment stubs (documents table, source='email_attachment')
 *   4. Domain enrichment (from_domain, is_internal, forward detection)
 *   5. Platform extraction (BuildingConnected, Procore, DocuSign, etc.)
 *   6. Account find-or-create by effective domain
 *   7. Contact find-or-create + link to email
 *   8. Fetch thread siblings we haven't seen
 *
 * Downstream effects are handled by Postgres cascade triggers:
 *   - trg_email_project_changed → propagates project_id to conversation siblings
 *   - trg_estimate_email_linked → cascades estimate↔email links
 *   - trg_project_estimate_linked → cascades project↔estimate links
 *
 * After storing, downstream intake tasks (attachment-intake, body-link-intake)
 * are triggered immediately. Cron schedules serve as a safety net.
 */

import { insertEmail } from "@lib/db/repositories/email";
import { getOrCreateMailbox } from "@lib/db/repositories/mailbox";
import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
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

/** Fire attachment-intake and body-link-intake to process new email immediately. */
async function triggerDownstreamIntake(): Promise<void> {
  const { attachmentIntake } = await import("./attachment-intake");
  const { bodyLinkIntake } = await import("./body-link-intake");
  await Promise.all([attachmentIntake.trigger(), bodyLinkIntake.trigger()]);
}

// ── Attachment stub creation ────────────────────────────────────

async function syncAttachmentStubs(
  mailboxEmail: string,
  messageId: string,
  emailId: number
): Promise<number> {
  const { insertAttachment } = await import("@lib/db/repositories/attachment");

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

  if (created > 0) {
    logger.info("Attachment stubs created", { emailId, count: created });
  }

  return created;
}

// ── Task ────────────────────────────────────────────────────────

export const emailSync = schemaTask({
  id: "email-sync",
  schema: z.object({
    messageId: z.string().min(1),
    mailboxEmail: z.string().min(1),
    changeType: z.string().default("created"),
  }),
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async ({ messageId, mailboxEmail }) => {
    // 1. Resolve mailbox
    const mailbox = await getOrCreateMailbox(mailboxEmail);

    // 2. Fetch email from Graph API
    const email = await graphGet<GraphEmail>(
      `users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}?$select=${EMAIL_FIELDS}`
    );

    // 3. Store in Postgres (cascade triggers fire automatically)
    const data = graphEmailToInsertData(email, mailbox.id);
    const emailId = await insertEmail(data);

    logger.info("Email synced", {
      emailId,
      subject: email.subject,
      from: email.from?.emailAddress.address,
      conversationId: email.conversationId,
    });

    // 4. Create attachment stubs (download handled by attachment-intake task)
    let attachmentStubs = 0;
    if (email.hasAttachments && emailId) {
      attachmentStubs = await syncAttachmentStubs(
        mailboxEmail,
        messageId,
        emailId
      );
    }

    // 5. Domain enrichment
    const domainData = computeDomainEnrichment(
      data.fromEmail ?? null,
      email.subject ?? null,
      data.bodyFull ?? null,
      data.bodyPreview ?? null
    );

    // 6. Platform extraction
    const platform = extractRealSender(
      domainData.fromDomain,
      data.fromName ?? null,
      data.bodyFull ?? null,
      email.subject ?? null
    );

    // 7. Account find-or-create by effective domain
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

    // 8. Persist enrichment to email row
    await updateEmailEnrichment(emailId, domainData, platform, accountId);

    // 9. Contact find-or-create + link
    const effectiveEmail =
      platform?.realSenderEmail ??
      domainData.originalSenderEmail ??
      data.fromEmail;
    const effectiveName = platform?.realSenderName ?? data.fromName ?? null;
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

    logger.info("Email enriched", {
      emailId,
      fromDomain: domainData.fromDomain,
      isInternal: domainData.isInternal,
      isForwarded: domainData.isForwarded,
      isPlatform: Boolean(platform),
      platformName: platform?.platformName ?? null,
      accountId,
      contactId,
      attachmentStubs,
    });

    // 10. Fetch thread siblings we haven't seen
    let siblingsSynced = 0;
    if (email.conversationId) {
      siblingsSynced = await syncThreadSiblings(
        mailboxEmail,
        mailbox.id,
        email.conversationId,
        messageId
      );
    }

    // 11. Trigger downstream intake immediately
    await triggerDownstreamIntake();

    return {
      emailId,
      subject: email.subject,
      conversationId: email.conversationId ?? null,
      siblingsSynced,
      attachmentStubs,
      accountId,
      contactId,
      isPlatform: Boolean(platform),
    };
  },
});

// ── Thread sibling sync ─────────────────────────────────────────

async function syncThreadSiblings(
  mailboxEmail: string,
  mailboxId: number,
  conversationId: string,
  excludeMessageId: string
): Promise<number> {
  const { db } = await import("@lib/db/client");

  const existingRows = await db
    .query<{ message_id: string }, [string]>(
      "SELECT message_id FROM emails WHERE conversation_id = $1"
    )
    .all(conversationId);

  const existingIds = new Set(existingRows.map((r) => r.message_id));

  const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const response = await graphGet<GraphListResponse>(
    `users/${encodeURIComponent(mailboxEmail)}/messages?$filter=${filter}&$select=${EMAIL_FIELDS}&$orderby=receivedDateTime asc&$top=50`
  );

  const siblings = response.value.filter(
    (msg) => msg.id !== excludeMessageId && !existingIds.has(msg.id)
  );

  if (siblings.length === 0) {
    return 0;
  }

  logger.info("Syncing thread siblings", {
    conversationId,
    total: response.value.length,
    newSiblings: siblings.length,
  });

  let synced = 0;
  for (const sibling of siblings) {
    try {
      const siblingData = graphEmailToInsertData(sibling, mailboxId);
      await insertEmail(siblingData);
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to sync sibling", {
        siblingId: sibling.id,
        error: msg,
      });
    }
  }

  logger.info("Thread siblings synced", {
    conversationId,
    synced,
    skipped: siblings.length - synced,
  });

  return synced;
}
