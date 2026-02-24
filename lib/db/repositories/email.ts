/**
 * Email Repository
 */

import { db } from "@lib/db/client";
import type {
  BodyLinkScanStatus,
  ClassificationMethod,
  Email,
  EmailClassification,
  InsertEmailData,
} from "@lib/db/types";
import { isSpam } from "@lib/email/spam-filter";

// ============================================
// Row Parser
// ============================================

export function parseEmailRow(row: Record<string, unknown>): Email {
  return {
    id: row.id as number,
    messageId: row.message_id as string,
    internetMessageId: row.internet_message_id as string | null,
    mailboxId: row.mailbox_id as number,
    conversationId: row.conversation_id as string | null,
    subject: row.subject as string | null,
    normalizedSubject: row.normalized_subject as string | null,
    fromEmail: row.from_email as string | null,
    fromName: row.from_name as string | null,
    fromDomain: row.from_domain as string | null,
    toEmails: JSON.parse((row.to_emails as string) || "[]"),
    ccEmails: JSON.parse((row.cc_emails as string) || "[]"),
    receivedAt: row.received_at as string,
    hasAttachments: (row.has_attachments as number) === 1,
    attachmentNames: JSON.parse((row.attachment_names as string) || "[]"),
    bodyPreview: row.body_preview as string | null,
    bodyFull: row.body_full as string | null,
    bodyHtml: row.body_html as string | null,
    webUrl: row.web_url as string | null,
    categories: JSON.parse((row.categories as string) || "[]"),

    // Classification
    classification: row.classification as EmailClassification | null,
    classificationConfidence: row.classification_confidence as number | null,
    classificationMethod:
      row.classification_method as ClassificationMethod | null,

    // Linking text fields
    projectName: row.project_name as string | null,
    contractorName: row.contractor_name as string | null,
    mondayEstimateId: row.monday_estimate_id as string | null,
    notionProjectId: row.notion_project_id as string | null,

    // Foreign key relationships
    accountId: row.account_id as number | null,
    projectId: row.project_id as number | null,

    // Threading
    threadId: row.thread_id as string | null,

    // Internal/Forwarding flags
    isInternal: (row.is_internal as number) === 1,
    isForwarded: (row.is_forwarded as number) === 1,
    originalSenderEmail: row.original_sender_email as string | null,
    originalSenderDomain: row.original_sender_domain as string | null,

    // Platform extraction
    isPlatformEmail: (row.is_platform_email as number) === 1,
    platformName: row.platform_name as string | null,
    realSenderName: row.real_sender_name as string | null,
    realSenderCompany: row.real_sender_company as string | null,
    realSenderEmail: row.real_sender_email as string | null,
    realSenderDomain: row.real_sender_domain as string | null,
    isExcluded: (row.is_excluded as number) === 1,

    // Body-link scanning
    bodyLinkScanStatus: row.body_link_scan_status as BodyLinkScanStatus | null,
    bodyLinkScannedAt: row.body_link_scanned_at as string | null,
    bodyLinkScanError: row.body_link_scan_error as string | null,
    bodyLinkScanLinksFound: Number(row.body_link_scan_links_found ?? 0),
    bodyLinkScanAttachmentsAdded: Number(
      row.body_link_scan_attachments_added ?? 0
    ),
    bodyLinkScanAttempts: Number(row.body_link_scan_attempts ?? 0),
    bodyLinkScanVersion: Number(row.body_link_scan_version ?? 0),

    createdAt: row.created_at as string,
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

function parseAttachmentNamesJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((name): name is string => typeof name === "string");
  } catch {
    return [];
  }
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

  return (await db
    .query(
      `SELECT classification, is_excluded FROM domain_rules
       WHERE $1 LIKE '%' || domain ORDER BY length(domain) DESC LIMIT 1`
    )
    .get(fromDomain)) as DomainRuleRow | null;
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
      message_id, internet_message_id, mailbox_id, conversation_id, subject, normalized_subject, from_email, from_name,
      to_emails, cc_emails, received_at, has_attachments, attachment_names,
      body_preview, body_full, body_html, web_url, categories, is_excluded, classification, classification_method
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT(message_id) DO UPDATE SET
      internet_message_id = excluded.internet_message_id,
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

export async function insertEmail(data: InsertEmailData): Promise<number> {
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

  return await getInsertedEmailId(data.messageId);
}

export async function getEmailByMessageId(
  messageId: string
): Promise<Email | null> {
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM emails WHERE message_id = $1"
    )
    .get(messageId);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

export async function getEmailById(id: number): Promise<Email | null> {
  const row = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE id = $1"
    )
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
    .query<Record<string, unknown>, [number]>(
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
    .query<Record<string, unknown>, [string, number]>(
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
    .query<Record<string, unknown>, (string | number)[]>(
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
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails ORDER BY id DESC LIMIT $1"
    )
    .all(limit);
  return rows.map(parseEmailRow);
}

export async function getEmailsWithAttachments(limit = 100): Promise<Email[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
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
