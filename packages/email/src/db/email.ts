/**
 * Email Repository
 */

import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import { parseBoolInt, parseJsonArray } from "@lib/db/parsers";
import type {
  BodyLinkScanStatus,
  ClassificationMethod,
  Email,
  EmailClassification,
  InsertEmailData,
} from "@lib/db/types";
import { isSpam } from "@email/spam-filter";

// ============================================
// Row Parser
// ============================================

type EmailRow = Database["public"]["Tables"]["emails"]["Row"];

function parseStringArray(value: unknown): string[] {
  return parseJsonArray(value)
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

export function parseEmailRow(row: EmailRow): Email {
  return {
    id: row.id,
    messageId: row.message_id,
    internetMessageId: row.internet_message_id,
    mailboxId: row.mailbox_id,
    conversationId: row.conversation_id,
    subject: row.subject,
    normalizedSubject: row.normalized_subject,
    fromEmail: row.from_email,
    fromName: row.from_name,
    folderId: row.folder_id,
    folderName: row.folder_name,
    fromDomain: row.from_domain,
    toEmails: parseStringArray(row.to_emails),
    ccEmails: parseStringArray(row.cc_emails),
    receivedAt: row.received_at,
    hasAttachments: parseBoolInt(row.has_attachments),
    attachmentNames: parseStringArray(row.attachment_names),
    bodyPreview: row.body_preview,
    bodyFull: row.body_full,
    bodyHtml: row.body_html,
    webUrl: row.web_url,
    categories: parseStringArray(row.categories),

    // Classification
    classification: row.classification as EmailClassification | null,
    classificationConfidence: row.classification_confidence,
    classificationMethod:
      row.classification_method as ClassificationMethod | null,

    // Linking text fields
    projectName: row.project_name,
    contractorName: row.contractor_name,
    mondayEstimateId: row.monday_estimate_id,
    notionProjectId: row.notion_project_id,

    // Foreign key relationships
    accountId: row.account_id,
    projectId: row.project_id,

    // Threading
    threadId: row.thread_id,

    // Internal/Forwarding flags
    isInternal: parseBoolInt(row.is_internal),
    isForwarded: parseBoolInt(row.is_forwarded),
    originalSenderEmail: row.original_sender_email,
    originalSenderDomain: row.original_sender_domain,

    // Platform extraction
    isPlatformEmail: parseBoolInt(row.is_platform_email),
    platformName: row.platform_name,
    realSenderName: row.real_sender_name,
    realSenderCompany: row.real_sender_company,
    realSenderEmail: row.real_sender_email,
    realSenderDomain: row.real_sender_domain,
    isExcluded: parseBoolInt(row.is_excluded),

    // Body-link scanning
    bodyLinkScanStatus: row.body_link_scan_status as BodyLinkScanStatus | null,
    bodyLinkScannedAt: row.body_link_scanned_at,
    bodyLinkScanError: row.body_link_scan_error,
    bodyLinkScanLinksFound: Number(row.body_link_scan_links_found ?? 0),
    bodyLinkScanAttachmentsAdded: Number(
      row.body_link_scan_attachments_added ?? 0
    ),
    bodyLinkScanAttempts: Number(row.body_link_scan_attempts ?? 0),
    bodyLinkScanVersion: Number(row.body_link_scan_version ?? 0),

    createdAt: row.created_at ?? "",
  };
}

// ============================================
// Helpers
// ============================================

function normalizeSubjectInternal(subject: string | null): string | null {
  if (!subject) {
    return null;
  }
  return subject
    .replace(/^(FW|Fw|fw|RE|Re|re|Fwd|FWD|fwd):\s*/g, "")
    .replace(/^Reminder:\s*/gi, "")
    .replace(/^Completed:\s*/gi, "")
    .replace(/^READY TO BE SIGNED -\s*/gi, "")
    .replace(/^READY TO SIGN:\s*/gi, "")
    .trim();
}

interface DomainRuleRow {
  classification: string | null;
  is_excluded: boolean;
}

function parseAttachmentNamesJson(raw: unknown): string[] {
  return parseStringArray(raw);
}

function getSenderDomain(fromEmail: string | null | undefined): string {
  return fromEmail?.split("@")[1]?.toLowerCase() ?? "";
}

async function getDomainRule(
  fromDomain: string
): Promise<DomainRuleRow | null> {
  if (fromDomain.length === 0) {
    return null;
  }

  return await db
    .query<DomainRuleRow, [string]>(
      `SELECT classification, is_excluded FROM domain_rules
       WHERE $1 LIKE '%' || domain ORDER BY length(domain) DESC LIMIT 1`
    )
    .get(fromDomain);
}

function resolveExclusion(
  data: InsertEmailData,
  rule: DomainRuleRow | null
): {
  excluded: number;
  classification: string | null;
} {
  const spamHit = isSpam(data.fromEmail, data.subject).isSpam;
  return {
    excluded: spamHit || rule?.is_excluded === true ? 1 : 0,
    classification: rule?.classification ?? null,
  };
}

async function reconcileMessageIdByInternetId(
  data: InsertEmailData
): Promise<void> {
  if (!data.internetMessageId) {
    return;
  }

  const existingByInternet = await db
    .query<{ id: number; message_id: string }, [number, string]>(
      `SELECT id, message_id
       FROM emails
       WHERE mailbox_id = $1
         AND internet_message_id = $2
       ORDER BY id
       LIMIT 1`
    )
    .get(data.mailboxId, data.internetMessageId);

  if (
    !existingByInternet?.message_id ||
    existingByInternet.message_id === data.messageId
  ) {
    return;
  }

  const existingByNewMessageId = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM emails WHERE message_id = $1 LIMIT 1"
    )
    .get(data.messageId);

  if (!existingByNewMessageId) {
    await db.run("UPDATE emails SET message_id = $1 WHERE id = $2", [
      data.messageId,
      existingByInternet.id,
    ]);
  }
}

