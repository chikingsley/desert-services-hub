import { db } from "@lib/db/client";

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_HOURS = 6;

export interface IntakeAttachmentRow {
  attachment_id_pk: number;
  graph_attachment_id: string | null;
  name: string;
  content_type: string | null;
  size: number | null;
  storage_path: string | null;
  source: string;
  email_id: number | null;
  message_id: string | null;
  internet_message_id: string | null;
  thread_id: string | null;
  conversation_id: string | null;
  project_id: number | null;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string | null;
  monday_column_id: string | null;
  estimate_id: number | null;
  local_path: string | null;
}

const getIntakeAttachmentRowsStmt = db.query<IntakeAttachmentRow, [number]>(`
  SELECT
    d.id as attachment_id_pk,
    d.outlook_attachment_id as graph_attachment_id,
    d.file_name as name,
    d.content_type,
    d.file_size as size,
    d.storage_path,
    d.source,
    d.monday_column_id,
    d.estimate_id,
    d.local_path,
    e.id as email_id,
    e.message_id,
    e.internet_message_id,
    e.project_id,
    e.subject,
    e.from_email,
    e.thread_id,
    e.conversation_id,
    m.email as mailbox_email
  FROM documents d
  LEFT JOIN emails e ON e.id = d.email_id
  LEFT JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE d.source IN ('email_attachment', 'monday_asset')
    AND (
      d.extraction_status IS NULL
      OR d.extraction_status = 'pending'
      OR d.extraction_status = 'downloaded'
      OR (
        d.extraction_status = 'failed'
        AND d.extraction_attempts < ${MAX_RETRY_ATTEMPTS}
        AND (d.last_attempted_at IS NULL OR d.last_attempted_at < now() - interval '${RETRY_COOLDOWN_HOURS} hours')
      )
    )
    AND (d.email_id IS NULL OR e.classification IS NULL OR e.classification NOT IN ('SPAM', 'HR', 'IT'))
  ORDER BY d.created_at DESC
  LIMIT $1
`);

const updateDocumentBackfillLinksStmt = db.query(
  `UPDATE documents
   SET email_id = $2,
       outlook_attachment_id = $3,
       project_id = $4,
       updated_at = now()
   WHERE id = $1`
);

const deleteFailedParsedDocsStmt = db.query(
  `DELETE FROM documents
   WHERE source = 'parsed'
     AND email_id = $1
     AND outlook_attachment_id = $2
     AND extraction_status = 'failed'`
);

const checkInternetMessageIdDupeStmt = db.query<
  { id: number },
  [string, string, number | null, number]
>(`
  SELECT d2.id
  FROM documents d2
  JOIN emails e2 ON e2.id = d2.email_id
  WHERE d2.source = 'email_attachment'
    AND e2.internet_message_id = $1
    AND d2.file_name = $2
    AND ($3 IS NULL OR d2.file_size = $3)
    AND d2.extraction_status IN ('success', 'deduped')
    AND d2.id <> $4
  LIMIT 1
`);

const checkContentHashDupeStmt = db.query<{ id: number }, [string, number]>(
  `SELECT d2.id
   FROM documents d2
   WHERE d2.source = 'email_attachment'
     AND d2.content_hash = $1
     AND d2.extraction_status IN ('success', 'deduped')
     AND d2.id <> $2
   LIMIT 1`
);

const setContentHashStmt = db.query(
  "UPDATE documents SET content_hash = $2, updated_at = now() WHERE id = $1"
);

const markDedupedStmt = db.query(
  `UPDATE documents
   SET extraction_status = 'deduped',
       extracted_at = now(),
       extraction_attempts = extraction_attempts + 1,
       last_attempted_at = now(),
       updated_at = now()
   WHERE id = $1`
);

const clearLocalPathStmt = db.query(
  "UPDATE documents SET local_path = NULL WHERE id = $1"
);

const markMondayAssetSuccessStmt = db.query(
  `UPDATE documents
   SET document_type = $2,
       summary = $3,
       extraction_status = 'success',
       extraction_attempts = extraction_attempts + 1,
       last_attempted_at = now(),
       extracted_at = now(),
       updated_at = now()
   WHERE id = $1`
);

export async function getIntakeAttachmentRows(
  limit: number
): Promise<IntakeAttachmentRow[]> {
  return await getIntakeAttachmentRowsStmt.all(limit);
}

export async function updateDocumentBackfillLinks(
  documentId: number,
  emailId: number | null,
  graphAttachmentId: string | null,
  projectId: number | null
): Promise<void> {
  await updateDocumentBackfillLinksStmt.run(
    documentId,
    emailId,
    graphAttachmentId,
    projectId
  );
}

export async function deleteFailedParsedDocs(
  emailId: number,
  graphAttachmentId: string
): Promise<void> {
  await deleteFailedParsedDocsStmt.run(emailId, graphAttachmentId);
}

export async function findInternetMessageAttachmentDuplicate(
  internetMessageId: string,
  fileName: string,
  fileSize: number | null,
  excludeDocumentId: number
): Promise<number | null> {
  const row = await checkInternetMessageIdDupeStmt.get(
    internetMessageId,
    fileName,
    fileSize,
    excludeDocumentId
  );
  return row?.id ?? null;
}

export async function findContentHashAttachmentDuplicate(
  contentHash: string,
  excludeDocumentId: number
): Promise<number | null> {
  const row = await checkContentHashDupeStmt.get(
    contentHash,
    excludeDocumentId
  );
  return row?.id ?? null;
}

export async function setAttachmentContentHash(
  documentId: number,
  contentHash: string
): Promise<void> {
  await setContentHashStmt.run(documentId, contentHash);
}

export async function markAttachmentDeduped(documentId: number): Promise<void> {
  await markDedupedStmt.run(documentId);
}

export async function clearAttachmentLocalPath(
  documentId: number
): Promise<void> {
  await clearLocalPathStmt.run(documentId);
}

export async function markMondayAssetExtractionSuccess(
  documentId: number,
  documentType: string,
  summary: string
): Promise<void> {
  await markMondayAssetSuccessStmt.run(
    documentId,
    documentType,
    summary.slice(0, 10_000)
  );
}
