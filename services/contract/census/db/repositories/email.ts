/**
 * Email Repository
 */
import { db } from "../connection";
import type {
  ClassificationMethod,
  Email,
  EmailClassification,
  InsertEmailData,
} from "../types";

// ============================================
// Row Parser
// ============================================

export function parseEmailRow(row: Record<string, unknown>): Email {
  return {
    id: row.id as number,
    messageId: row.message_id as string,
    mailboxId: row.mailbox_id as number,
    conversationId: row.conversation_id as string | null,
    subject: row.subject as string | null,
    fromEmail: row.from_email as string | null,
    fromName: row.from_name as string | null,
    toEmails: JSON.parse((row.to_emails as string) || "[]"),
    ccEmails: JSON.parse((row.cc_emails as string) || "[]"),
    receivedAt: row.received_at as string,
    hasAttachments: row.has_attachments === 1,
    attachmentNames: JSON.parse((row.attachment_names as string) || "[]"),
    bodyPreview: row.body_preview as string | null,
    webUrl: row.web_url as string | null,
    classification: row.classification as EmailClassification | null,
    classificationConfidence: row.classification_confidence as number | null,
    classificationMethod:
      row.classification_method as ClassificationMethod | null,
    projectName: row.project_name as string | null,
    contractorName: row.contractor_name as string | null,
    mondayEstimateId: row.monday_estimate_id as string | null,
    notionProjectId: row.notion_project_id as string | null,
    accountId: row.account_id as number | null,
    projectId: row.project_id as number | null,
    bodyFull: row.body_full as string | null,
    bodyHtml: row.body_html as string | null,
    categories: JSON.parse((row.categories as string) || "[]"),
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

// ============================================
// CRUD Operations
// ============================================

export function insertEmail(data: InsertEmailData): number {
  const normalized = normalizeSubjectInternal(data.subject ?? null);

  db.run(
    `INSERT INTO emails (
      message_id, mailbox_id, conversation_id, subject, normalized_subject, from_email, from_name,
      to_emails, cc_emails, received_at, has_attachments, attachment_names,
      body_preview, body_full, body_html, web_url, categories
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
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
      categories = excluded.categories`,
    [
      data.messageId,
      data.mailboxId,
      data.conversationId ?? null,
      data.subject ?? null,
      normalized,
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
    ]
  );

  const row = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM emails WHERE message_id = ?"
    )
    .get(data.messageId);

  return row?.id ?? 0;
}

export function getEmailByMessageId(messageId: string): Email | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM emails WHERE message_id = ?"
    )
    .get(messageId);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

export function getEmailById(id: number): Email | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE id = ?"
    )
    .get(id);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

export function updateEmailClassification(
  emailId: number,
  classification: EmailClassification,
  confidence: number,
  method: ClassificationMethod
): void {
  db.run(
    `UPDATE emails
     SET classification = ?, classification_confidence = ?, classification_method = ?
     WHERE id = ?`,
    [classification, confidence, method, emailId]
  );
}

export function updateEmailProjectLink(
  emailId: number,
  data: {
    projectName?: string | null;
    contractorName?: string | null;
    mondayEstimateId?: string | null;
    notionProjectId?: string | null;
  }
): void {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.projectName !== undefined) {
    updates.push("project_name = ?");
    values.push(data.projectName);
  }
  if (data.contractorName !== undefined) {
    updates.push("contractor_name = ?");
    values.push(data.contractorName);
  }
  if (data.mondayEstimateId !== undefined) {
    updates.push("monday_estimate_id = ?");
    values.push(data.mondayEstimateId);
  }
  if (data.notionProjectId !== undefined) {
    updates.push("notion_project_id = ?");
    values.push(data.notionProjectId);
  }

  if (updates.length === 0) {
    return;
  }

  values.push(emailId);
  db.run(`UPDATE emails SET ${updates.join(", ")} WHERE id = ?`, values);
}

// ============================================
// Query Operations
// ============================================

export function getUnclassifiedEmails(limit = 1000): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM emails
       WHERE classification IS NULL
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}

export function getEmailsByClassification(
  classification: EmailClassification,
  limit = 100
): Email[] {
  const rows = db
    .query<Record<string, unknown>, [string, number]>(
      `SELECT * FROM emails
       WHERE classification = ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(classification, limit);

  return rows.map(parseEmailRow);
}

export function getEmailsWithoutProjectLink(
  classifications: EmailClassification[],
  limit = 1000
): Email[] {
  const placeholders = classifications.map(() => "?").join(", ");
  const rows = db
    .query<Record<string, unknown>, (string | number)[]>(
      `SELECT * FROM emails
       WHERE classification IN (${placeholders})
       AND monday_estimate_id IS NULL
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(...classifications, limit);

  return rows.map(parseEmailRow);
}

export function getRecentEmails(limit = 10): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
  return rows.map(parseEmailRow);
}

export function getEmailsWithAttachments(limit = 100): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM emails
       WHERE has_attachments = 1
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}
