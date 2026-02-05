/**
 * Hub Database Types
 *
 * All type definitions for the hub database entities.
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

// Task types removed - task repository was unused

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
  mondayAccountId: string | null; // Monday.com account ID
  mondayName: string | null; // Monday.com account name
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
  internetMessageId: string | null; // RFC 2822 Message-ID for cross-mailbox matching
  mailboxId: number;
  conversationId: string | null;
  subject: string | null;
  normalizedSubject: string | null; // Normalized subject for searching
  fromEmail: string | null;
  fromName: string | null;
  fromDomain: string | null; // Extracted domain from from_email
  toEmails: string[];
  ccEmails: string[];
  receivedAt: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  bodyPreview: string | null;
  bodyFull: string | null;
  bodyHtml: string | null;
  webUrl: string | null;
  categories: string[];

  // Classification
  classification: EmailClassification | null;
  classificationConfidence: number | null;
  classificationMethod: ClassificationMethod | null;

  // Linking text fields
  projectName: string | null;
  contractorName: string | null;
  mondayEstimateId: string | null;
  notionProjectId: string | null;

  // Foreign key relationships
  accountId: number | null; // Links to accounts table
  projectId: number | null; // Links to projects table
  estimateId: number | null; // Links to estimates table

  // Threading
  threadId: string | null; // Thread ID (different from conversation_id)

  // Internal/Forwarding flags
  isInternal: boolean; // Is internal email (desertservices.net)
  isForwarded: boolean; // Is forwarded email
  originalSenderEmail: string | null; // Original sender (if forwarded)
  originalSenderDomain: string | null; // Original sender domain (if forwarded)

  // Platform extraction
  isPlatformEmail: boolean; // Is from a platform (BuildingConnected, Procore, etc.)
  platformName: string | null; // Name of platform (e.g., "BuildingConnected")
  realSenderName: string | null; // Extracted real sender name
  realSenderCompany: string | null; // Extracted real sender company
  realSenderEmail: string | null; // Extracted real sender email
  realSenderDomain: string | null; // Extracted real sender domain
  isExcluded: boolean; // Should be excluded from processing

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

// EmailTask and EmailEntity removed - repositories were unused

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
  internetMessageId?: string | null; // RFC 2822 Message-ID for cross-mailbox matching
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

// InsertTaskData removed - task repository was unused

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
