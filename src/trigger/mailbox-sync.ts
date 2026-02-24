// Email Sync — all Graph API email tasks in one file:
//   emailSync          — webhook-driven single email
//   syncOneMailboxTask — child task for bulk sync
//   mailboxSync        — cron every 15 min, fans out via batchTriggerAndWait
//   mailboxBackfill    — on-demand fan-out with configurable params
//
// https://trigger.dev/docs/triggering (batchTriggerAndWait, max 500 items)
// https://trigger.dev/docs/queue-concurrency (concurrencyLimit on child task)

import { db } from "@lib/db/client";
import { insertAttachment } from "@lib/db/repositories/attachment";
import { insertEmail } from "@lib/db/repositories/email";
import {
  getAllMailboxes,
  getOrCreateMailbox,
  updateMailboxSyncState,
} from "@lib/db/repositories/mailbox";
import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
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

export const LOOKBACK_HOURS = 6;
export const MAX_EMAILS_PER_MAILBOX = 200;

// Graph API $top range 1–1000 per page. 250 reduces API calls 5x vs 50.
// https://learn.microsoft.com/en-us/graph/api/user-list-messages
const PAGE_SIZE = 250;

export function buildSinceFilter(hoursAgo: number): string {
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

/** Yield email pages from Graph API one at a time via @odata.nextLink pagination.
 *  Each page holds up to PAGE_SIZE (250) emails — we never buffer the full result set.
 *  This keeps memory flat at ~250 emails regardless of maxEmails. */
async function* fetchEmailPages(
  mailboxEmail: string,
  sinceIso: string,
  maxEmails: number
): AsyncGenerator<GraphEmail[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const userPath = encodeURIComponent(mailboxEmail);
  let url = `users/${userPath}/messages?$filter=${filter}&$select=${EMAIL_FIELDS}&$orderby=receivedDateTime desc&$top=${PAGE_SIZE}`;

  let yielded = 0;

  while (url && yielded < maxEmails) {
    const response = await graphGet<GraphListResponse>(url);
    const remaining = maxEmails - yielded;
    const page =
      response.value.length <= remaining
        ? response.value
        : response.value.slice(0, remaining);
    yield page;
    yielded += page.length;
    url = response["@odata.nextLink"] ?? "";
    // nextLink is a full URL — graphGet handles both full URLs and relative paths
  }
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

/** Run enrichment pipeline on a single email: domain, platform, account, contact. */
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

type EmailOutcome = "stored" | "skipped" | "duplicate";

interface EmailProcessResult {
  attachments: number;
  enriched: boolean;
  outcome: EmailOutcome;
}

/** Insert one email + stubs + enrichment. Used by syncOneMailbox bulk loop. */
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

export interface MailboxSyncResult {
  attachments: number;
  email: string;
  enriched: number;
  error: string | null;
  fetched: number;
  skipped: number;
  stored: number;
}

/** Process a page of emails, updating result counters. Separated to keep syncOneMailbox flat. */
async function processPage(
  page: GraphEmail[],
  existing: Set<string>,
  mailboxEmail: string,
  mailboxId: number,
  result: MailboxSyncResult
): Promise<void> {
  for (const email of page) {
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
        logger.warn("Email insert failed", { messageId: email.id, error: msg });
      }
    }
  }
}

