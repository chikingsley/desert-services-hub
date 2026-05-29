#!/usr/bin/env bun

import { createHash, randomUUID } from "node:crypto";
import { access, appendFile, copyFile, link, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";
import { getGraphToken } from "../../../lib/graph/auth.ts";

const FULL_HISTORY_SINCE_ISO = "1970-01-01T00:00:00.000Z";
const DEFAULT_ARCHIVE_DIR =
  process.env.EMAIL_ARCHIVE_DIR?.trim() ||
  "/mnt/overflow/desert-services/email-archive";
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_SYNC_OVERLAP_HOURS = 72;
const DEFAULT_ATTACHMENT_BATCH_SIZE = 200;
const DEFAULT_ATTACHMENT_CONCURRENCY = 2;
const DEFAULT_MANIFEST_BATCH_SIZE = 1000;
const DESERT_DOMAIN = "desertservices.net";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const GRAPH_MAX_ATTEMPTS = 5;
const GRAPH_ATTACHMENT_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.EMAIL_ARCHIVE_ATTACHMENT_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 180_000;
})();
const BLOB_LINK_MAX_ATTEMPTS = 5;
const BLOB_LINK_RETRY_BASE_DELAY_MS = 100;

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
  "categories",
].join(",");

type Phase = "all" | "archive" | "manifest" | "sync";

interface CliOptions {
  archiveDir: string;
  attachmentBatchSize: number;
  attachmentConcurrency: number;
  dryRun: boolean;
  fullHistory: boolean;
  limitAttachments: number | null;
  limitPagesPerMailbox: number | null;
  mailboxEmails: string[];
  manifestBatchSize: number;
  pageSize: number;
  phase: Phase;
  sinceIso: string | null;
  syncOverlapHours: number;
}

interface MailboxRow {
  email: string;
  id: number;
}

interface GraphEmailAddress {
  address?: string;
  name?: string;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

interface GraphInternetHeader {
  name?: string;
  value?: string;
}

interface GraphEmailBody {
  content?: string;
  contentType?: "html" | "text";
}

interface GraphEmail {
  body?: GraphEmailBody;
  bodyPreview?: string;
  categories?: string[];
  ccRecipients?: GraphRecipient[];
  conversationId?: string;
  from?: { emailAddress?: GraphEmailAddress };
  hasAttachments?: boolean;
  id: string;
  internetMessageHeaders?: GraphInternetHeader[];
  parentFolderId?: string;
  receivedDateTime: string;
  subject?: string;
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
  contentType?: string;
  id: string;
  isInline?: boolean;
  name: string;
  size?: number;
}

interface EmailUpsertRecord {
  attachment_names: string | null;
  body_full: string | null;
  body_html: string | null;
  body_preview: string | null;
  categories: string | null;
  cc_emails: string | null;
  conversation_id: string | null;
  folder_id: string | null;
  folder_name: string | null;
  from_domain: string | null;
  from_email: string | null;
  from_name: string | null;
  has_attachments: number;
  internet_message_id: string | null;
  is_internal: number;
  mailbox_id: number;
  message_id: string;
  normalized_subject: string | null;
  received_at: string;
  subject: string | null;
  to_emails: string | null;
  web_url: string | null;
}

interface UpsertedEmailRow {
  has_attachments: number | null;
  id: number;
  inserted: boolean;
  message_id: string;
}

interface AttachmentExportRow {
  body_full: string | null;
  body_html: string | null;
  body_preview: string | null;
  cc_emails: string | null;
  content_hash: string | null;
  content_type: string | null;
  conversation_id: string | null;
  document_id: number;
  downloaded_at: string | null;
  file_name: string;
  file_size: number | null;
  folder_id: string | null;
  folder_name: string | null;
  from_email: string | null;
  from_name: string | null;
  internet_message_id: string | null;
  local_path: string | null;
  mailbox_email: string;
  message_id: string;
  outlook_attachment_id: string | null;
  received_at: Date | string;
  storage_path: string | null;
  subject: string | null;
  to_emails: string | null;
  web_url: string | null;
  email_id: number;
}

interface ManifestRow {
  content_hash: string | null;
  document_id: number;
  file_name: string;
  file_size: number | null;
  from_email: string | null;
  internet_message_id: string | null;
  local_path: string;
  mailbox_email: string;
  message_id: string;
  received_at: Date | string;
  subject: string | null;
  web_url: string | null;
  email_id: number;
}

interface SyncStats {
  emailsFetched: number;
  emailsInserted: number;
  emailsUpdated: number;
  attachmentsStubbed: number;
  mailboxes: number;
}

interface ArchiveStats {
  bytesMaterialized: bigint;
  failed: number;
  linkedFromExistingBlob: number;
  linkedFromSourceFile: number;
  linkedFromTargetFile: number;
  linkedNewDownload: number;
  processed: number;
}

function printHelp(): void {
  console.log(`
Desert Services email backfill + offline archive

Usage:
  bun packages/email/cli/backfill-archive.ts [options]

Phases:
  --phase sync       Sync emails + attachment stubs into Postgres
  --phase archive    Download/archive attachment binaries to disk
  --phase manifest   Rebuild archive manifest files only
  --phase all        Run sync, archive, then manifest (default)

Options:
  --mailbox <email>              Limit to one mailbox. Repeat for multiple.
  --since <iso>                  Sync messages received at/after this ISO timestamp
  --full-history                 Ignore mailbox high-water marks and scan full history
  --sync-overlap-hours <hours>   Overlap window when resuming from DB max(received_at) (default: ${DEFAULT_SYNC_OVERLAP_HOURS})
  --archive-dir <path>           Archive root (default: ${DEFAULT_ARCHIVE_DIR})
  --page-size <n>                Graph page size for email sync (default: ${DEFAULT_PAGE_SIZE})
  --limit-pages <n>              Stop after N pages per mailbox (smoke testing)
  --attachment-batch-size <n>    Attachment query batch size (default: ${DEFAULT_ATTACHMENT_BATCH_SIZE})
  --attachment-concurrency <n>   Concurrent attachment workers (default: ${DEFAULT_ATTACHMENT_CONCURRENCY})
  --limit-attachments <n>        Stop archive phase after N attachment rows
  --manifest-batch-size <n>      Manifest query batch size (default: ${DEFAULT_MANIFEST_BATCH_SIZE})
  --dry-run                      Read only; no DB writes and no file writes
  --help                         Show this help

Examples:
  bun packages/email/cli/backfill-archive.ts --phase sync
  bun packages/email/cli/backfill-archive.ts --phase sync --mailbox chi@desertservices.net --since 2026-03-01T00:00:00Z
  bun packages/email/cli/backfill-archive.ts --phase archive --archive-dir /mnt/overflow/desert-services/email-archive
  bun packages/email/cli/backfill-archive.ts --phase all --full-history
`);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    archiveDir: DEFAULT_ARCHIVE_DIR,
    attachmentBatchSize: DEFAULT_ATTACHMENT_BATCH_SIZE,
    attachmentConcurrency: DEFAULT_ATTACHMENT_CONCURRENCY,
    dryRun: false,
    fullHistory: false,
    limitAttachments: null,
    limitPagesPerMailbox: null,
    mailboxEmails: [],
    manifestBatchSize: DEFAULT_MANIFEST_BATCH_SIZE,
    pageSize: DEFAULT_PAGE_SIZE,
    phase: "all",
    sinceIso: null,
    syncOverlapHours: DEFAULT_SYNC_OVERLAP_HOURS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--full-history") {
      options.fullHistory = true;
      continue;
    }

