/**
 * Attachment Repository
 *
 * Operates on the unified `documents` table with source='email_attachment'.
 */
import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import { getEmailById, parseEmailRow } from "@email/db/email";
import { likeSearch, likeWhere } from "@lib/db/search";
import type {
  Attachment,
  Email,
  ExtractionStatus,
  InsertAttachmentData,
} from "@lib/db/types";

type AttachmentRow = Database["public"]["Tables"]["documents"]["Row"];
type EmailRow = Database["public"]["Tables"]["emails"]["Row"];

function parseAttachmentRow(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    emailId: row.email_id as number,
    attachmentId: row.outlook_attachment_id as string,
    name: row.file_name as string,
    contentType: row.content_type,
    size: row.file_size,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    extractedText: row.extracted_text,
    extractionStatus: (row.extraction_status as ExtractionStatus) ?? "pending",
    extractionError: row.extraction_error,
    extractedAt: row.extracted_at,
    createdAt: row.created_at as string,
  };
}

export async function insertAttachment(
  data: InsertAttachmentData
): Promise<number> {
  const row = await db
    .query<{ id: number }>(
      `INSERT INTO documents (source, email_id, outlook_attachment_id, file_name, content_type, file_size, storage_bucket, storage_path, document_type)
     VALUES ('email_attachment', $1, $2, $3, $4, $5, $6, $7, 'unknown')
     ON CONFLICT (email_id, outlook_attachment_id) WHERE source = 'email_attachment' AND outlook_attachment_id IS NOT NULL
     DO UPDATE SET
       file_name = excluded.file_name,
       content_type = excluded.content_type,
       file_size = excluded.file_size,
       storage_bucket = COALESCE(excluded.storage_bucket, documents.storage_bucket),
       storage_path = COALESCE(excluded.storage_path, documents.storage_path),
       updated_at = now()
     RETURNING id`
    )
    .get(
      data.emailId,
      data.attachmentId,
      data.name,
      data.contentType ?? null,
      data.size ?? null,
      data.storageBucket ?? null,
      data.storagePath ?? null
    );

  return Number(row?.id ?? 0);
}

export async function getAttachmentsForEmail(
  emailId: number
): Promise<Attachment[]> {
  const rows = await db
    .query<AttachmentRow, [number]>(
      `SELECT * FROM documents
       WHERE email_id = $1 AND source = 'email_attachment'
       ORDER BY file_name`
    )
    .all(emailId);

  return rows.map(parseAttachmentRow);
}

export async function getAttachmentById(
  id: number
): Promise<Attachment | null> {
  const row = await db
    .query<AttachmentRow, [number]>("SELECT * FROM documents WHERE id = $1")
    .get(id);

  return row ? parseAttachmentRow(row) : null;
}

export async function getPendingAttachments(
  limit = 100
): Promise<Attachment[]> {
  const rows = await db
    .query<AttachmentRow, [number]>(
      `SELECT * FROM documents
       WHERE source = 'email_attachment'
         AND extraction_status = 'pending'
       ORDER BY id
       LIMIT $1`
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
    `UPDATE documents
     SET extraction_status = $1,
         extracted_text = $2,
         extraction_error = $3,
         extracted_at = now(),
         extraction_attempts = extraction_attempts + 1,
         last_attempted_at = now(),
         updated_at = now()
     WHERE id = $4`,
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
       FROM documents
       WHERE source = 'email_attachment'
       GROUP BY extraction_status`
    )
    .all();

  const stats = {
    total: 0,
    pending: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    deduped: 0,
  };
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
      case "deduped":
        stats.deduped = count;
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
  const rows = await likeSearch<AttachmentRow>({
    table: "documents a",
    select: "a.*",
    joins: "JOIN emails e ON a.email_id = e.id",
    columns: ["e.subject", "e.project_name", "e.contractor_name"],
    query: searchTerm,
    extraWhere: "a.source = 'email_attachment' AND a.storage_path IS NOT NULL",
    orderBy: "e.received_at DESC",
    limit,
  });

  return rows.map(parseAttachmentRow);
}

export async function searchEmailsFullText(
  query: string,
  limit = 50
): Promise<Array<Email & { matchSource: "subject" | "body" | "attachment" }>> {
  // $1 = CASE pattern, $2/$3 = likeWhere params, $4 = LIMIT
  const casePattern = `%${query}%`;
  const { clause, params, nextIndex } = likeWhere(
    ["subject", "body_full"],
    query,
    2
  );

  const emailRows = await db
    .query<EmailRow & { match_source: "subject" | "body" }, unknown[]>(
      `SELECT *,
        CASE
          WHEN subject ILIKE $1 THEN 'subject'
          ELSE 'body'
        END as match_source
       FROM emails
       WHERE ${clause}
       ORDER BY received_at DESC
       LIMIT $${nextIndex}`
    )
    .all(casePattern, ...params, limit);

  const results: Array<
    Email & { matchSource: "subject" | "body" | "attachment" }
  > = [];

  for (const row of emailRows) {
    results.push({
      ...parseEmailRow(row),
      matchSource: row.match_source,
    });
  }

  const {
    clause: attClause,
    params: attParams,
    nextIndex: attNext,
  } = likeWhere(["extracted_text"], query);

  const attachmentRows = await db
    .query<{ email_id: number }, unknown[]>(
      `SELECT DISTINCT email_id
       FROM documents
       WHERE source = 'email_attachment'
         AND ${attClause}
       LIMIT $${attNext}`
    )
    .all(...attParams, limit);

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
  await db.run("DELETE FROM documents WHERE source = 'email_attachment'");
}