function toEmailUpsertParams(params: {
  data: InsertEmailData;
  normalizedSubject: string | null;
  excluded: number;
  classification: string | null;
}): Array<string | number | null> {
  const { data, normalizedSubject, excluded, classification } = params;

  return [
    data.messageId,
    data.internetMessageId ?? null,
    data.mailboxId,
    data.conversationId ?? null,
    data.folderId ?? null,
    data.folderName ?? null,
    data.subject ?? null,
    normalizedSubject,
    data.fromEmail ?? null,
    data.fromName ?? null,
    JSON.stringify(data.toEmails ?? []),
    JSON.stringify(data.ccEmails ?? []),
    data.receivedAt,
    data.hasAttachments ? 1 : 0,
    JSON.stringify(data.attachmentNames ?? []),
    data.bodyPreview ?? null,
    data.bodyFull ?? null,
    data.bodyHtml ?? null,
    data.webUrl ?? null,
    JSON.stringify(data.categories ?? []),
    excluded,
    classification,
    classification ? "domain_rule" : null,
  ];
}

async function upsertEmailRecord(params: {
  data: InsertEmailData;
  normalizedSubject: string | null;
  excluded: number;
  classification: string | null;
}): Promise<void> {
  await db.run(
    `INSERT INTO emails (
      message_id, internet_message_id, mailbox_id, conversation_id, folder_id, folder_name, subject, normalized_subject, from_email, from_name,
      to_emails, cc_emails, received_at, has_attachments, attachment_names,
      body_preview, body_full, body_html, web_url, categories, is_excluded, classification, classification_method
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    ON CONFLICT(message_id) DO UPDATE SET
      internet_message_id = excluded.internet_message_id,
      folder_id = excluded.folder_id,
      folder_name = excluded.folder_name,
      subject = excluded.subject,
      normalized_subject = excluded.normalized_subject,
      from_email = excluded.from_email,
      from_name = excluded.from_name,
      to_emails = excluded.to_emails,
      cc_emails = excluded.cc_emails,
      has_attachments = excluded.has_attachments,
      attachment_names = excluded.attachment_names,
      body_preview = excluded.body_preview,
      body_full = excluded.body_full,
      body_html = excluded.body_html,
      categories = excluded.categories,
      is_excluded = excluded.is_excluded`,
    toEmailUpsertParams(params)
  );
}

async function getInsertedEmailId(messageId: string): Promise<number> {
  const row = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM emails WHERE message_id = $1"
    )
    .get(messageId);

  return row?.id ?? 0;
}

// ============================================
// CRUD Operations
// ============================================

export interface InsertEmailResult {
  classification: string | null;
  id: number;
  isExcluded: boolean;
}