    const next = argv[i + 1];
    switch (arg) {
      case "--phase":
        if (next === "all" || next === "archive" || next === "manifest" || next === "sync") {
          options.phase = next;
        } else {
          throw new Error(`Invalid --phase: ${next ?? "(missing)"}`);
        }
        i += 1;
        break;
      case "--archive-dir":
        options.archiveDir = next?.trim() || options.archiveDir;
        i += 1;
        break;
      case "--mailbox":
        if (!next?.trim()) {
          throw new Error("--mailbox requires a value");
        }
        options.mailboxEmails.push(next.trim().toLowerCase());
        i += 1;
        break;
      case "--since":
        if (!next?.trim()) {
          throw new Error("--since requires an ISO timestamp");
        }
        options.sinceIso = new Date(next).toISOString();
        i += 1;
        break;
      case "--sync-overlap-hours":
        options.syncOverlapHours = parsePositiveInt(next, options.syncOverlapHours);
        i += 1;
        break;
      case "--page-size":
        options.pageSize = parsePositiveInt(next, options.pageSize);
        i += 1;
        break;
      case "--limit-pages":
        options.limitPagesPerMailbox = parsePositiveInt(next, 1);
        i += 1;
        break;
      case "--attachment-batch-size":
        options.attachmentBatchSize = parsePositiveInt(next, options.attachmentBatchSize);
        i += 1;
        break;
      case "--attachment-concurrency":
        options.attachmentConcurrency = parsePositiveInt(next, options.attachmentConcurrency);
        i += 1;
        break;
      case "--limit-attachments":
        options.limitAttachments = parsePositiveInt(next, 1);
        i += 1;
        break;
      case "--manifest-batch-size":
        options.manifestBatchSize = parsePositiveInt(next, options.manifestBatchSize);
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function normalizeGraphUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_API_BASE}/${pathOrUrl}`;
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) {
      return Math.max(0, seconds * 1000);
    }
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
  }
  if (response.status === 429) {
    return 30_000;
  }
  return Math.min(5000 * 2 ** (attempt - 1), 80_000);
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function waitForPath(path: string, attempts = 1, delayMs = 0): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await pathExists(path)) {
      return true;
    }
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }
  return false;
}

async function graphFetch(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const token = await getGraphToken();
  const url = normalizeGraphUrl(pathOrUrl);

  for (let attempt = 1; attempt <= GRAPH_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return response;
    }

    if (GRAPH_RETRYABLE_STATUS_CODES.has(response.status) && attempt < GRAPH_MAX_ATTEMPTS) {
      await sleep(getRetryDelayMs(response, attempt));
      continue;
    }

    const text = await response.text();
    throw new Error(`Graph API ${response.status}: ${text.slice(0, 1000)}`);
  }

  throw new Error("Graph request exhausted retry loop");
}

async function graphJson<T>(pathOrUrl: string): Promise<T> {
  const response = await graphFetch(pathOrUrl, { headers: {} });
  return (await response.json()) as T;
}

function extractRecipients(recipients: GraphRecipient[] | undefined): string[] {
  return (recipients ?? [])
    .map((recipient) => recipient.emailAddress?.address?.trim())
    .filter((value): value is string => Boolean(value));
}

function extractInternetMessageId(headers: GraphInternetHeader[] | undefined): string | null {
  const header = headers?.find((item) => item.name?.toLowerCase() === "message-id");
  return header?.value?.trim() || null;
}

const HTML_TAG_RE = /<[^>]*>/g;
const HTML_WHITESPACE_RE = /\s+/g;

function htmlToText(html: string): string {
  return html
    .replace(HTML_TAG_RE, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(HTML_WHITESPACE_RE, " ")
    .trim();
}

function normalizeSubject(subject: string | null): string | null {
  if (!subject) {
    return null;
  }
  const cleaned = subject.replace(/^\s*((re|fw|fwd):\s*)+/gi, "").trim().toLowerCase();
  return cleaned.length ? cleaned : null;
}

function inferFromDomain(fromEmail: string | null): string | null {
  if (!fromEmail?.includes("@")) {
    return null;
  }
  return fromEmail.split("@")[1]?.toLowerCase() ?? null;
}

function inferIsInternal(fromDomain: string | null): number {
  return fromDomain === DESERT_DOMAIN ? 1 : 0;
}

function toJsonString(value: string[]): string | null {
  return value.length ? JSON.stringify(value) : null;
}

function buildEmailRecord(
  email: GraphEmail,
  mailboxId: number,
  folderNamesById: ReadonlyMap<string, string>
): EmailUpsertRecord {
  const bodyHtml = email.body?.contentType === "html" ? (email.body.content ?? null) : null;
  const bodyFull =
    email.body?.contentType === "text"
      ? (email.body.content ?? null)
      : bodyHtml
        ? htmlToText(bodyHtml)
        : null;
  const fromEmail = email.from?.emailAddress?.address?.trim().toLowerCase() ?? null;
  const fromDomain = inferFromDomain(fromEmail);
  const toEmails = extractRecipients(email.toRecipients);
  const ccEmails = extractRecipients(email.ccRecipients);
  const categories = (email.categories ?? []).map((value) => value.trim()).filter(Boolean);

  return {
    attachment_names: null,
    body_full: bodyFull,
    body_html: bodyHtml,
    body_preview: email.bodyPreview ?? null,
    categories: toJsonString(categories),
    cc_emails: toJsonString(ccEmails),
    conversation_id: email.conversationId ?? null,
    folder_id: email.parentFolderId ?? null,
    folder_name: email.parentFolderId ? (folderNamesById.get(email.parentFolderId) ?? null) : null,
    from_domain: fromDomain,
    from_email: fromEmail,
    from_name: email.from?.emailAddress?.name?.trim() ?? null,
    has_attachments: email.hasAttachments ? 1 : 0,
    internet_message_id: extractInternetMessageId(email.internetMessageHeaders),
    is_internal: inferIsInternal(fromDomain),
    mailbox_id: mailboxId,
    message_id: email.id,
    normalized_subject: normalizeSubject(email.subject ?? null),
    received_at: email.receivedDateTime,
    subject: email.subject ?? null,
    to_emails: toJsonString(toEmails),
    web_url: email.webLink ?? null,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

async function hydrateFolderNames(
  mailboxEmail: string,
  emails: GraphEmail[],
  folderNamesById: Map<string, string>
): Promise<void> {
  const missingFolderIds = [...new Set(
    emails
      .map((email) => email.parentFolderId?.trim() ?? "")
      .filter((folderId) => folderId.length > 0 && !folderNamesById.has(folderId))
  )];

  for (const folderId of missingFolderIds) {
    try {
      const folder = await graphJson<GraphMailFolder>(
        `users/${encodeURIComponent(mailboxEmail)}/mailFolders/${encodeURIComponent(folderId)}?$select=id,displayName`
      );
      if (folder.displayName?.trim()) {
        folderNamesById.set(folderId, folder.displayName.trim());
      }
    } catch (error) {
      console.warn(`[sync] folder lookup failed mailbox=${mailboxEmail} folder=${folderId} ${(error as Error).message}`);
    }
  }
}

function buildEmailUpsertQuery(records: EmailUpsertRecord[]): { params: unknown[]; query: string } {
  const columns = [
    "message_id",
    "internet_message_id",
    "mailbox_id",
    "conversation_id",
    "folder_id",
    "folder_name",
    "subject",
    "normalized_subject",
    "from_email",
    "from_name",
    "from_domain",
    "to_emails",
    "cc_emails",
    "received_at",
    "has_attachments",
    "attachment_names",
    "body_preview",
    "body_full",
    "body_html",
    "web_url",
    "categories",
    "is_internal",
  ] as const;

  const params: unknown[] = [];
  const values = records.map((record, recordIndex) => {
    const row = [
      record.message_id,
      record.internet_message_id,
      record.mailbox_id,
      record.conversation_id,
      record.folder_id,
      record.folder_name,
      record.subject,
      record.normalized_subject,
      record.from_email,
      record.from_name,
      record.from_domain,
      record.to_emails,
      record.cc_emails,
      record.received_at,
      record.has_attachments,
      record.attachment_names,
      record.body_preview,
      record.body_full,
      record.body_html,
      record.web_url,
      record.categories,
      record.is_internal,
    ];
    params.push(...row);
    const offset = recordIndex * columns.length;
    return `(${columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
  });

