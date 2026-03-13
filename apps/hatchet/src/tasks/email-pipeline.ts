/**
 * Email Pipeline — Hatchet tasks for email sync, mailbox sync, and backfill.
 *
 * Replaces the Trigger.dev email-sync, sync-one-mailbox, mailbox-sync, and
 * mailbox-backfill tasks.
 *
 * Architecture:
 *   emailSync         — webhook-driven: process one email + thread siblings
 *   syncOneMailbox    — child task: sync a single mailbox (used by fan-out)
 *   mailboxSyncCron   — cron every 15 min: fan out to syncOneMailbox per mailbox
 *   mailboxBackfill   — on-demand: configurable lookback, optional mailbox filter
 */

import { ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk/protoc/v1/workflows";
import type { JsonObject } from "@hatchet-dev/typescript-sdk/v1/types";
import { insertEmail } from "@email/db/email";
import { getAllMailboxes, getOrCreateMailbox } from "@email/db/mailbox";
import {
  buildSinceFilter,
  enrichEmail,
  type GraphEmail,
  graphEmailToInsertData,
  isGraphInefficientFilterError,
  isGraphItemNotFoundError,
  isGraphSkippableError,
  LOOKBACK_HOURS,
  linkRecipientContacts,
  type MailboxSyncResult,
  resolveBackfillSinceIso,
  syncOneMailbox as syncOneMailboxCore,
  syncThreadSiblings,
} from "@email/sync";
import { graphGet } from "@lib/graph/http";
import { hatchet } from "../client";

const EMAIL_FIELDS = [
  "id",
  "conversationId",
  "subject",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "bodyPreview",
  "body",
  "hasAttachments",
  "internetMessageHeaders",
  "webLink",
].join(",");

/* -------------------------------------------------------------------------- */
/*  Attachment stub sync (webhook path needs finer error handling)              */
/* -------------------------------------------------------------------------- */

interface GraphAttachment {
  contentType: string;
  id: string;
  isInline: boolean;
  name: string;
  size: number;
}

async function syncAttachmentStubs(
  mailboxEmail: string,
  messageId: string,
  emailId: number
): Promise<number> {
  const { insertAttachment } = await import("@documents-intake/db/attachment");
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

/* -------------------------------------------------------------------------- */
/*  1. email-sync — webhook-driven single email                                */
/* -------------------------------------------------------------------------- */

export const emailSync = hatchet.task({
  name: "email-sync",
  executionTimeout: "120s",
  retries: 3,
  concurrency: {
    maxRuns: 16,
    expression: "input.mailboxEmail",
    limitStrategy: ConcurrencyLimitStrategy.QUEUE_NEWEST,
  },
  fn: async (
    input: JsonObject & {
      messageId: string;
      mailboxEmail: string;
      changeType?: string;
    },
    ctx
  ) => {
    const { messageId, mailboxEmail } = input;
    const mailbox = await getOrCreateMailbox(mailboxEmail);

    try {
      let email: GraphEmail;
      try {
        email = await graphGet<GraphEmail>(
          `users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}?$select=${EMAIL_FIELDS}`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (isGraphItemNotFoundError(msg)) {
          await ctx.logger.info(
            "Email no longer exists in Graph; skipping webhook sync"
          );
          return {
            skipped: true,
            reason: "graph_item_not_found",
            mailboxEmail,
            messageId,
          };
        }
        throw error;
      }

      const data = graphEmailToInsertData(email, mailbox.id);
      const inserted = await insertEmail(data);
      const emailId = inserted.id;

      await ctx.logger.info(`Email synced: ${email.subject}`);

      if (inserted.isExcluded) {
        return {
          emailId,
          subject: email.subject,
          conversationId: email.conversationId ?? null,
          siblingsSynced: 0,
          attachmentStubs: 0,
          accountId: null,
          contactId: null,
          excluded: true,
        };
      }

      let attachmentStubs = 0;
      if (email.hasAttachments && emailId) {
        try {
          attachmentStubs = await syncAttachmentStubs(
            mailboxEmail,
            messageId,
            emailId
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (isGraphItemNotFoundError(msg)) {
            await ctx.logger.info(
              "Attachment list missing in Graph; skipping attachment stubs"
            );
          } else {
            throw error;
          }
        }
      }

      let accountId: number | null = null;
      let contactId: number | null = null;
      try {
        const enrichment = await enrichEmail(
          emailId,
          data.fromEmail ?? null,
          data.fromName ?? null,
          data.subject ?? null,
          data.bodyFull ?? null,
          data.bodyPreview ?? null
        );
        await linkRecipientContacts(
          emailId,
          email.toRecipients,
          "to",
          enrichment.accountId,
          enrichment.accountDomain
        );
        await linkRecipientContacts(
          emailId,
          email.ccRecipients,
          "cc",
          enrichment.accountId,
          enrichment.accountDomain
        );
        accountId = enrichment.accountId;
        contactId = enrichment.contactId;
      } catch (error) {
        await ctx.logger.warn("Email enrichment failed in webhook email-sync", {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }

      let siblingsSynced = 0;
      if (email.conversationId) {
        try {
          siblingsSynced = await syncThreadSiblings(
            mailboxEmail,
            mailbox.id,
            email.conversationId,
            messageId,
            email.receivedDateTime
          );
        } catch (error) {
          await ctx.logger.warn(
            "Thread sibling sync failed in webhook email-sync",
            {
              error: error instanceof Error ? error : new Error(String(error)),
            }
          );
        }
      }

      return {
        emailId,
        subject: email.subject,
        conversationId: email.conversationId ?? null,
        siblingsSynced,
        attachmentStubs,
        accountId,
        contactId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isGraphSkippableError(msg)) {
        const reason = isGraphInefficientFilterError(msg)
          ? "graph_inefficient_filter"
          : "graph_item_not_found";
        await ctx.logger.info(
          `Recoverable Graph error in email-sync: ${reason}`
        );
        return { skipped: true, reason, mailboxEmail, messageId };
      }
      throw error;
    }
  },
});

/* -------------------------------------------------------------------------- */
/*  2. sync-one-mailbox — child task for bulk sync                             */
/* -------------------------------------------------------------------------- */

export const syncOneMailboxTask = hatchet.task({
  name: "sync-one-mailbox",
  executionTimeout: "7200s",
  retries: 2,
  concurrency: {
    maxRuns: 6,
    expression: "input.email",
    limitStrategy: ConcurrencyLimitStrategy.QUEUE_NEWEST,
  },
  fn: async (
    input: JsonObject & {
      email: string;
      mailboxId: number;
      sinceIso: string;
      senderFilter?: string;
      forceReprocessExisting?: boolean;
    },
    ctx
  ) => {
    await ctx.logger.info(`Syncing mailbox: ${input.email}`);
    return syncOneMailboxCore(
      input.email,
      input.mailboxId,
      input.sinceIso,
      input.senderFilter,
      input.forceReprocessExisting ?? false
    ) as Promise<MailboxSyncResult & JsonObject>;
  },
});

/* -------------------------------------------------------------------------- */
/*  3. mailbox-sync — cron every 15 min, fans out to sync-one-mailbox          */
/* -------------------------------------------------------------------------- */

interface AggregatedResults {
  errors: number;
  mailboxCount: number;
  totalAttachments: number;
  totalEnriched: number;
  totalFetched: number;
  totalFiltered: number;
  totalStored: number;
  [key: string]: number;
}

function aggregateResults(
  results: Record<string, unknown>[]
): AggregatedResults {
  const agg: AggregatedResults = {
    errors: 0,
    mailboxCount: results.length,
    totalAttachments: 0,
    totalEnriched: 0,
    totalFetched: 0,
    totalFiltered: 0,
    totalStored: 0,
  };

  for (const r of results) {
    agg.totalStored += (r.stored as number) ?? 0;
    agg.totalFetched += (r.fetched as number) ?? 0;
    agg.totalAttachments += (r.attachments as number) ?? 0;
    agg.totalEnriched += (r.enriched as number) ?? 0;
    agg.totalFiltered += (r.filtered as number) ?? 0;
    if (r.error) {
      agg.errors++;
    }
  }

  return agg;
}

export const mailboxSyncCron = hatchet.workflow({
  name: "mailbox-sync",
  on: { cron: "*/15 * * * *" },
});

const fanOutSyncTask = mailboxSyncCron.task({
  name: "fan-out-sync",
  executionTimeout: "300s",
  fn: async (_input: JsonObject, ctx) => {
    const sinceIso = buildSinceFilter(LOOKBACK_HOURS);
    const mailboxes = await getAllMailboxes();

    if (mailboxes.length === 0) {
      await ctx.logger.warn("No mailboxes found");
      return { mailboxes: 0 };
    }

    await ctx.logger.info(
      `Starting mailbox sync: ${mailboxes.length} mailboxes`
    );

    const results = await ctx.bulkRunChildren(
      mailboxes.map((m) => ({
        workflow: "sync-one-mailbox",
        input: {
          email: m.email,
          mailboxId: m.id,
          sinceIso,
        } satisfies JsonObject,
      }))
    );

    const agg = aggregateResults(results);

    if (agg.totalStored > 0) {
      await ctx.logger.info(
        `New emails stored: ${agg.totalStored} (${agg.totalAttachments} attachments)`
      );
    }

    await ctx.logger.info("Mailbox sync complete", { extra: agg });
    return agg;
  },
});

/* -------------------------------------------------------------------------- */
/*  4. mailbox-backfill — on-demand, configurable lookback                     */
/* -------------------------------------------------------------------------- */

const EMPTY_RESULTS: AggregatedResults = {
  errors: 0,
  mailboxCount: 0,
  totalAttachments: 0,
  totalEnriched: 0,
  totalFetched: 0,
  totalFiltered: 0,
  totalStored: 0,
};

export const mailboxBackfill = hatchet.task({
  name: "mailbox-backfill",
  executionTimeout: "7200s",
  retries: 1,
  fn: async (
    input: JsonObject & {
      lookbackHours?: number;
      sinceIso?: string;
      mailboxEmails?: string[];
      senderFilter?: string;
      forceReprocessExisting?: boolean;
    },
    ctx
  ): Promise<AggregatedResults> => {
    const sinceIso = resolveBackfillSinceIso(
      input.lookbackHours,
      input.sinceIso
    );
    const mailboxes = await getAllMailboxes();

    if (mailboxes.length === 0) {
      await ctx.logger.warn("No mailboxes found");
      return EMPTY_RESULTS;
    }

    const normalizedEmails = input.mailboxEmails
      ? [...new Set(input.mailboxEmails.map((e) => e.toLowerCase()))]
      : [];
    const filteredMailboxes = normalizedEmails.length
      ? mailboxes.filter((m) =>
          normalizedEmails.includes(m.email.toLowerCase())
        )
      : mailboxes;

    if (normalizedEmails.length > 0 && filteredMailboxes.length === 0) {
      await ctx.logger.warn("No matching mailboxes found for backfill");
      return EMPTY_RESULTS;
    }

    await ctx.logger.info(
      `Starting mailbox backfill: ${filteredMailboxes.length} mailboxes since ${sinceIso}`
    );

    const results = await ctx.bulkRunChildren(
      filteredMailboxes.map((m) => ({
        workflow: "sync-one-mailbox",
        input: {
          email: m.email,
          mailboxId: m.id,
          sinceIso,
          ...(input.senderFilter ? { senderFilter: input.senderFilter } : {}),
          ...(input.forceReprocessExisting
            ? { forceReprocessExisting: input.forceReprocessExisting }
            : {}),
        } satisfies JsonObject,
      }))
    );

    const agg = aggregateResults(results);
    await ctx.logger.info("Mailbox backfill complete", { extra: agg });
    return agg;
  },
});

// Ensure fanOutSyncTask is retained (it's registered via mailboxSyncCron)
const _fanOut = fanOutSyncTask;
