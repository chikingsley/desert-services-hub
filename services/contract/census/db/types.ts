/**
 * Census Database Types
 *
 * All type definitions for the census database entities.
 * Extracted from db.ts for better organization.
 */

// ============================================
// Classification Types
// ============================================

export type EmailClassification =
  | "CONTRACT"
  | "DUST_PERMIT"
  | "SWPPP"
  | "ESTIMATE"
  | "INSURANCE"
  | "INVOICE"
  | "SCHEDULE"
  | "CHANGE_ORDER"
  | "INTERNAL"
  | "VENDOR"
  | "SPAM"
  | "UNKNOWN";

export type TaskType = "action_required" | "fyi" | "follow_up" | "waiting_on";

export type TaskPriority = "urgent" | "normal" | "low";

export type ClassificationMethod = "pattern" | "llm";

export type AccountType = "contractor" | "platform" | "internal";

export type ExtractionStatus = "pending" | "success" | "failed" | "skipped";

// ============================================
// Entity Interfaces
// ============================================

export interface Account {
  id: number;
  domain: string;
  name: string;
  type: AccountType;
  contactCount: number;
  emailCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  accountId: number | null;
  name: string;
  normalizedName: string | null;
  address: string | null;
  emailCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  mondayItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Mailbox {
  id: number;
  email: string;
  displayName: string | null;
  lastSyncAt: string | null;
  emailCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Email {
  id: number;
  messageId: string;
  mailboxId: number;
  conversationId: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  receivedAt: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  bodyPreview: string | null;
  webUrl: string | null;
  classification: EmailClassification | null;
  classificationConfidence: number | null;
  classificationMethod: ClassificationMethod | null;
  projectName: string | null;
  contractorName: string | null;
  mondayEstimateId: string | null;
  notionProjectId: string | null;
  accountId: number | null;
  projectId: number | null;
  bodyFull: string | null;
  bodyHtml: string | null;
  categories: string[];
  createdAt: string;
}

export interface Attachment {
  id: number;
  emailId: number;
  attachmentId: string;
  name: string;
  contentType: string | null;
  size: number | null;
  storageBucket: string | null;
  storagePath: string | null;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  extractedAt: string | null;
  createdAt: string;
}

export interface EmailTask {
  id: number;
  emailId: number;
  taskDescription: string;
  taskType: TaskType | null;
  priority: TaskPriority | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
}

export interface EmailEntity {
  id: number;
  emailId: number;
  entityType: string;
  entityValue: string;
  createdAt: string;
}

export interface Estimate {
  id: number;
  mondayItemId: string;
  name: string;
  estimateNumber: string | null;
  contractor: string | null;
  groupId: string | null;
  groupTitle: string | null;
  mondayUrl: string | null;
  accountMondayId: string | null;
  accountDomain: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  awardedValue: number | null;
  bidSource: string | null;
  awarded: boolean;
  dueDate: string | null;
  location: string | null;
  sharepointUrl: string | null;
  estimateStorageBucket: string | null;
  estimateStoragePath: string | null;
  estimateFileName: string | null;
  estimateSyncedAt: string | null;
  plansStoragePath: string | null;
  contractsStoragePath: string | null;
  noiStoragePath: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Input Data Types (for insert/upsert operations)
// ============================================

export interface InsertEmailData {
  messageId: string;
  mailboxId: number;
  conversationId?: string | null;
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmails?: string[];
  ccEmails?: string[];
  receivedAt: string;
  hasAttachments?: boolean;
  attachmentNames?: string[];
  bodyPreview?: string | null;
  bodyFull?: string | null;
  bodyHtml?: string | null;
  webUrl?: string | null;
  categories?: string[];
}

export interface InsertTaskData {
  emailId: number;
  taskDescription: string;
  taskType?: TaskType | null;
  priority?: TaskPriority | null;
  dueDate?: string | null;
}

export interface InsertAttachmentData {
  emailId: number;
  attachmentId: string;
  name: string;
  contentType?: string | null;
  size?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
}

export interface UpsertEstimateData {
  mondayItemId: string;
  name: string;
  estimateNumber?: string | null;
  contractor?: string | null;
  groupId?: string | null;
  groupTitle?: string | null;
  mondayUrl?: string | null;
  accountMondayId?: string | null;
  accountDomain?: string | null;
  bidStatus?: string | null;
  bidValue?: number | null;
  awardedValue?: number | null;
  bidSource?: string | null;
  awarded?: boolean;
  dueDate?: string | null;
  location?: string | null;
  sharepointUrl?: string | null;
  estimateStorageBucket?: string | null;
  estimateStoragePath?: string | null;
  estimateFileName?: string | null;
}

// ============================================
// Statistics Types
// ============================================

export interface ClassificationStats {
  classification: EmailClassification | null;
  count: number;
}