  const query = `
    insert into emails (${columns.join(", ")})
    values ${values.join(", ")}
    on conflict (message_id) do update set
      internet_message_id = excluded.internet_message_id,
      mailbox_id = excluded.mailbox_id,
      conversation_id = excluded.conversation_id,
      folder_id = excluded.folder_id,
      folder_name = excluded.folder_name,
      subject = excluded.subject,
      normalized_subject = excluded.normalized_subject,
      from_email = excluded.from_email,
      from_name = excluded.from_name,
      from_domain = excluded.from_domain,
      to_emails = excluded.to_emails,
      cc_emails = excluded.cc_emails,
      received_at = excluded.received_at,
      has_attachments = excluded.has_attachments,
      body_preview = excluded.body_preview,
      body_full = excluded.body_full,
      body_html = excluded.body_html,
      web_url = excluded.web_url,
      categories = excluded.categories,
      is_internal = excluded.is_internal
    returning id, message_id, has_attachments, (xmax = 0) as inserted
  `;

  return { params, query };
}

async function upsertEmailsBatch(
  sql: postgres.Sql,
  records: EmailUpsertRecord[]
): Promise<UpsertedEmailRow[]> {
  if (records.length === 0) {
    return [];
  }
  const { query, params } = buildEmailUpsertQuery(records);
  return await sql.unsafe<UpsertedEmailRow[]>(query, params);
}

async function getExistingAttachmentStubCounts(
  sql: postgres.Sql,
  emailIds: number[]
): Promise<Map<number, number>> {
  if (emailIds.length === 0) {
    return new Map();
  }
  const placeholders = emailIds.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql.unsafe<Array<{ count: number; email_id: number }>>(
    `
      select email_id, count(*)::int as count
      from documents
      where source = 'email_attachment'
        and email_id in (${placeholders})
      group by email_id
    `,
    emailIds
  );
  return new Map(rows.map((row) => [row.email_id, row.count]));
}

async function listFileAttachments(mailboxEmail: string, messageId: string): Promise<GraphAttachment[]> {
  const response = await graphJson<{ value: GraphAttachment[] }>(
    `users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`
  );
  return response.value.filter((attachment) => !attachment.isInline);
}

