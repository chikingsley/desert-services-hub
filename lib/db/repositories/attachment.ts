/**
 * Attachment Repository
 */
import { db } from "@lib/db/hub";
import { getEmailById, parseEmailRow } from "@lib/db/repositories/email";
import type {
  Attachment,
  Email,
  ExtractionStatus,
  InsertAttachmentData,
} from "@lib/db/types";

function parseAttachmentRow(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as number,
    emailId: row.email_id as number,
    attachmentId: row.attachment_id as string,
    name: row.name as string,
    contentType: row.content_type as string | null,
    size: row.size as number | null,
    storageBucket: row.storage_bucket as string | null,
    storagePath: row.storage_path as string | null,
    extractedText: row.extracted_text as string | null,
    extractionStatus: (row.extraction_status as ExtractionStatus) ?? "pending",
    extractionError: row.extraction_error as string | null,
    extractedAt: row.extracted_at as string | null,
    createdAt: row.created_at as string,
  };
}

export async function insertAttachment(
  data: InsertAttachmentData
): Promise<number> {
  const result = await db.run(
    `INSERT INTO attachments (email_id, attachment_id, name, content_type, size, storage_bucket, storage_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email_id, attachment_id) DO UPDATE SET
       name = excluded.name,
       content_type = excluded.content_type,
       size = excluded.size,
       storage_bucket = COALESCE(excluded.storage_bucket, attachments.storage_bucket),
       storage_path = COALESCE(excluded.storage_path, attachments.storage_path)`,
    [
      data.emailId,
      data.attachmentId,
      data.name,
      data.contentType ?? null,
      data.size ?? null,
      data.storageBucket ?? null,
      data.storagePath ?? null,
    ]
  );

  return Number(result.lastInsertRowid);
}

export async function getAttachmentsForEmail(
  emailId: number
): Promise<Attachment[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM attachments WHERE email_id = ? ORDER BY name"
    )
    .all(emailId);

  return rows.map(parseAttachmentRow);
}

export async function getAttachmentById(
  id: number
): Promise<Attachment | null> {
  const row = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM attachments WHERE id = ?"
    )
    .get(id);

  return row ? parseAttachmentRow(row) : null;
}

export async function getPendingAttachments(
  limit = 100
): Promise<Attachment[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM attachments
       WHERE extraction_status = 'pending'
       ORDER BY id
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseAttachmentRow);
}

export async function updateAttachmentExtraction(
  attachmentId: number,
  status: ExtractionStatus,
  extractedText?: string | null,
  error?: string | null
): Promise<void> {
  await db.run(
    `UPDATE attachments
     SET extraction_status = ?,
         extracted_text = ?,
         extraction_error = ?,
         extracted_at = now()
     WHERE id = ?`,
    [status, extractedText ?? null, error ?? null, attachmentId]
  );
}

export async function getAttachmentStats(): Promise<{
  total: number;
  pending: number;
  success: number;
  failed: number;
  skipped: number;
}> {
  const rows = await db
    .query<{ status: string; count: number }, []>(
      `SELECT extraction_status as status, COUNT(*) as count
       FROM attachments
       GROUP BY extraction_status`
    )
    .all();

  const stats = { total: 0, pending: 0, success: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    const count = row.count;
    stats.total += count;
    switch (row.status) {
      case "pending":
        stats.pending = count;
        break;
      case "success":
        stats.success = count;
        break;
      case "failed":
        stats.failed = count;
        break;
      case "skipped":
        stats.skipped = count;
        break;
      default:
        break;
    }
  }
  return stats;
}

export async function searchAttachments(
  searchTerm: string,
  limit = 100
): Promise<Attachment[]> {
  const pattern = `%${searchTerm}%`;

  const rows = await db
    .query<Record<string, unknown>, [string, string, string, number]>(
      `SELECT a.*
       FROM attachments a
       JOIN emails e ON a.email_id = e.id
       WHERE a.storage_path IS NOT NULL
         AND (e.subject LIKE ?
           OR e.project_name LIKE ?
           OR e.contractor_name LIKE ?)
       ORDER BY e.received_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit);

  return rows.map(parseAttachmentRow);
}

export async function searchEmailsFullText(
  query: string,
  limit = 50
): Promise<Array<Email & { matchSource: "subject" | "body" | "attachment" }>> {
  const pattern = `%${query}%`;

  const emailRows = await db
    .query<
      Record<string, unknown> & { match_source: string },
      [string, string, string, number]
    >(
      `SELECT *,
        CASE
          WHEN subject LIKE ? THEN 'subject'
          ELSE 'body'
        END as match_source
       FROM emails
       WHERE subject LIKE ? OR body_full LIKE ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit);

  const results: Array<
    Email & { matchSource: "subject" | "body" | "attachment" }
  > = [];

  for (const row of emailRows) {
    results.push({
      ...parseEmailRow(row),
      matchSource: row.match_source as "subject" | "body",
    });
  }

  const attachmentRows = await db
    .query<{ email_id: number }, [string, number]>(
      `SELECT DISTINCT email_id
       FROM attachments
       WHERE extracted_text LIKE ?
       LIMIT ?`
    )
    .all(pattern, limit);

  for (const { email_id } of attachmentRows) {
    if (results.some((r) => r.id === email_id)) {
      continue;
    }

    const email = await getEmailById(email_id);
    if (email) {
      results.push({ ...email, matchSource: "attachment" });
    }
  }

  return results.slice(0, limit);
}

export async function clearAttachments(): Promise<void> {
  await db.run("DELETE FROM attachments");
}
