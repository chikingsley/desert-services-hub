export interface WebhookJob {
  id: number;
  job_type: string;
  monday_item_id: string | null;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
}

export interface ContractAttachmentRow {
  id: number;
  attachment_id: string;
  name: string;
  content_type: string | null;
  size: number | null;
}

export interface ContractAttachmentContext {
  emailId: number;
  messageId: string;
  mailboxEmail: string;
  subject: string;
  fromEmail: string;
}
