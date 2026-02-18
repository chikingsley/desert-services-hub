/**
 * Hub Database Types
 *
 * All type definitions for the hub database entities.
 */

import type { DustPermitTier as DustPermitTierInternal } from "@lib/db/types/dust-permit-tier";
import {
  DUST_PERMIT_TIERS as DUST_PERMIT_TIERS_INTERNAL,
  getDustPermitTier as getDustPermitTierInternal,
} from "@lib/db/types/dust-permit-tier";
import type {
  EditorEstimate as EditorEstimateInternal,
  EditorLineItem as EditorLineItemInternal,
  EditorSection as EditorSectionInternal,
  EstimateLineItem as EstimateLineItemInternal,
  EstimateLineItemRow as EstimateLineItemRowInternal,
  EstimateRow as EstimateRowInternal,
  EstimateSection as EstimateSectionInternal,
  EstimateSectionRow as EstimateSectionRowInternal,
  EstimateVersion as EstimateVersionInternal,
  EstimateVersionRow as EstimateVersionRowInternal,
  QuotingEstimate as QuotingEstimateInternal,
} from "@lib/db/types/estimate-editor";

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
  | "PAYMENT"
  | "HR"
  | "IT"
  | "SCHEDULE"
  | "CHANGE_ORDER"
  | "INTERNAL"
  | "VENDOR"
  | "SPAM"
  | "UNKNOWN";

export type ClassificationMethod = "pattern" | "llm";

export type AccountType = "contractor" | "platform" | "internal";

export type ExtractionStatus =
  | "pending"
  | "success"
  | "failed"
  | "skipped"
  | "deduped";

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
  mondayAccountId: string | null;
  mondayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  projectNumber: string | null;
  accountId: number | null;
  name: string;
  normalizedName: string | null;
  contractor: string | null;
  awardedValue: number | null;
  address: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  status: string;
  contractStatus: string;
  dustPermitStatus: string;
  noiStatus: string;
  swpppStatus: string;
  signsStatus: string;
  outlookFolder: string | null;
  notes: string | null;
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
  internetMessageId: string | null;
  mailboxId: number;
  conversationId: string | null;
  subject: string | null;
  normalizedSubject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  fromDomain: string | null;
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
  accountId: number | null;
  projectId: number | null;

  // Threading
  threadId: string | null;

  // Internal/Forwarding flags
  isInternal: boolean;
  isForwarded: boolean;
  originalSenderEmail: string | null;
  originalSenderDomain: string | null;

  // Platform extraction
  isPlatformEmail: boolean;
  platformName: string | null;
  realSenderName: string | null;
  realSenderCompany: string | null;
  realSenderEmail: string | null;
  realSenderDomain: string | null;
  isExcluded: boolean;

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
  estimateStoragePath: string | null;
  estimateFileName: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type PermitStatus =
  | "Draft"
  | "Submitted"
  | "Active"
  | "Superseded"
  | "Closed"
  | "Rejected"
  | "Pending Payment";

export interface Permit {
  id: string;
  projectName: string | null;
  facilityId: string | null;
  accountId: number | null;
  projectId: number | null;
  companyName: string | null;
  portalCompanyId: string | null;
  status: PermitStatus | null;
  submittedDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  closedDate: string | null;
  previousAppId: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  isBlockPermit: boolean;
  isAccelerated: boolean;
  invoiceNumber: string | null;
  invoiceCharges: number | null;
  invoiceBalance: number | null;
  createdAt: number;
  updatedAt: number;
}

export type SwpppWorksheet =
  | "Need to Schedule"
  | "Confirmed Schedule"
  | "SWPPP B & V";

export interface SwpppWorkOrder {
  id: number;
  rowNumber: number;
  worksheet: SwpppWorksheet;
  date: string | null;
  contractor: string | null;
  jobName: string | null;
  address: string | null;
  contact: string | null;
  phone: string | null;
  workDescription: string | null;
  dateEntered: string | null;
  comments: string | null;
  invoice: string | null;
  workCompleted: string | null;
  accountId: number | null;
  projectId: number | null;
  syncedAt: string;
}