export async function insertEmail(
  data: InsertEmailData
): Promise<InsertEmailResult> {
  const normalizedSubject = normalizeSubjectInternal(data.subject ?? null);
  const fromDomain = getSenderDomain(data.fromEmail);
  const rule = await getDomainRule(fromDomain);
  const { excluded, classification } = resolveExclusion(data, rule);

  await reconcileMessageIdByInternetId(data);
  await upsertEmailRecord({
    data,
    normalizedSubject,
    excluded,
    classification,
  });

  return {
    classification,
    id: await getInsertedEmailId(data.messageId),
    isExcluded: excluded === 1,
  };
}

export async function getEmailByMessageId(
  messageId: string
): Promise<Email | null> {
  const row = await db
    .query<EmailRow, [string]>("SELECT * FROM emails WHERE message_id = $1")
    .get(messageId);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

export async function getEmailById(id: number): Promise<Email | null> {
  const row = await db
    .query<EmailRow, [number]>("SELECT * FROM emails WHERE id = $1")
    .get(id);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

export async function updateEmailClassification(
  emailId: number,
  classification: EmailClassification,
  confidence: number,
  method: ClassificationMethod
): Promise<void> {
  await db.run(
    `UPDATE emails
     SET classification = $1, classification_confidence = $2, classification_method = $3
     WHERE id = $4`,
    [classification, confidence, method, emailId]
  );
}

export async function updateEmailProjectLink(
  emailId: number,
  data: {
    projectName?: string | null;
    contractorName?: string | null;
    mondayEstimateId?: string | null;
    notionProjectId?: string | null;
  }
): Promise<void> {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  let paramIndex = 1;

  if (data.projectName !== undefined) {
    updates.push(`project_name = $${paramIndex++}`);
    values.push(data.projectName);
  }
  if (data.contractorName !== undefined) {
    updates.push(`contractor_name = $${paramIndex++}`);
    values.push(data.contractorName);
  }
  if (data.mondayEstimateId !== undefined) {
    updates.push(`monday_estimate_id = $${paramIndex++}`);
    values.push(data.mondayEstimateId);
  }
  if (data.notionProjectId !== undefined) {
    updates.push(`notion_project_id = $${paramIndex++}`);
    values.push(data.notionProjectId);
  }

  if (updates.length === 0) {
    return;
  }

  values.push(emailId);
  await db.run(
    `UPDATE emails SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
    values
  );
}

export async function appendEmailAttachmentNames(
  emailId: number,
  attachmentNames: string[]
): Promise<void> {
  if (attachmentNames.length === 0) {
    return;
  }

  const row = await db
    .query<{ attachment_names: string | null }, [number]>(
      "SELECT attachment_names FROM emails WHERE id = $1"
    )
    .get(emailId);

  const existing = parseAttachmentNamesJson(row?.attachment_names);
  const merged = [...new Set([...existing, ...attachmentNames])];

  await db.run(
    "UPDATE emails SET has_attachments = 1, attachment_names = $1 WHERE id = $2",
    [JSON.stringify(merged), emailId]
  );
}

export interface BodyLinkScanState {
  attachmentsAdded: number;
  attempts: number;
  error: string | null;
  linksFound: number;
  scannedAt: string | null;
  status: BodyLinkScanStatus | null;
  version: number;
}

function isMissingBodyLinkScanColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("body_link_scan_") ||
    message.includes("body_link_scanned_at")
  );
}

export async function getBodyLinkScanState(
  emailId: number
): Promise<BodyLinkScanState | null> {
  let row: {
    body_link_scan_attachments_added: number | null;
    body_link_scan_attempts: number | null;
    body_link_scan_error: string | null;
    body_link_scan_links_found: number | null;
    body_link_scanned_at: string | null;
    body_link_scan_status: BodyLinkScanStatus | null;
    body_link_scan_version: number | null;
  } | null = null;
  try {
    row = await db
      .query<
        {
          body_link_scan_attachments_added: number | null;
          body_link_scan_attempts: number | null;
          body_link_scan_error: string | null;
          body_link_scan_links_found: number | null;
          body_link_scanned_at: string | null;
          body_link_scan_status: BodyLinkScanStatus | null;
          body_link_scan_version: number | null;
        },
        [number]
      >(
        `SELECT
           body_link_scan_status,
           body_link_scanned_at,
           body_link_scan_error,
           body_link_scan_links_found,
           body_link_scan_attachments_added,
           body_link_scan_attempts,
           body_link_scan_version
         FROM emails
         WHERE id = $1`
      )
      .get(emailId);
  } catch (error) {
    if (isMissingBodyLinkScanColumnError(error)) {
      return null;
    }
    throw error;
  }

  if (!row) {
    return null;
  }

  return {
    attachmentsAdded: Number(row.body_link_scan_attachments_added ?? 0),
    attempts: Number(row.body_link_scan_attempts ?? 0),
    error: row.body_link_scan_error,
    linksFound: Number(row.body_link_scan_links_found ?? 0),
    scannedAt: row.body_link_scanned_at,
    status: row.body_link_scan_status,
    version: Number(row.body_link_scan_version ?? 0),
  };
}

export function isBodyLinkScanCompleteForVersion(
  state: BodyLinkScanState | null,
  version: number
): boolean {
  if (!state?.scannedAt) {
    return false;
  }
  if (state.version !== version) {
    return false;
  }

  return state.status !== null && state.status !== "pending";
}

export async function recordBodyLinkScanResult(params: {
  attachmentsAdded: number;
  emailId: number;
  error: string | null;
  linksFound: number;
  status: BodyLinkScanStatus;
  version: number;
}): Promise<void> {
  try {
    await db.run(
      `UPDATE emails
       SET body_link_scan_status = $1,
           body_link_scanned_at = now(),
           body_link_scan_error = $2,
           body_link_scan_links_found = $3,
           body_link_scan_attachments_added = $4,
           body_link_scan_attempts = COALESCE(body_link_scan_attempts, 0) + 1,
           body_link_scan_version = $5
       WHERE id = $6`,
      [
        params.status,
        params.error,
        params.linksFound,
        params.attachmentsAdded,
        params.version,
        params.emailId,
      ]
    );
  } catch (error) {
    if (isMissingBodyLinkScanColumnError(error)) {
      return;
    }
    throw error;
  }
}

// ============================================
// Query Operations
// ============================================

export async function getUnclassifiedEmails(limit = 1000): Promise<Email[]> {
  const rows = await db
    .query<EmailRow, [number]>(
      `SELECT * FROM emails
       WHERE classification IS NULL
       ORDER BY received_at DESC
       LIMIT $1`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}

export async function getEmailsByClassification(
  classification: EmailClassification,
  limit = 100
): Promise<Email[]> {
  const rows = await db
    .query<EmailRow, [string, number]>(
      `SELECT * FROM emails
       WHERE classification = $1
       ORDER BY received_at DESC
       LIMIT $2`
    )
    .all(classification, limit);

  return rows.map(parseEmailRow);
}

export async function getEmailsWithoutProjectLink(
  classifications: EmailClassification[],
  limit = 1000
): Promise<Email[]> {
  const placeholders = classifications.map((_, i) => `$${i + 1}`).join(", ");
  const limitIndex = classifications.length + 1;
  const rows = await db
    .query<EmailRow, (string | number)[]>(
      `SELECT * FROM emails
       WHERE classification IN (${placeholders})
       AND monday_estimate_id IS NULL
       ORDER BY received_at DESC
       LIMIT $${limitIndex}`
    )
    .all(...classifications, limit);

  return rows.map(parseEmailRow);
}

export async function getRecentEmails(limit = 10): Promise<Email[]> {
  const rows = await db
    .query<EmailRow, [number]>("SELECT * FROM emails ORDER BY id DESC LIMIT $1")
    .all(limit);
  return rows.map(parseEmailRow);
}

export async function getEmailsWithAttachments(limit = 100): Promise<Email[]> {
  const rows = await db
    .query<EmailRow, [number]>(
      `SELECT * FROM emails
       WHERE has_attachments = 1
       ORDER BY received_at DESC
       LIMIT $1`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}
export async function getLinkedConversationSibling(
  conversationId: string
): Promise<number | null> {
  const row = await db
    .query<{ project_id: number | null }, [string]>(
      "SELECT project_id FROM emails WHERE conversation_id = $1 AND project_id IS NOT NULL LIMIT 1"
    )
    .get(conversationId);
  return row?.project_id ?? null;
}

export async function getSenderProjectStats(fromEmail: string): Promise<{
  projectId: number;
  percentage: number;
} | null> {
  const rows = await db
    .query<{ project_id: number; count: number }, [string]>(
      `SELECT project_id, COUNT(*) as count
       FROM emails
       WHERE from_email = $1 AND project_id IS NOT NULL
       GROUP BY project_id
       ORDER BY count DESC`
    )
    .all(fromEmail);

  const top = rows[0];
  if (!top) {
    return null;
  }

  const totalLinked = rows.reduce((sum, r) => sum + r.count, 0);

  return {
    projectId: top.project_id,
    percentage: top.count / totalLinked,
  };
}
