// Email Sync — all Graph API email tasks in one file:
//   emailSync          — webhook-driven single email
//   syncOneMailboxTask — child task for bulk sync
//   mailboxSync        — cron every 15 min, fans out via batchTriggerAndWait
//   mailboxBackfill    — on-demand fan-out with configurable params
//
// https://trigger.dev/docs/triggering (batchTriggerAndWait, max 500 items)
// https://trigger.dev/docs/queue-concurrency (concurrencyLimit on child task)

import { db } from "@lib/db/client";
import { insertAttachment } from "@documents-intake/db/attachment";
import { insertEmail } from "@email/db/email";
import {
  getAllMailboxes,
  getOrCreateMailbox,
  updateMailboxSyncState,
} from "@email/db/mailbox";
import type { InsertEmailData } from "@lib/db/types";
import { graphGet } from "@lib/graph/http";
import { logger, schedules, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  taskQueue,
} from "./queue";
import {
  computeDomainEnrichment,
  extractDomain,
  extractRealSender,
  extractRealSenderWithLlm,
  findOrCreateAccount,
  findOrCreateContact,
  linkContactToEmail,
  updateEmailEnrichment,
} from "@email/enrichment";

export const LOOKBACK_HOURS = 6;
const EMAIL_SYNC_QUEUE = taskQueue(
  "email-sync",
  "EMAIL_SYNC_QUEUE_CONCURRENCY",
  16
);
const MAILBOX_SYNC_CONTROL_QUEUE = taskQueue(
  "mailbox-sync-control",
  "MAILBOX_SYNC_CONTROL_QUEUE_CONCURRENCY",
  1
);
const MAILBOX_SYNC_MAILBOX_QUEUE = taskQueue(
  "mailbox-sync-mailbox",
  "MAILBOX_SYNC_MAILBOX_QUEUE_CONCURRENCY",
  6
);

// Graph API $top range 1–1000 per page. 250 reduces API calls 5x vs 50.
// https://learn.microsoft.com/en-us/graph/api/user-list-messages
const PAGE_SIZE = 250;
const BATCH_TRIGGER_LIMIT = 500;
const THREAD_SIBLING_PAGE_SIZE = 100;
const THREAD_SIBLING_MAX_PAGES = 10;
const THREAD_SIBLING_FALLBACK_LOOKBACK_DAYS = 30;
const THREAD_SIBLING_FALLBACK_MAX_PAGES = 8;
const FULL_HISTORY_SINCE_ISO = "1970-01-01T00:00:00.000Z";