export type NotificationEventType =
  | "dust_permit_submitted"
  | "dust_permit_issued"
  | "dust_permit_expiring"
  | "dust_permit_billing"
  | "estimate_won"
  | "estimate_lost"
  | "contract_received"
  | "swppp_scheduled"
  | "inspection_received";

export type NotificationStatus = "pending" | "drafted" | "sent" | "failed";

export interface Notification {
  id: number;
  eventType: NotificationEventType;
  refType: string | null;
  refId: string | null;
  subject: string;
  draftId: string | null;
  status: NotificationStatus;
  sentAt: string | null;
  error: string | null;
  metadata: string | null;
  createdAt: string;
}

export type ProjectMatchReviewStatus = "pending" | "resolved" | "dismissed";

export interface ProjectMatchReview {
  id: number;
  source: string;
  sourceKey: string;
  status: ProjectMatchReviewStatus;
  primaryText: string;
  aliasHints: string[];
  contractorHint: string | null;
  addressHint: string | null;
  accountIdHint: number | null;
  candidates: unknown[];
  decision: unknown;
  selectedProjectId: number | null;
  note: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Input Data Types (for insert/upsert operations)
// ============================================

export interface InsertEmailData {
  messageId: string;
  internetMessageId?: string | null;
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
  estimateStoragePath?: string | null;
  estimateFileName?: string | null;
}

export interface UpsertPermitData {
  id: string;
  projectName?: string | null;
  facilityId?: string | null;
  accountId?: number | null;
  projectId?: number | null;
  companyName?: string | null;
  portalCompanyId?: string | null;
  status?: string | null;
  submittedDate?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  closedDate?: string | null;
  previousAppId?: string | null;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  address?: string | null;
  city?: string | null;
  parcel?: string | null;
  isBlockPermit?: boolean;
  isAccelerated?: boolean;
  invoiceNumber?: string | null;
  invoiceCharges?: number | null;
  invoiceBalance?: number | null;
}

// ============================================
// Marketing Permits (Market Intelligence)
// ============================================

export interface MarketingPermit {
  id: string;
  projectName: string | null;
  companyId: string | null;
  companyName: string | null;
  status: PermitStatus | null;
  submittedDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  closedDate: string | null;
  previousAppId: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  isBlockPermit: boolean;
  isAccelerated: boolean;
  invoiceNumber: string | null;
  invoiceCharges: number | null;
  invoiceBalance: number | null;
  rawData: Record<string, unknown> | null;
  scrapedAt: number | null;
  detailScrapedAt: number | null;
  createdAt: number;
}

export interface UpsertMarketingPermitData {
  id: string;
  projectName?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  status?: string | null;
  submittedDate?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  closedDate?: string | null;
  previousAppId?: string | null;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  address?: string | null;
  city?: string | null;
  parcel?: string | null;
  isBlockPermit?: boolean;
  isAccelerated?: boolean;
  invoiceNumber?: string | null;
  invoiceCharges?: number | null;
  invoiceBalance?: number | null;
  rawData?: Record<string, unknown> | null;
}

// ============================================
// Statistics Types
// ============================================

export interface ClassificationStats {
  classification: EmailClassification | null;
  count: number;
}

export type EstimateRow = EstimateRowInternal;
export type EstimateVersionRow = EstimateVersionRowInternal;
export type EstimateSectionRow = EstimateSectionRowInternal;
export type EstimateLineItemRow = EstimateLineItemRowInternal;
export type QuotingEstimate = QuotingEstimateInternal;
export type EstimateVersion = EstimateVersionInternal;
export type EstimateSection = EstimateSectionInternal;
export type EstimateLineItem = EstimateLineItemInternal;
export type EditorLineItem = EditorLineItemInternal;
export type EditorSection = EditorSectionInternal;
export type EditorEstimate = EditorEstimateInternal;

export type DustPermitTier = DustPermitTierInternal;
export const DUST_PERMIT_TIERS: DustPermitTier[] = DUST_PERMIT_TIERS_INTERNAL;

export function getDustPermitTier(acres: number): DustPermitTier | null {
  return getDustPermitTierInternal(acres);
}