function buildAttachmentStubUpsertQuery(
  emailId: number,
  attachments: GraphAttachment[]
): { params: unknown[]; query: string } {
  const params: unknown[] = [];
  const values = attachments.map((attachment, index) => {
    const row = [
      "email_attachment",
      emailId,
      attachment.id,
      attachment.name,
      attachment.contentType ?? null,
      attachment.size ?? null,
      "unknown",
      "pending",
    ];
    params.push(...row);
    const offset = index * row.length;
    return `(${row.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
  });

  const query = `
    insert into documents (
      source,
      email_id,
      outlook_attachment_id,
      file_name,
      content_type,
      file_size,
      document_type,
      extraction_status
    )
    values ${values.join(", ")}
    on conflict (email_id, outlook_attachment_id)
      where source = 'email_attachment' and outlook_attachment_id is not null
    do update set
      file_name = excluded.file_name,
      content_type = excluded.content_type,
      file_size = excluded.file_size,
      updated_at = now()
  `;

  return { params, query };
}

async function upsertAttachmentStubs(
  sql: postgres.Sql,
  emailId: number,
  attachments: GraphAttachment[]
): Promise<void> {
  if (attachments.length === 0) {
    return;
  }
  const { query, params } = buildAttachmentStubUpsertQuery(emailId, attachments);
  await sql.unsafe(query, params);
}

async function updateEmailAttachmentNames(
  sql: postgres.Sql,
  emailId: number,
  attachmentNames: string[]
): Promise<void> {
  await sql`
    update emails
    set attachment_names = ${JSON.stringify(attachmentNames)}
    where id = ${emailId}
  `;
}

async function resolveSyncSinceIso(
  sql: postgres.Sql,
  mailboxId: number,
  options: CliOptions
): Promise<string> {
  if (options.fullHistory) {
    return FULL_HISTORY_SINCE_ISO;
  }
  if (options.sinceIso) {
    return options.sinceIso;
  }
  const row = (await sql<{ max_received_at: string | null }[]>`
    select max(received_at) as max_received_at
    from emails
    where mailbox_id = ${mailboxId}
  `)[0];
  if (!row?.max_received_at) {
    return FULL_HISTORY_SINCE_ISO;
  }
  const since = new Date(Date.parse(row.max_received_at) - options.syncOverlapHours * 60 * 60 * 1000);
  return since.toISOString();
}

async function refreshMailboxStats(sql: postgres.Sql, mailboxId: number): Promise<void> {
  await sql`
    update mailboxes
    set email_count = coalesce((
      select count(*)::int
      from emails
      where mailbox_id = ${mailboxId}
    ), 0),
        last_sync_at = now(),
        updated_at = now()
    where id = ${mailboxId}
  `;
}

async function syncMailbox(
  sql: postgres.Sql,
  mailbox: MailboxRow,
  options: CliOptions
): Promise<SyncStats> {
  const sinceIso = await resolveSyncSinceIso(sql, mailbox.id, options);
  const folderNamesById = new Map<string, string>();
  let url = `users/${encodeURIComponent(mailbox.email)}/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}&$select=${EMAIL_FIELDS}&$orderby=receivedDateTime desc&$top=${options.pageSize}`;
  let pages = 0;
  const stats: SyncStats = {
    attachmentsStubbed: 0,
    emailsFetched: 0,
    emailsInserted: 0,
    emailsUpdated: 0,
    mailboxes: 1,
  };

  console.log(`[sync] mailbox=${mailbox.email} since=${sinceIso}`);

  while (url) {
    if (options.limitPagesPerMailbox && pages >= options.limitPagesPerMailbox) {
      console.log(`[sync] mailbox=${mailbox.email} reached page limit=${options.limitPagesPerMailbox}`);
      break;
    }

    const response = await graphJson<GraphListResponse>(url);
    const page = dedupeById(response.value);
    pages += 1;
    stats.emailsFetched += page.length;

    await hydrateFolderNames(mailbox.email, page, folderNamesById);
    const records = page.map((email) => buildEmailRecord(email, mailbox.id, folderNamesById));

    let upserted: UpsertedEmailRow[] = [];
    if (!options.dryRun) {
      upserted = await upsertEmailsBatch(sql, records);
      stats.emailsInserted += upserted.filter((row) => row.inserted).length;
      stats.emailsUpdated += upserted.filter((row) => !row.inserted).length;
    }

    const idsByMessageId = new Map(upserted.map((row) => [row.message_id, row]));
    const attachmentCandidates = page.filter((email) => email.hasAttachments);
    const emailIdsForCandidates = attachmentCandidates
      .map((email) => idsByMessageId.get(email.id)?.id)
      .filter((id): id is number => Number.isFinite(id));

    const existingStubCounts = options.dryRun
      ? new Map<number, number>()
      : await getExistingAttachmentStubCounts(sql, emailIdsForCandidates);

    for (const email of attachmentCandidates) {
      const dbRow = idsByMessageId.get(email.id);
      if (!dbRow) {
        continue;
      }
      if ((existingStubCounts.get(dbRow.id) ?? 0) > 0) {
        continue;
      }

      const attachments = await listFileAttachments(mailbox.email, email.id);
      if (!options.dryRun) {
        await upsertAttachmentStubs(sql, dbRow.id, attachments);
        await updateEmailAttachmentNames(
          sql,
          dbRow.id,
          attachments.map((attachment) => attachment.name)
        );
      }
      stats.attachmentsStubbed += attachments.length;
    }

    console.log(
      `[sync] mailbox=${mailbox.email} pages=${pages} fetched=${stats.emailsFetched} inserted=${stats.emailsInserted} updated=${stats.emailsUpdated} stubs=${stats.attachmentsStubbed}`
    );

    url = response["@odata.nextLink"] ?? "";
  }

  if (!options.dryRun) {
    await refreshMailboxStats(sql, mailbox.id);
  }

  console.log(
    `[sync] done mailbox=${mailbox.email} fetched=${stats.emailsFetched} inserted=${stats.emailsInserted} updated=${stats.emailsUpdated} stubs=${stats.attachmentsStubbed}`
  );
  return stats;
}

function safePathSegment(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length ? cleaned : "item";
}

function safeMailboxSegment(mailboxEmail: string): string {
  return safePathSegment(mailboxEmail.toLowerCase().replaceAll("@", "_at_"));
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function buildEmailFolderPath(archiveDir: string, row: AttachmentExportRow): string {
  const receivedIso = normalizeTimestamp(row.received_at);
  const received = new Date(receivedIso);
  const yyyy = Number.isNaN(received.getTime()) ? "unknown-year" : String(received.getUTCFullYear());
  const mm = Number.isNaN(received.getTime())
    ? "unknown-month"
    : String(received.getUTCMonth() + 1).padStart(2, "0");
  const dd = Number.isNaN(received.getTime())
    ? "unknown-day"
    : String(received.getUTCDate()).padStart(2, "0");
  const stamp = Number.isNaN(received.getTime())
    ? "unknown-time"
    : receivedIso.replaceAll(":", "-");

  return join(
    archiveDir,
    "mailboxes",
    safeMailboxSegment(row.mailbox_email),
    yyyy,
    mm,
    dd,
    `${stamp}__email-${row.email_id}`
  );
}

function normalizeTimestamp(value: Date | string | null | undefined): string {
  if (!value) {
    return "unknown-timestamp";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function buildAttachmentLinkPath(archiveDir: string, row: AttachmentExportRow): string {
  return join(
    buildEmailFolderPath(archiveDir, row),
    "attachments",
    `${row.document_id}__${safePathSegment(row.file_name)}`
  );
}

function buildBlobPath(archiveDir: string, contentHash: string): string {
  return join(archiveDir, "blobs", contentHash.slice(0, 2), contentHash);
}

function buildManifestDir(archiveDir: string): string {
  return join(archiveDir, "manifest");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function createHashingTransform(hash: ReturnType<typeof createHash>): Transform {
  return new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
}

async function streamFileToTempWithHash(
  sourcePath: string,
  tempDir: string
): Promise<{ contentHash: string; tempPath: string }> {
  const hash = createHash("sha256");
  const tempPath = join(tempDir, `${randomUUID()}.part`);
  const readStream = createReadStream(sourcePath);
  const writeStream = createWriteStream(tempPath);
  await pipeline(readStream, createHashingTransform(hash), writeStream);
  return { contentHash: hash.digest("hex"), tempPath };
}

async function copyPathToTempWithoutHash(
  sourcePath: string,
  tempDir: string
): Promise<string> {
  const tempPath = join(tempDir, `${randomUUID()}.part`);
  await copyFile(sourcePath, tempPath);
  return tempPath;
}

async function downloadGraphAttachmentToTemp(
  mailboxEmail: string,
  messageId: string,
  attachmentId: string,
  tempDir: string,
  knownHash: string | null
): Promise<{ contentHash: string; tempPath: string }> {
  const tempPath = join(tempDir, `${randomUUID()}.part`);
  const response = await graphFetch(
    `users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    { headers: {}, signal: AbortSignal.timeout(GRAPH_ATTACHMENT_TIMEOUT_MS) }
  );

  if (!response.body) {
    throw new Error("Graph attachment response had no body");
  }

  const webStream = Readable.fromWeb(response.body as globalThis.ReadableStream);
  const writeStream = createWriteStream(tempPath);

  if (knownHash) {
    await pipeline(webStream, writeStream);
    return { contentHash: knownHash, tempPath };
  }

  const hash = createHash("sha256");
  await pipeline(webStream, createHashingTransform(hash), writeStream);
  return { contentHash: hash.digest("hex"), tempPath };
}

