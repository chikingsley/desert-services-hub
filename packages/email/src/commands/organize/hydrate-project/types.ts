export interface ThreadSummaryRow {
  conversation_id: string;
  last_received_at: string;
  email_count: number;
}

export interface HydrateProjectMoveMessage {
  id: string;
  internetMessageId?: string;
  subject: string;
  fromEmail: string;
  receivedDateTime: Date;
  parentFolderId?: string;
}

export interface HydrateProjectPlan {
  toMove: HydrateProjectMoveMessage[];
  messagesAlreadyInFolder: number;
  threadsSkippedMixed: number;
}