export async function syncOneMailbox(
  mailboxEmail: string,
  mailboxId: number,
  sinceIso: string,
  maxEmails = MAX_EMAILS_PER_MAILBOX
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
    const existing = await getExistingMessageIds(mailboxId, sinceIso);

    // Stream page-by-page — never more than PAGE_SIZE emails in memory
    for await (const page of fetchEmailPages(
      mailboxEmail,
      sinceIso,
      maxEmails
    )) {
      result.fetched += page.length;
      await processPage(page, existing, mailboxEmail, mailboxId, result);
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

async function syncThreadSiblings(
  mailboxEmail: string,
  mailboxId: number,
  conversationId: string,
  excludeMessageId: string
): Promise<number> {
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

interface AggregatedResults {
  errors: number;
  mailboxCount: number;
  totalAttachments: number;
  totalEnriched: number;
  totalFetched: number;
  totalStored: number;
}

// Infer the actual SDK return type so we don't fight BatchResult generics
type SyncBatchResult = Awaited<
  ReturnType<typeof syncOneMailboxTask.batchTriggerAndWait>
>;

function aggregateBatchResults(
  batchResult: SyncBatchResult,
  mailboxCount: number
): AggregatedResults {
  let totalStored = 0;
  let totalFetched = 0;
  let totalAttachments = 0;
  let totalEnriched = 0;
  let errors = 0;

  for (const run of batchResult.runs) {
    if (!run.ok) {
      errors++;
      continue;
    }
    const r = run.output;
    totalStored += r.stored;
    totalFetched += r.fetched;
    totalAttachments += r.attachments;
    totalEnriched += r.enriched;
    if (r.error) {
      errors++;
    }
  }

  return {
    errors,
    mailboxCount,
    totalAttachments,
    totalEnriched,
    totalFetched,
    totalStored,
  };
}

// Webhook-driven: triggered by Outlook webhook via REST API when
// a new email arrives. Processes one email + its thread siblings.
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
    const mailbox = await getOrCreateMailbox(mailboxEmail);

    const email = await graphGet<GraphEmail>(
      `users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}?$select=${EMAIL_FIELDS}`
    );

    const data = graphEmailToInsertData(email, mailbox.id);
    const emailId = await insertEmail(data);

    logger.info("Email synced", {
      emailId,
      subject: email.subject,
      from: email.from?.emailAddress.address,
      conversationId: email.conversationId,
    });

    let attachmentStubs = 0;
    if (email.hasAttachments && emailId) {
      attachmentStubs = await syncAttachmentStubs(
        mailboxEmail,
        messageId,
        emailId
      );
    }

    const { accountId, contactId } = await enrichEmail(
      emailId,
      data.fromEmail ?? null,
      data.fromName ?? null,
      data.subject ?? null,
      data.bodyFull ?? null,
      data.bodyPreview ?? null
    );

    let siblingsSynced = 0;
    if (email.conversationId) {
      siblingsSynced = await syncThreadSiblings(
        mailboxEmail,
        mailbox.id,
        email.conversationId,
        messageId
      );
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
  },
});

// Child task — syncs a single mailbox. Runs in its own container.
// concurrencyLimit: 10 — max 10 mailboxes synced in parallel.
// https://trigger.dev/docs/queue-concurrency
export const syncOneMailboxTask = schemaTask({
  id: "sync-one-mailbox",
  schema: z.object({
    email: z.string().email(),
    mailboxId: z.number(),
    sinceIso: z.string(),
    maxEmails: z.number().default(MAX_EMAILS_PER_MAILBOX),
  }),
  queue: { concurrencyLimit: 10 },
  maxDuration: 1800, // 30 min per mailbox
  retry: { maxAttempts: 2 },
  run: async ({ email, mailboxId, sinceIso, maxEmails }) => {
    return await syncOneMailbox(email, mailboxId, sinceIso, maxEmails);
  },
});

/** Fan out to syncOneMailboxTask for all mailboxes, aggregate results. */
async function fanOutSync(label: string, sinceIso: string, maxEmails: number) {
  const mailboxes = await getAllMailboxes();
  if (mailboxes.length === 0) {
    logger.warn("No mailboxes found");
    return { mailboxes: 0, totalStored: 0, totalAttachments: 0, errors: 0 };
  }

  logger.info(`Starting ${label}`, {
    mailboxes: mailboxes.length,
    since: sinceIso,
  });

  const batchResults = await syncOneMailboxTask.batchTriggerAndWait(
    mailboxes.map((m) => ({
      payload: { email: m.email, mailboxId: m.id, sinceIso, maxEmails },
    }))
  );

  const agg = aggregateBatchResults(batchResults, mailboxes.length);
  logger.info(`${label} complete`, { ...agg });

  return {
    mailboxes: agg.mailboxCount,
    totalFetched: agg.totalFetched,
    totalStored: agg.totalStored,
    totalAttachments: agg.totalAttachments,
    totalEnriched: agg.totalEnriched,
    errors: agg.errors,
  };
}

// Cron — every 15 min, fans out to syncOneMailboxTask per mailbox.
// Wait time in batchTriggerAndWait does NOT count toward maxDuration.
export const mailboxSync = schedules.task({
  id: "mailbox-sync",
  cron: "*/15 * * * *",
  maxDuration: 300,
  run: () =>
    fanOutSync(
      "mailbox sync",
      buildSinceFilter(LOOKBACK_HOURS),
      MAX_EMAILS_PER_MAILBOX
    ),
});

// On-demand backfill — configurable lookback and per-mailbox limit.
// POST /api/v1/tasks/mailbox-backfill/trigger
// {"payload":{"lookbackHours":40000,"maxEmailsPerMailbox":100000}}
export const mailboxBackfill = schemaTask({
  id: "mailbox-backfill",
  schema: z.object({
    lookbackHours: z.number().min(1).max(50_000).default(96),
    maxEmailsPerMailbox: z.number().min(1).max(100_000).default(1000),
  }),
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: ({ lookbackHours, maxEmailsPerMailbox }) =>
    fanOutSync(
      "mailbox backfill",
      buildSinceFilter(lookbackHours),
      maxEmailsPerMailbox
    ),
});