async function promoteTempToBlob(
  tempPath: string,
  blobPath: string
): Promise<void> {
  await ensureDir(dirname(blobPath));
  try {
    await rename(tempPath, blobPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EEXIST") {
      await unlink(tempPath).catch(() => undefined);
      return;
    }
    throw error;
  }
}

async function ensureHardLink(blobPath: string, targetPath: string): Promise<"copied" | "linked" | "skipped"> {
  await ensureDir(dirname(targetPath));
  for (let attempt = 1; attempt <= BLOB_LINK_MAX_ATTEMPTS; attempt += 1) {
    if (await pathExists(targetPath)) {
      return "skipped";
    }

    try {
      await link(blobPath, targetPath);
      return "linked";
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EEXIST") {
        return "skipped";
      }

      if (err.code === "EXDEV" || err.code === "EPERM") {
        try {
          await copyFile(blobPath, targetPath);
          return "copied";
        } catch (copyError) {
          const copyErr = copyError as NodeJS.ErrnoException;
          if (copyErr.code === "EEXIST") {
            return "skipped";
          }
          if (copyErr.code !== "ENOENT" || attempt === BLOB_LINK_MAX_ATTEMPTS) {
            throw copyError;
          }
        }
      } else if (err.code !== "ENOENT" || attempt === BLOB_LINK_MAX_ATTEMPTS) {
        throw error;
      }

      // With concurrent workers, another task may still be promoting the blob path.
      await waitForPath(blobPath, 1, 0);
      await sleep(BLOB_LINK_RETRY_BASE_DELAY_MS * attempt);
      continue;
    }
  }

  throw new Error(`Blob link retry loop exhausted for ${blobPath}`);
}

async function updateArchivedAttachmentLocation(
  sql: postgres.Sql,
  documentId: number,
  localPath: string,
  contentHash: string | null
): Promise<void> {
  await sql`
    update documents
    set local_path = ${localPath},
        content_hash = coalesce(content_hash, ${contentHash}),
        extraction_status = 'downloaded',
        extraction_error = null,
        downloaded_at = coalesce(downloaded_at, now()),
        updated_at = now()
    where id = ${documentId}
  `;
}

function summarizeFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split("\n")[0]?.trim() || "Unknown failure";
  const normalized = firstLine.replace(/\s+/g, " ");
  return normalized.slice(0, 1000);
}

async function markAttachmentArchiveFailure(
  sql: postgres.Sql,
  documentId: number,
  error: unknown
): Promise<void> {
  await sql`
    update documents
    set extraction_status = 'failed',
        extraction_error = ${summarizeFailure(error)},
        extraction_attempts = coalesce(extraction_attempts, 0) + 1,
        last_attempted_at = now(),
        updated_at = now()
    where id = ${documentId}
  `;
}

async function writeEmailContext(row: AttachmentExportRow, archiveDir: string): Promise<void> {
  const emailDir = buildEmailFolderPath(archiveDir, row);
  await ensureDir(emailDir);

  const emailJsonPath = join(emailDir, "message.json");
  const emailMdPath = join(emailDir, "message.md");

  if (!(await pathExists(emailJsonPath))) {
    const payload = {
      emailId: row.email_id,
      messageId: row.message_id,
      internetMessageId: row.internet_message_id,
      mailbox: row.mailbox_email,
      folderId: row.folder_id,
      folderName: row.folder_name,
      conversationId: row.conversation_id,
      receivedAt: normalizeTimestamp(row.received_at),
      subject: row.subject,
      from: {
        email: row.from_email,
        name: row.from_name,
      },
      to: parseJsonStringArray(row.to_emails),
      cc: parseJsonStringArray(row.cc_emails),
      webUrl: row.web_url,
      bodyPreview: row.body_preview,
      bodyFull: row.body_full,
      bodyHtml: row.body_html,
      attachmentsDir: join(emailDir, "attachments"),
    };
    await writeFile(emailJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  if (!(await pathExists(emailMdPath))) {
    const bodyText = row.body_full?.trim() || row.body_preview?.trim() || "(no body text captured)";
    const lines = [
      `Subject: ${row.subject ?? ""}`,
      `Mailbox: ${row.mailbox_email}`,
      `Received: ${normalizeTimestamp(row.received_at)}`,
      `From: ${row.from_name ? `${row.from_name} <${row.from_email ?? ""}>` : row.from_email ?? ""}`,
      `To: ${parseJsonStringArray(row.to_emails).join(", ")}`,
      `CC: ${parseJsonStringArray(row.cc_emails).join(", ")}`,
      `Folder: ${row.folder_name ?? ""}`,
      `Web URL: ${row.web_url ?? ""}`,
      `Message ID: ${row.message_id}`,
      `Internet Message ID: ${row.internet_message_id ?? ""}`,
      "",
      bodyText,
      "",
    ];
    await writeFile(emailMdPath, `${lines.join("\n")}\n`);
  }
}

async function getSelectedMailboxes(
  sql: postgres.Sql,
  mailboxEmails: string[]
): Promise<MailboxRow[]> {
  if (mailboxEmails.length === 0) {
    return await sql<MailboxRow[]>`
      select id, email
      from mailboxes
      where email like ${`%@${DESERT_DOMAIN}`}
      order by email
    `;
  }

  return await sql<MailboxRow[]>`
    select id, email
    from mailboxes
    where email in ${sql(mailboxEmails)}
    order by email
  `;
}

async function getAttachmentBatch(
  sql: postgres.Sql,
  afterDocumentId: number,
  limit: number,
  mailboxEmails: string[],
  archiveDir: string
): Promise<AttachmentExportRow[]> {
  const mailboxFilter =
    mailboxEmails.length > 0
      ? sql`and m.email in ${sql(mailboxEmails)}`
      : sql``;
  const archivePrefix = `${archiveDir}/%`;

  return await sql<AttachmentExportRow[]>`
    select
      d.id as document_id,
      d.email_id,
      d.outlook_attachment_id,
      d.file_name,
      d.content_type,
      d.file_size,
      d.storage_path,
      d.local_path,
      d.downloaded_at,
      d.content_hash,
      e.message_id,
      e.internet_message_id,
      e.subject,
      e.received_at,
      e.from_email,
      e.from_name,
      e.to_emails,
      e.cc_emails,
      e.web_url,
      e.folder_id,
      e.folder_name,
      e.conversation_id,
      e.body_preview,
      e.body_full,
      e.body_html,
      m.email as mailbox_email
    from documents d
    join emails e on e.id = d.email_id
    join mailboxes m on m.id = e.mailbox_id
    where d.source = 'email_attachment'
      and d.id > ${afterDocumentId}
      and coalesce(d.extraction_status, 'pending') <> 'failed'
      and (d.local_path is null or d.local_path not like ${archivePrefix})
      ${mailboxFilter}
    order by d.id
    limit ${limit}
  `;
}

async function findReusableSourcePath(row: AttachmentExportRow): Promise<string | null> {
  if (row.local_path && existsSync(row.local_path)) {
    return row.local_path;
  }
  if (row.storage_path && existsSync(row.storage_path)) {
    return row.storage_path;
  }
  return null;
}

async function ensureArchiveLayout(archiveDir: string): Promise<void> {
  await ensureDir(join(archiveDir, ".tmp"));
  await ensureDir(join(archiveDir, "mailboxes"));
  await ensureDir(join(archiveDir, "blobs"));
  await ensureDir(buildManifestDir(archiveDir));
}

async function materializeAttachmentBlob(
  row: AttachmentExportRow,
  archiveDir: string
): Promise<{ blobPath: string; contentHash: string; source: "existing-blob" | "graph-download" | "source-file" }> {
  const tempDir = join(archiveDir, ".tmp");
  await ensureDir(tempDir);

  const knownHash = row.content_hash?.trim() || null;
  if (knownHash) {
    const blobPath = buildBlobPath(archiveDir, knownHash);
    if (await pathExists(blobPath)) {
      return { blobPath, contentHash: knownHash, source: "existing-blob" };
    }
  }

  const sourcePath = await findReusableSourcePath(row);
  if (sourcePath) {
    if (knownHash) {
      const blobPath = buildBlobPath(archiveDir, knownHash);
      const tempPath = await copyPathToTempWithoutHash(sourcePath, tempDir);
      await promoteTempToBlob(tempPath, blobPath);
      return { blobPath, contentHash: knownHash, source: "source-file" };
    }

    const { contentHash, tempPath } = await streamFileToTempWithHash(sourcePath, tempDir);
    const blobPath = buildBlobPath(archiveDir, contentHash);
    await promoteTempToBlob(tempPath, blobPath);
    return { blobPath, contentHash, source: "source-file" };
  }

  if (!(row.message_id && row.outlook_attachment_id && row.mailbox_email)) {
    throw new Error("Attachment row is missing message_id/outlook_attachment_id/mailbox_email");
  }

  const { contentHash, tempPath } = await downloadGraphAttachmentToTemp(
    row.mailbox_email,
    row.message_id,
    row.outlook_attachment_id,
    tempDir,
    knownHash
  );
  const blobPath = buildBlobPath(archiveDir, contentHash);
  await promoteTempToBlob(tempPath, blobPath);
  return { blobPath, contentHash, source: "graph-download" };
}

async function archiveOneAttachment(
  sql: postgres.Sql,
  row: AttachmentExportRow,
  archiveDir: string,
  dryRun: boolean
): Promise<{ bytes: bigint; mode: keyof ArchiveStats | "failed" }> {
  const targetPath = buildAttachmentLinkPath(archiveDir, row);

  if (row.local_path === targetPath && (await pathExists(targetPath))) {
    if (!dryRun) {
      await writeEmailContext(row, archiveDir);
      await updateArchivedAttachmentLocation(sql, row.document_id, targetPath, row.content_hash?.trim() || null);
    }
    return { bytes: BigInt(0), mode: "linkedFromTargetFile" };
  }

  if (!dryRun) {
    await writeEmailContext(row, archiveDir);
  }

  if (await pathExists(targetPath)) {
    if (!dryRun) {
      await updateArchivedAttachmentLocation(sql, row.document_id, targetPath, row.content_hash?.trim() || null);
    }
    return { bytes: BigInt(0), mode: "linkedFromTargetFile" };
  }

  const knownHash = row.content_hash?.trim() || null;
  if (knownHash) {
    const blobPath = buildBlobPath(archiveDir, knownHash);
    if (await pathExists(blobPath)) {
      if (!dryRun) {
        await ensureHardLink(blobPath, targetPath);
        await updateArchivedAttachmentLocation(sql, row.document_id, targetPath, knownHash);
      }
      return { bytes: BigInt(0), mode: "linkedFromExistingBlob" };
    }
  }

  if (dryRun) {
    return { bytes: BigInt(row.file_size ?? 0), mode: "linkedNewDownload" };
  }

  const { blobPath, contentHash, source } = await materializeAttachmentBlob(row, archiveDir);
  const linkMode = await ensureHardLink(blobPath, targetPath);
  await updateArchivedAttachmentLocation(sql, row.document_id, targetPath, contentHash);
  const fileStat = await stat(blobPath).catch(() => null);
  const bytes = BigInt(fileStat?.size ?? row.file_size ?? 0);

  if (source === "existing-blob") {
    return { bytes: BigInt(0), mode: "linkedFromExistingBlob" };
  }
  if (source === "source-file") {
    return { bytes: BigInt(0), mode: "linkedFromSourceFile" };
  }
  if (linkMode === "copied") {
    return { bytes, mode: "linkedNewDownload" };
  }
  return { bytes, mode: "linkedNewDownload" };
}

async function runArchivePhase(
  sql: postgres.Sql,
  options: CliOptions
): Promise<ArchiveStats> {
  await ensureArchiveLayout(options.archiveDir);

  const stats: ArchiveStats = {
    bytesMaterialized: BigInt(0),
    failed: 0,
    linkedFromExistingBlob: 0,
    linkedFromSourceFile: 0,
    linkedFromTargetFile: 0,
    linkedNewDownload: 0,
    processed: 0,
  };

  let afterDocumentId = 0;
  let remaining = options.limitAttachments;

  while (remaining === null || remaining > 0) {
    const batchSize =
      remaining === null ? options.attachmentBatchSize : Math.min(options.attachmentBatchSize, remaining);
    const rows = await getAttachmentBatch(
      sql,
      afterDocumentId,
      batchSize,
      options.mailboxEmails,
      options.archiveDir
    );
    if (rows.length === 0) {
      break;
    }
    afterDocumentId = rows.at(-1)?.document_id ?? afterDocumentId;

    let cursor = 0;
    const workers = Array.from({ length: options.attachmentConcurrency }, async () => {
      while (true) {
        const row = rows[cursor];
        cursor += 1;
        if (!row) {
          return;
        }

        try {
          const result = await archiveOneAttachment(sql, row, options.archiveDir, options.dryRun);
          stats.processed += 1;
          stats.bytesMaterialized += result.bytes;
          if (result.mode !== "failed") {
            stats[result.mode] += 1;
          }
        } catch (error) {
          stats.processed += 1;
          stats.failed += 1;
          if (!options.dryRun) {
            await markAttachmentArchiveFailure(sql, row.document_id, error);
          }
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[archive] failed document=${row.document_id} mailbox=${row.mailbox_email} attachment=${row.file_name} ${message}`
          );
        }

        if (stats.processed % 25 === 0) {
          console.log(
            `[archive] processed=${stats.processed} download=${stats.linkedNewDownload} existing_blob=${stats.linkedFromExistingBlob} source_file=${stats.linkedFromSourceFile} existing_target=${stats.linkedFromTargetFile} failed=${stats.failed}`
          );
        }
      }
    });

    await Promise.all(workers);
    if (remaining !== null) {
      remaining -= rows.length;
    }
  }

  console.log(
    `[archive] done processed=${stats.processed} download=${stats.linkedNewDownload} existing_blob=${stats.linkedFromExistingBlob} source_file=${stats.linkedFromSourceFile} existing_target=${stats.linkedFromTargetFile} failed=${stats.failed} bytes=${stats.bytesMaterialized.toString()}`
  );
  return stats;
}

async function writeArchiveReadme(archiveDir: string): Promise<void> {
  const readmePath = join(archiveDir, "README.txt");
  const text = [
    "Desert Services email attachment archive",
    "",
    "Layout:",
    "  mailboxes/<mailbox>/<yyyy>/<mm>/<dd>/<timestamp>__email-<id>/message.json",
    "  mailboxes/<mailbox>/<yyyy>/<mm>/<dd>/<timestamp>__email-<id>/message.md",
    "  mailboxes/<mailbox>/<yyyy>/<mm>/<dd>/<timestamp>__email-<id>/attachments/<document_id>__<filename>",
    "  blobs/<sha256-prefix>/<sha256>    content-addressed storage backing the hard-linked attachment files",
    "  manifest/attachments.tsv          searchable flat index for archived attachments",
    "  manifest/summary.json             archive summary snapshot",
    "",
    "The files under mailboxes/.../attachments are hard links into blobs/ so duplicate attachments do not multiply storage.",
    "",
  ].join("\n");
  await writeFile(readmePath, `${text}\n`);
}

async function writeManifestFiles(
  sql: postgres.Sql,
  options: CliOptions
): Promise<void> {
  await ensureArchiveLayout(options.archiveDir);
  await ensureDir(buildManifestDir(options.archiveDir));

  const attachmentsTsvPath = join(buildManifestDir(options.archiveDir), "attachments.tsv");
  const summaryPath = join(buildManifestDir(options.archiveDir), "summary.json");

  const mailboxFilter =
    options.mailboxEmails.length > 0
      ? sql`and m.email in ${sql(options.mailboxEmails)}`
      : sql``;
  const archivePrefix = `${options.archiveDir}/%`;

  const header = [
    "document_id",
    "email_id",
    "mailbox_email",
    "received_at",
    "from_email",
    "subject",
    "file_name",
    "file_size",
    "content_hash",
    "local_path",
    "message_id",
    "internet_message_id",
    "web_url",
  ].join("\t");
  await writeFile(attachmentsTsvPath, `${header}\n`);

  let afterDocumentId = 0;
  while (true) {
    const rows = await sql<ManifestRow[]>`
      select
        d.id as document_id,
        e.id as email_id,
        m.email as mailbox_email,
        e.received_at,
        e.from_email,
        e.subject,
        d.file_name,
        d.file_size,
        d.content_hash,
        d.local_path,
        e.message_id,
        e.internet_message_id,
        e.web_url
      from documents d
      join emails e on e.id = d.email_id
      join mailboxes m on m.id = e.mailbox_id
      where d.source = 'email_attachment'
        and d.id > ${afterDocumentId}
        and d.local_path like ${archivePrefix}
        ${mailboxFilter}
      order by d.id
      limit ${options.manifestBatchSize}
    `;

    if (rows.length === 0) {
      break;
    }

    afterDocumentId = rows.at(-1)?.document_id ?? afterDocumentId;
    const chunk = rows
      .map((row) =>
        [
          row.document_id,
          row.email_id,
          row.mailbox_email,
          normalizeTimestamp(row.received_at),
          row.from_email ?? "",
          (row.subject ?? "").replaceAll("\t", " ").replaceAll("\n", " "),
          row.file_name.replaceAll("\t", " ").replaceAll("\n", " "),
          row.file_size ?? "",
          row.content_hash ?? "",
          row.local_path,
          row.message_id,
          row.internet_message_id ?? "",
          row.web_url ?? "",
        ].join("\t")
      )
      .join("\n");

    await appendFile(attachmentsTsvPath, `${chunk}\n`);
  }

  const summary = (
    await sql<Array<{
      archived_attachment_count: number;
      archived_total_bytes: string;
      distinct_mailboxes: number;
      latest_received_at: string | null;
    }>>`
      select
        count(*)::int as archived_attachment_count,
        coalesce(sum(file_size), 0)::bigint as archived_total_bytes,
        count(distinct m.email)::int as distinct_mailboxes,
        max(e.received_at) as latest_received_at
      from documents d
      join emails e on e.id = d.email_id
      join mailboxes m on m.id = e.mailbox_id
      where d.source = 'email_attachment'
        and d.local_path like ${archivePrefix}
        ${mailboxFilter}
    `
  )[0];

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeArchiveReadme(options.archiveDir);
  console.log(
    `[manifest] attachments=${summary.archived_attachment_count} bytes=${summary.archived_total_bytes} mailboxes=${summary.distinct_mailboxes}`
  );
}

function formatBytes(value: bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required");
  }
  if (!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)) {
    throw new Error("AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET are required");
  }

  const sql = postgres(process.env.DATABASE_URL, {
    max: Math.max(2, options.attachmentConcurrency + 1),
    prepare: false,
  });

  try {
    const mailboxes = await getSelectedMailboxes(sql, options.mailboxEmails);
    if (mailboxes.length === 0) {
      throw new Error("No matching mailboxes found");
    }

    console.log(
      `[start] phase=${options.phase} mailboxes=${mailboxes.length} archive_dir=${options.archiveDir} dry_run=${options.dryRun}`
    );

    if (options.phase === "sync" || options.phase === "all") {
      for (const mailbox of mailboxes) {
        await syncMailbox(sql, mailbox, options);
      }
    }

    if (options.phase === "archive" || options.phase === "all") {
      const archiveStats = await runArchivePhase(sql, {
        ...options,
        mailboxEmails: mailboxes.map((mailbox) => mailbox.email),
      });
      console.log(
        `[archive] materialized=${formatBytes(archiveStats.bytesMaterialized)} processed=${archiveStats.processed}`
      );
    }

    if (options.phase === "manifest" || options.phase === "all" || options.phase === "archive") {
      await writeManifestFiles(sql, {
        ...options,
        mailboxEmails: mailboxes.map((mailbox) => mailbox.email),
      });
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[done] phase=${options.phase} elapsed_sec=${elapsedSeconds}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[fatal] ${message}`);
  process.exit(1);
});
