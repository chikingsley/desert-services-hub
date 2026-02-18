export interface IntakeAttachmentRow {
  attachment_id_pk: number;
  graph_attachment_id: string | null;
  name: string;
  content_type: string | null;
  size: number | null;
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

export interface IntakeAttachmentsResult {
  processed: number;
  skipped: number;
  deduped: number;
  succeeded: number;
  failed: number;
  elapsedMs: number;
  attachmentsPerMinute: number;
  errors: string[];
}

export interface IntakeAttachmentsOptions {
  batchSize?: number;
  concurrency?: number;
}