const EMAIL_FIELDS = [
  "id",
  "conversationId",
  "parentFolderId",
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

interface GraphEmailAddress {
  address: string;
  name: string;
}

interface GraphRecipient {
  emailAddress: GraphEmailAddress;
}

interface GraphEmailBody {
  content: string;
  contentType: "html" | "text";
}

interface GraphInternetHeader {
  name: string;
  value: string;
}

interface GraphEmail {
  body?: GraphEmailBody;
  bodyPreview?: string;
  ccRecipients?: GraphRecipient[];
  conversationId?: string;
  from?: { emailAddress: GraphEmailAddress };
  hasAttachments?: boolean;
  id: string;
  internetMessageHeaders?: GraphInternetHeader[];
  parentFolderId?: string;
  receivedDateTime: string;
  subject: string;
  toRecipients?: GraphRecipient[];
  webLink?: string;
}

interface GraphMailFolder {
  displayName?: string;
  id: string;
}

interface GraphListResponse {
  "@odata.nextLink"?: string;
  value: GraphEmail[];
}

interface GraphAttachment {
  contentType: string;
  id: string;
  isInline: boolean;
  name: string;
  size: number;
}

const HTML_TAG_RE = /<[^>]*>/g;
const HTML_WHITESPACE_RE = /\s+/g;

export function htmlToText(html: string): string {
  return html
    .replace(HTML_TAG_RE, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(HTML_WHITESPACE_RE, " ")
    .trim();
}

function extractRecipients(recipients: GraphRecipient[] | undefined): string[] {
  if (!recipients) {
    return [];
  }
  return recipients.map((r) => r.emailAddress.address);
}

function extractInternetMessageId(
  headers: GraphInternetHeader[] | undefined
): string | null {
  if (!headers) {
    return null;
  }
  const header = headers.find((h) => h.name.toLowerCase() === "message-id");
  return header?.value ?? null;
}

function graphEmailToInsertData(
  email: GraphEmail,
  mailboxId: number,
  folderNamesById?: ReadonlyMap<string, string>
): InsertEmailData {
  const bodyHtml =
    email.body?.contentType === "html" ? email.body.content : null;
  let bodyText: string | null = null;
  if (email.body?.contentType === "text") {
    bodyText = email.body.content;
  } else if (bodyHtml) {
    bodyText = htmlToText(bodyHtml);
  }

  return {
    messageId: email.id,
    internetMessageId: extractInternetMessageId(email.internetMessageHeaders),
    mailboxId,
    conversationId: email.conversationId ?? null,
    folderId: email.parentFolderId ?? null,
    folderName: email.parentFolderId
      ? folderNamesById?.get(email.parentFolderId) ?? null
      : null,
    subject: email.subject,
    fromEmail: email.from?.emailAddress.address ?? null,
    fromName: email.from?.emailAddress.name ?? null,
    toEmails: extractRecipients(email.toRecipients),
    ccEmails: extractRecipients(email.ccRecipients),
    receivedAt: email.receivedDateTime,
    hasAttachments: email.hasAttachments ?? false,
    bodyPreview: email.bodyPreview ?? null,
    bodyFull: bodyText,
    bodyHtml,
    webUrl: email.webLink ?? null,
  };
}

async function hydrateFolderNames(
  mailboxEmail: string,
  emails: GraphEmail[],
  folderNamesById: Map<string, string>
): Promise<void> {
  const missingFolderIds = Array.from(
    new Set(
      emails
        .map((email) => email.parentFolderId?.trim() ?? "")
        .filter((folderId) => folderId.length > 0 && !folderNamesById.has(folderId))
    )
  );

  if (missingFolderIds.length === 0) {
    return;
  }

  const userPath = encodeURIComponent(mailboxEmail);

  for (const folderId of missingFolderIds) {
    try {
      const folder = await graphGet<GraphMailFolder>(
        `users/${userPath}/mailFolders/${encodeURIComponent(folderId)}?$select=id,displayName`
      );
      if (folder.displayName?.trim()) {
        folderNamesById.set(folderId, folder.displayName.trim());
      }
    } catch (error) {
      logger.warn("Folder lookup failed", {
        folderId,
        mailboxEmail,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

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

async function getExistingMessageIdsForPage(
  mailboxId: number,
  messageIds: string[]
): Promise<Set<string>> {
  if (messageIds.length === 0) {
    return new Set();
  }

  const placeholders = messageIds
    .map((_, idx) => `$${idx + 2}`)
    .join(", ");
  const rows = await db
    .query<{ message_id: string }, [number, ...string[]]>(
      `SELECT message_id FROM emails
       WHERE mailbox_id = $1 AND message_id IN (${placeholders})`
    )
    .all(mailboxId, ...messageIds);

  return new Set(rows.map((r) => r.message_id));
}

/** Yield email pages from Graph API one at a time via @odata.nextLink pagination.
 *  Each page holds up to PAGE_SIZE (250) emails — we never buffer the full result set. */
async function* fetchEmailPages(
  mailboxEmail: string,
  sinceIso: string
): AsyncGenerator<GraphEmail[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const userPath = encodeURIComponent(mailboxEmail);
  let url = `users/${userPath}/messages?$filter=${filter}&$select=${EMAIL_FIELDS}&$orderby=receivedDateTime desc&$top=${PAGE_SIZE}`;

  while (url) {
    const response = await graphGet<GraphListResponse>(url);
    yield response.value;
    url = response["@odata.nextLink"] ?? "";
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
): Promise<{
  accountDomain: string | null;
  accountId: number | null;
  contactId: number | null;
}> {
  const domainData = computeDomainEnrichment(
    fromEmail,
    subject,
    bodyFull,
    bodyPreview
  );

  const platform =
    (await extractRealSenderWithLlm(
      domainData.fromDomain,
      fromName,
      bodyFull ?? bodyPreview,
      subject
    )) ??
    extractRealSender(domainData.fromDomain, fromName, bodyFull, subject);

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

  return { accountDomain: effectiveDomain, accountId, contactId };
}

async function findRecipientAccountId(
  recipientEmail: string,
  fallbackAccountId: number | null,
  fallbackAccountDomain: string | null
): Promise<number | null> {
  const recipientDomain = extractDomain(recipientEmail);
  if (!recipientDomain) {
    return null;
  }

  if (
    fallbackAccountId &&
    fallbackAccountDomain &&
    recipientDomain === fallbackAccountDomain
  ) {
    return fallbackAccountId;
  }

  const existing = await db
    .query<{ id: number }, [string]>("SELECT id FROM accounts WHERE domain = $1")
    .get(recipientDomain);

  return existing?.id ?? null;
}

async function linkRecipientContacts(
  emailId: number,
  recipients: GraphRecipient[] | undefined,
  relationship: "to" | "cc",
  fallbackAccountId: number | null,
  fallbackAccountDomain: string | null
): Promise<void> {
  if (!recipients || recipients.length === 0) {
    return;
  }

  const seen = new Set<string>();
  for (const recipient of recipients) {
    const address = recipient.emailAddress.address?.trim().toLowerCase() ?? "";
    if (!address || seen.has(address)) {
      continue;
    }
    seen.add(address);

    const accountId = await findRecipientAccountId(
      address,
      fallbackAccountId,
      fallbackAccountDomain
    );
    if (!accountId) {
      continue;
    }

    const contactId = await findOrCreateContact(
      address,
      recipient.emailAddress.name?.trim() || null,
      accountId
    );
    if (!contactId) {
      continue;
    }

    await linkContactToEmail(contactId, emailId, relationship);
  }
}

type EmailOutcome = "stored" | "skipped" | "duplicate";

interface EmailProcessResult {
  attachments: number;
  enriched: boolean;
  outcome: EmailOutcome;
}

interface FanOutOptions {
  mailboxEmails?: string[];
  senderFilter?: string;
  forceReprocessExisting?: boolean;
}

/** Insert one email + stubs + enrichment. Used by syncOneMailbox bulk loop. */
async function processOneEmail(
  email: GraphEmail,
  mailboxEmail: string,
  mailboxId: number,
  options: {
    forceReprocessExisting?: boolean;
    folderNamesById?: ReadonlyMap<string, string>;
  } = {}
): Promise<EmailProcessResult> {
  const data = graphEmailToInsertData(
    email,
    mailboxId,
    options.folderNamesById
  );
  const inserted = await insertEmail(data);
  const emailId = inserted.id;

  if (!emailId) {
    return { attachments: 0, enriched: false, outcome: "skipped" };
  }

  if (inserted.isExcluded) {
    logger.info("Skipping excluded email after insert", {
      emailId,
      from: data.fromEmail ?? null,
      subject: data.subject ?? null,
    });
    return { attachments: 0, enriched: false, outcome: "stored" };
  }

  let attachments = 0;
  if (email.hasAttachments && !options.forceReprocessExisting) {
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
  filtered: number;
  skipped: number;
  stored: number;
}

function normalizeSenderFilter(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : undefined;
}

function emailMatchesSenderFilter(
  rawFromEmail: string | null | undefined,
  senderFilter: string
): boolean {
  const fromEmail = rawFromEmail?.trim().toLowerCase() ?? "";
  if (!fromEmail) {
    return false;
  }

  if (senderFilter.includes("@")) {
    if (senderFilter.endsWith("@")) {
      return fromEmail.startsWith(senderFilter);
    }
    return fromEmail === senderFilter;
  }

  return fromEmail.split("@")[0]?.startsWith(senderFilter) ?? false;
}

/** Process a page of emails, updating result counters. Separated to keep syncOneMailbox flat. */
async function processPage(
  page: GraphEmail[],
  existing: Set<string>,
  mailboxEmail: string,
  mailboxId: number,
  result: MailboxSyncResult,
  senderFilter: string | undefined,
  forceReprocessExisting: boolean,
  folderNamesById: Map<string, string>
): Promise<void> {
  const normalizedSenderFilter = normalizeSenderFilter(senderFilter);
  await hydrateFolderNames(mailboxEmail, page, folderNamesById);

  for (const email of page) {
    if (
      normalizedSenderFilter &&
      !emailMatchesSenderFilter(
        email.from?.emailAddress.address,
        normalizedSenderFilter
      )
    ) {
      result.filtered++;
      continue;
    }

    if (existing.has(email.id)) {
      if (!forceReprocessExisting) {
        result.skipped++;
        continue;
      }

      try {
        const r = await processOneEmail(email, mailboxEmail, mailboxId, {
          forceReprocessExisting: true,
          folderNamesById,
        });
        if (r.outcome === "stored") {
          result.stored++;
          if (r.enriched) {
            result.enriched++;
          }
        } else {
          result.skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Email reprocess failed", {
          messageId: email.id,
          error: msg,
        });
      }
      continue;
    }

    try {
      const r = await processOneEmail(email, mailboxEmail, mailboxId, {
        folderNamesById,
      });
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
  senderFilter?: string,
  forceReprocessExisting = false
): Promise<MailboxSyncResult> {
  const result: MailboxSyncResult = {
    attachments: 0,
    email: mailboxEmail,
    enriched: 0,
    error: null,
    fetched: 0,
    filtered: 0,
    skipped: 0,
    stored: 0,
  };
  const folderNamesById = new Map<string, string>();

  try {
    // Stream page-by-page — never more than PAGE_SIZE emails in memory
    for await (const page of fetchEmailPages(mailboxEmail, sinceIso)) {
      result.fetched += page.length;
      const existing = await getExistingMessageIdsForPage(
        mailboxId,
        page.map((email) => email.id)
      );
      await processPage(
        page,
        existing,
        mailboxEmail,
        mailboxId,
        result,
        senderFilter,
        forceReprocessExisting,
        folderNamesById
      );
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

function encodeODataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolveThreadSiblingFallbackSinceIso(
  anchorReceivedDateTime: string
): string {
  const anchorMs = Date.parse(anchorReceivedDateTime);
  const baseMs = Number.isFinite(anchorMs) ? anchorMs : Date.now();
  return new Date(
    baseMs - THREAD_SIBLING_FALLBACK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

async function fetchThreadMessages(
  mailboxEmail: string,
  conversationId: string,
  anchorReceivedDateTime: string
): Promise<{ messages: GraphEmail[]; usedFallback: boolean }> {
  const userPath = encodeURIComponent(mailboxEmail);
  const filter = encodeURIComponent(
    `conversationId eq ${encodeODataStringLiteral(conversationId)}`
  );

  try {
    const messages: GraphEmail[] = [];
    const seenUrls = new Set<string>();
    let pages = 0;
    let url = `users/${userPath}/messages?$filter=${filter}&$select=${EMAIL_FIELDS}&$top=${THREAD_SIBLING_PAGE_SIZE}`;

    while (url && pages < THREAD_SIBLING_MAX_PAGES && !seenUrls.has(url)) {
      seenUrls.add(url);
      const response = await graphGet<GraphListResponse>(url);
      messages.push(...response.value);
      pages++;
      url = response["@odata.nextLink"] ?? "";
    }

    if (url && pages >= THREAD_SIBLING_MAX_PAGES) {
      logger.warn(
        "Thread sibling query reached page cap; results may be partial",
        {
          mailboxEmail,
          conversationId,
          maxPages: THREAD_SIBLING_MAX_PAGES,
        }
      );
    }

    return { messages, usedFallback: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!isGraphInefficientFilterError(msg)) {
      throw error;
    }

    logger.warn(
      "Graph conversationId filter hit InefficientFilter; using recent mailbox scan fallback",
      {
        conversationId,
        mailboxEmail,
        error: msg,
      }
    );

    const fallbackSinceIso = resolveThreadSiblingFallbackSinceIso(
      anchorReceivedDateTime
    );
    const fallbackFilter = encodeURIComponent(
      `receivedDateTime ge ${fallbackSinceIso}`
    );

    const matches: GraphEmail[] = [];
    const seenUrls = new Set<string>();
    let pages = 0;
    let url = `users/${userPath}/messages?$filter=${fallbackFilter}&$select=${EMAIL_FIELDS}&$orderby=receivedDateTime desc&$top=${PAGE_SIZE}`;

    while (
      url &&
      pages < THREAD_SIBLING_FALLBACK_MAX_PAGES &&
      !seenUrls.has(url)
    ) {
      seenUrls.add(url);
      const response = await graphGet<GraphListResponse>(url);
      matches.push(
        ...response.value.filter((msg) => msg.conversationId === conversationId)
      );
      pages++;
      url = response["@odata.nextLink"] ?? "";
    }

    if (url && pages >= THREAD_SIBLING_FALLBACK_MAX_PAGES) {
      logger.warn(
        "Thread sibling fallback scan reached page cap; results may be partial",
        {
          mailboxEmail,
          conversationId,
          maxPages: THREAD_SIBLING_FALLBACK_MAX_PAGES,
          fallbackSinceIso,
        }
      );
    }

    return { messages: matches, usedFallback: true };
  }
}

async function syncThreadSiblings(
  mailboxEmail: string,
  mailboxId: number,
  conversationId: string,
  excludeMessageId: string,
  anchorReceivedDateTime: string,
  folderNamesById: Map<string, string> = new Map()
): Promise<number> {
  const existingRows = await db
    .query<{ message_id: string }, [string]>(
      "SELECT message_id FROM emails WHERE conversation_id = $1"
    )
    .all(conversationId);

  const existingIds = new Set(existingRows.map((r) => r.message_id));

  const threadFetch = await fetchThreadMessages(
    mailboxEmail,
    conversationId,
    anchorReceivedDateTime
  );

  const threadMessages = Array.from(
    new Map(threadFetch.messages.map((msg) => [msg.id, msg])).values()
  );

  const siblings = threadMessages
    .filter((msg) => msg.id !== excludeMessageId && !existingIds.has(msg.id))
    .sort((a, b) => {
      const aTime = Date.parse(a.receivedDateTime);
      const bTime = Date.parse(b.receivedDateTime);
      if (!(Number.isFinite(aTime) && Number.isFinite(bTime))) {
        return 0;
      }
      return aTime - bTime;
    });

  if (siblings.length === 0) {
    return 0;
  }

  await hydrateFolderNames(mailboxEmail, siblings, folderNamesById);

  logger.info("Syncing thread siblings", {
    conversationId,
    total: threadMessages.length,
    newSiblings: siblings.length,
    usedFallback: threadFetch.usedFallback,
  });

  let synced = 0;
  let syncedAttachments = 0;
  let syncedEnriched = 0;
  for (const sibling of siblings) {
    try {
      const result = await processOneEmail(sibling, mailboxEmail, mailboxId, {
        folderNamesById,
      });
      if (result.outcome !== "stored") {
        continue;
      }
      synced++;
      syncedAttachments += result.attachments;
      if (result.enriched) {
        syncedEnriched++;
      }
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
    attachments: syncedAttachments,
    enriched: syncedEnriched,
    skipped: siblings.length - synced,
    usedFallback: threadFetch.usedFallback,
  });

  return synced;
}

interface AggregatedResults {
  errors: number;
  mailboxCount: number;
  totalAttachments: number;
  totalEnriched: number;
  totalFetched: number;
  totalFiltered: number;
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
  let totalFiltered = 0;
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
      totalFiltered += r.filtered;
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
    totalFiltered,
    totalStored,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isGraphItemNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("graph api 404") ||
    normalized.includes("erroritemnotfound")
  );
}

function isGraphInefficientFilterError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("inefficientfilter") ||
    normalized.includes("restriction or sort order is too complex")
  );
}

function isGraphSkippableError(message: string): boolean {
  return (
    isGraphItemNotFoundError(message) || isGraphInefficientFilterError(message)
  );
}

// Webhook-driven: triggered by Outlook webhook via REST API when
// a new email arrives. Processes one email + its thread siblings.
export const emailSync = schemaTask({
  id: "email-sync",
  queue: EMAIL_SYNC_QUEUE,
  schema: z.object({
    messageId: z.string().min(1),
    mailboxEmail: z.string().min(1),
    changeType: z.string().default("created"),
  }),
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async ({ messageId, mailboxEmail }) => {
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
          logger.info(
            "Email no longer exists in Graph; skipping webhook sync",
            {
              mailboxEmail,
              messageId,
            }
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

      logger.info("Email synced", {
        emailId,
        subject: email.subject,
        from: email.from?.emailAddress.address,
        conversationId: email.conversationId,
        isExcluded: inserted.isExcluded,
      });

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
            logger.info(
              "Attachment list missing in Graph; skipping attachment stubs",
              {
                mailboxEmail,
                messageId,
              }
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
        logger.warn("Email enrichment failed in webhook email-sync", {
          emailId,
          error: error instanceof Error ? error.message : String(error),
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
          logger.warn("Thread sibling sync failed in webhook email-sync", {
            conversationId: email.conversationId,
            emailId,
            error: error instanceof Error ? error.message : String(error),
          });
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
        logger.info("Recoverable Graph error in email-sync; skipping", {
          mailboxEmail,
          messageId,
          reason,
        });
        return {
          skipped: true,
          reason,
          mailboxEmail,
          messageId,
        };
      }
      throw error;
    }
  },
});

// Child task — syncs a single mailbox. Runs in its own container.
export const syncOneMailboxTask = schemaTask({
  id: "sync-one-mailbox",
  queue: MAILBOX_SYNC_MAILBOX_QUEUE,
  schema: z.object({
    email: z.email(),
    mailboxId: z.number(),
    sinceIso: z.string(),
    senderFilter: z.string().trim().toLowerCase().optional(),
    forceReprocessExisting: z.boolean().optional(),
  }),
  maxDuration: 7200, // 2 hours — large mailboxes may have 50k+ emails
  retry: { maxAttempts: 2 },
  run: ({ email, mailboxId, sinceIso, senderFilter, forceReprocessExisting }) =>
    syncOneMailbox(
      email,
      mailboxId,
      sinceIso,
      senderFilter,
      forceReprocessExisting ?? false
    ),
});

async function triggerDownstreamIntakeTasks(params: {
  totalAttachments: number;
  totalStored: number;
}): Promise<void> {
  if (params.totalStored <= 0) {
    return;
  }

  const triggers: Promise<unknown>[] = [];

  if (params.totalAttachments > 0) {
    triggers.push(
      tasks.trigger("attachment-intake", {}).catch((err) =>
        logger.warn("Failed to trigger attachment-intake", {
          error: String(err),
        })
      )
    );
  }

  triggers.push(
    tasks.trigger("body-link-intake", {}).catch((err) =>
      logger.warn("Failed to trigger body-link-intake", {
        error: String(err),
      })
    )
  );

  await Promise.all(triggers);
}

/** Fan out to syncOneMailboxTask for all mailboxes, aggregate results. */
async function fanOutSync(
  label: string,
  sinceIso: string,
  options: FanOutOptions = {}
) {
  const mailboxes = await getAllMailboxes();
  if (mailboxes.length === 0) {
    logger.warn("No mailboxes found");
    return {
      mailboxes: 0,
      totalFetched: 0,
      totalStored: 0,
      totalFiltered: 0,
      totalAttachments: 0,
      totalEnriched: 0,
      errors: 0,
    };
  }

  const normalizedMailboxEmails = options.mailboxEmails
    ? [...new Set(options.mailboxEmails.map((mailbox) => mailbox.toLowerCase()))]
    : [];
  const filteredMailboxes = normalizedMailboxEmails.length
    ? mailboxes.filter((mailbox) =>
        normalizedMailboxEmails.includes(mailbox.email.toLowerCase())
      )
    : mailboxes;

  if (normalizedMailboxEmails.length > 0 && filteredMailboxes.length === 0) {
    logger.warn("No matching mailboxes found for mailbox-backfill", {
      requestedMailboxes: normalizedMailboxEmails,
      totalMailboxes: mailboxes.length,
    });
    return {
      mailboxes: 0,
      totalFetched: 0,
      totalStored: 0,
      totalFiltered: 0,
      totalAttachments: 0,
      totalEnriched: 0,
      errors: 0,
    };
  }

  logger.info(`Starting ${label}`, {
    mailboxes: filteredMailboxes.length,
    requestedMailboxes: normalizedMailboxEmails.length ? normalizedMailboxEmails : undefined,
    senderFilter: options.senderFilter,
    since: sinceIso,
  });

  const mailboxBatches = chunk(filteredMailboxes, BATCH_TRIGGER_LIMIT);
  const agg: AggregatedResults = {
    mailboxCount: 0,
    totalFetched: 0,
    totalStored: 0,
    totalFiltered: 0,
    totalAttachments: 0,
    totalEnriched: 0,
    errors: 0,
  };

  for (const [batchIndex, batch] of mailboxBatches.entries()) {
    const batchResults = await syncOneMailboxTask.batchTriggerAndWait(
      batch.map((m) => ({
        payload: {
          email: m.email,
          mailboxId: m.id,
          sinceIso,
          senderFilter: options.senderFilter,
          forceReprocessExisting: options.forceReprocessExisting,
        },
      }))
    );

    const batchAgg = aggregateBatchResults(batchResults, batch.length);
    agg.mailboxCount += batchAgg.mailboxCount;
    agg.totalFetched += batchAgg.totalFetched;
    agg.totalStored += batchAgg.totalStored;
    agg.totalFiltered += batchAgg.totalFiltered;
    agg.totalAttachments += batchAgg.totalAttachments;
    agg.totalEnriched += batchAgg.totalEnriched;
    agg.errors += batchAgg.errors;

    logger.info(`${label} fan-out batch complete`, {
      batchIndex: batchIndex + 1,
      totalBatches: mailboxBatches.length,
      ...batchAgg,
    });
  }

  await triggerDownstreamIntakeTasks({
    totalAttachments: agg.totalAttachments,
    totalStored: agg.totalStored,
  });

  logger.info(`${label} complete`, { ...agg });

  return {
    mailboxes: agg.mailboxCount,
    totalFetched: agg.totalFetched,
    totalStored: agg.totalStored,
    totalFiltered: agg.totalFiltered,
    totalAttachments: agg.totalAttachments,
    totalEnriched: agg.totalEnriched,
    errors: agg.errors,
  };
}

function resolveBackfillSinceIso(
  lookbackHours: number | undefined,
  sinceIso: string | undefined
): string {
  const trimmedSince = sinceIso?.trim();
  if (trimmedSince) {
    const parsed = Date.parse(trimmedSince);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid sinceIso provided to mailbox-backfill: ${trimmedSince}`);
    }
    return new Date(parsed).toISOString();
  }

  if (lookbackHours && lookbackHours > 0) {
    return buildSinceFilter(lookbackHours);
  }

  return FULL_HISTORY_SINCE_ISO;
}

// Cron — every 15 min, fans out to syncOneMailboxTask per mailbox.
// Wait time in batchTriggerAndWait does NOT count toward maxDuration.
export const mailboxSync = schedules.task({
  id: "mailbox-sync",
  queue: MAILBOX_SYNC_CONTROL_QUEUE,
  cron: "*/15 * * * *",
  maxDuration: 300,
  run: () => fanOutSync("mailbox sync", buildSinceFilter(LOOKBACK_HOURS)),
});

// On-demand backfill — configurable lookback, no per-mailbox limit.
// POST /api/v1/tasks/mailbox-backfill/trigger
// {"payload":{}}
// {"payload":{"lookbackHours":40000}}
export const mailboxBackfill = schemaTask({
  id: "mailbox-backfill",
  queue: MAILBOX_SYNC_CONTROL_QUEUE,
  schema: z.object({
    lookbackHours: z.number().min(1).optional(),
    sinceIso: z.string().trim().optional(),
    senderFilter: z
      .string()
      .trim()
      .min(1)
      .toLowerCase()
      .optional(),
    mailboxEmails: z
      .array(z.string().toLowerCase().trim())
      .optional(),
    forceReprocessExisting: z.boolean().optional().default(false),
  }),
  maxDuration: 7200,
  retry: { maxAttempts: 1 },
  run: ({
    lookbackHours,
    sinceIso,
    mailboxEmails,
    senderFilter,
    forceReprocessExisting,
  }) =>
    fanOutSync(
      "mailbox backfill",
      resolveBackfillSinceIso(lookbackHours, sinceIso),
      {
        mailboxEmails,
        senderFilter,
        forceReprocessExisting,
      }
    ),
});
