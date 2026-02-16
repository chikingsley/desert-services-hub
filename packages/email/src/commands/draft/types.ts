export interface DraftCommandOptions {
  to?: string;
  cc?: string;
  subject: string;
  body: string;
  skipSignature: boolean;
  attachmentPaths?: string;
  userId?: string;
}

export interface ReplyDraftCommandOptions {
  query: string;
  body: string;
  replyAll: boolean;
  skipSignature: boolean;
  userId?: string;
  limit?: number;
  attachmentPaths?: string;
}

export interface ReplyDraftByIdCommandOptions {
  messageId: string;
  body: string;
  replyAll: boolean;
  skipSignature: boolean;
  userId?: string;
  attachmentPaths?: string;
}
