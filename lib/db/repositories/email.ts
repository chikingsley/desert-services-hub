/**
 * Email Repository
 */
import { db } from "@lib/db/hub";
import type {
  ClassificationMethod,
  Email,
  EmailClassification,
  InsertEmailData,
} from "@lib/db/types";
import { isSpam } from "@lib/spam-filter";

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

export async function insertEmail(data: InsertEmailData): Promise<number> {
  const normalized = normalizeSubjectInternal(data.subject ?? null);

  // Check domain_rules table for classification + exclusion
  const fromDomain = data.fromEmail?.split("@")[1]?.toLowerCase() ?? "";
  const rule = fromDomain
    ? ((await db
        .prepare(
          `SELECT classification, is_excluded FROM domain_rules
           WHERE ? LIKE '%' || domain ORDER BY length(domain) DESC LIMIT 1`
        )
        .get(fromDomain)) as {
        classification: string | null;
        is_excluded: boolean;
      } | null)
    : null;

  // Excluded if: code-level spam check OR domain_rules says so
  const excluded =
    isSpam(data.fromEmail, data.subject).isSpam || rule?.is_excluded ? 1 : 0;
  const classification = rule?.classification ?? null;

  // If we already know this message via internet_message_id in the same mailbox,
  // update that row's Graph message_id to the newest value before upsert.
  // This keeps downstream FK relationships stable when IDs change after moves.
  if (data.internetMessageId) {
    const existingByInternet = await db
      .query<{ id: number; message_id: string }, [number, string]>(
        `SELECT id, message_id
         FROM emails
         WHERE mailbox_id = ?
           AND internet_message_id = ?
         ORDER BY id
         LIMIT 1`
      )
      .get(data.mailboxId, data.internetMessageId);

    if (
      existingByInternet?.message_id &&
      existingByInternet.message_id !== data.messageId
    ) {
      const existingByNewMessageId = await db
        .query<{ id: number }, [string]>(
          "SELECT id FROM emails WHERE message_id = ? LIMIT 1"
        )
        .get(data.messageId);

      if (!existingByNewMessageId) {
        await db.run("UPDATE emails SET message_id = ? WHERE id = ?", [
          data.messageId,
          existingByInternet.id,
        ]);
      }
    }
  }

  await db.run(
    `INSERT INTO emails (
      message_id, internet_message_id, mailbox_id, conversation_id, subject, normalized_subject, from_email, from_name,
      to_emails, cc_emails, received_at, has_attachments, attachment_names,
      body_preview, body_full, body_html, web_url, categories, is_excluded, classification, classification_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    [
      data.messageId,
      data.internetMessageId ?? null,
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
      excluded,
      classification,
      classification ? "domain_rule" : null,
    ]
  );

  const row = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM emails WHERE message_id = ?"
    )
    .get(data.messageId);

  return row?.id ?? 0;
}

export async function getEmailByMessageId(
  messageId: string
): Promise<Email | null> {
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM emails WHERE message_id = ?"
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
      "SELECT * FROM emails WHERE id = ?"
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
     SET classification = ?, classification_confidence = ?, classification_method = ?
     WHERE id = ?`,
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
  await db.run(`UPDATE emails SET ${updates.join(", ")} WHERE id = ?`, values);
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
       LIMIT ?`
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
       WHERE classification = ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(classification, limit);

  return rows.map(parseEmailRow);
}

export async function getEmailsWithoutProjectLink(
  classifications: EmailClassification[],
  limit = 1000
): Promise<Email[]> {
  const placeholders = classifications.map(() => "?").join(", ");
  const rows = await db
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

export async function getRecentEmails(limit = 10): Promise<Email[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails ORDER BY id DESC LIMIT ?"
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
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}
export async function getLinkedConversationSibling(
  conversationId: string
): Promise<number | null> {
  const row = await db
    .query<{ project_id: number | null }, [string]>(
      "SELECT project_id FROM emails WHERE conversation_id = ? AND project_id IS NOT NULL LIMIT 1"
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
       WHERE from_email = ? AND project_id IS NOT NULL
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
