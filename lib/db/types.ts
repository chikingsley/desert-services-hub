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

export type BodyLinkScanStatus =
  | "pending"
  | "no_links"
  | "success"
  | "gated"
  | "failed";

// ============================================
// Entity Interfaces
// ============================================

export interface Account {
  contactCount: number;
  createdAt: string;
  domain: string;
  emailCount: number;
  id: number;
  mondayAccountId: string | null;
  mondayName: string | null;
  name: string;
  type: AccountType;
  updatedAt: string;
}

export interface Project {
  accountId: number | null;
  address: string | null;
  awardedValue: number | null;
  contractor: string | null;
  contractStatus: string;
  createdAt: string;
  dustPermitStatus: string;
  emailCount: number;
  firstSeen: string | null;
  id: number;
  lastSeen: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  mondayItemId: string | null;
  name: string;
  noiStatus: string;
  normalizedName: string | null;
  notes: string | null;
  outlookFolder: string | null;
  projectNumber: string | null;
  signsStatus: string;
  status: string;
  swpppStatus: string;
  updatedAt: string;
}

export interface Mailbox {
  createdAt: string;
  displayName: string | null;
  email: string;
  emailCount: number;
  id: number;
  lastSyncAt: string | null;
  updatedAt: string;
}

export interface Email {
  // Foreign key relationships
  accountId: number | null;
  attachmentNames: string[];
  bodyFull: string | null;
  bodyHtml: string | null;
  bodyLinkScanAttachmentsAdded: number;
  bodyLinkScanAttempts: number;
  bodyLinkScanError: string | null;
  bodyLinkScanLinksFound: number;
  bodyLinkScannedAt: string | null;

  // Body-link scanning
  bodyLinkScanStatus: BodyLinkScanStatus | null;
  bodyLinkScanVersion: number;
  bodyPreview: string | null;
  categories: string[];
  ccEmails: string[];

  // Classification
  classification: EmailClassification | null;
  classificationConfidence: number | null;
  classificationMethod: ClassificationMethod | null;
  contractorName: string | null;
  conversationId: string | null;

  createdAt: string;
  fromDomain: string | null;
  fromEmail: string | null;
  fromName: string | null;
  hasAttachments: boolean;
  id: number;
  internetMessageId: string | null;
  isExcluded: boolean;
  isForwarded: boolean;

  // Internal/Forwarding flags
  isInternal: boolean;

  // Platform extraction
  isPlatformEmail: boolean;
  mailboxId: number;
  messageId: string;
  mondayEstimateId: string | null;
  normalizedSubject: string | null;
  notionProjectId: string | null;
  originalSenderDomain: string | null;
  originalSenderEmail: string | null;
  platformName: string | null;
  projectId: number | null;

  // Linking text fields
  projectName: string | null;
  realSenderCompany: string | null;
  realSenderDomain: string | null;
  realSenderEmail: string | null;
  realSenderName: string | null;
  receivedAt: string;
  subject: string | null;

  // Threading
  threadId: string | null;
  toEmails: string[];
  webUrl: string | null;
}

export interface Attachment {
  attachmentId: string;
  contentType: string | null;
  createdAt: string;
  emailId: number;
  extractedAt: string | null;
  extractedText: string | null;
  extractionError: string | null;
  extractionStatus: ExtractionStatus;
  id: number;
  name: string;
  size: number | null;
  storageBucket: string | null;
  storagePath: string | null;
}

export interface Estimate {
  accountDomain: string | null;
  accountMondayId: string | null;
  awarded: boolean;
  awardedValue: number | null;
  bidSource: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  contractor: string | null;
  createdAt: string;
  dueDate: string | null;
  estimateFileName: string | null;
  estimateNumber: string | null;
  estimateStoragePath: string | null;
  groupId: string | null;
  groupTitle: string | null;
  id: number;
  location: string | null;
  mondayItemId: string;
  mondayUrl: string | null;
  name: string;
  sharepointUrl: string | null;
  syncedAt: string;
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
  accountId: number | null;
  address: string | null;
  city: string | null;
  closedDate: string | null;
  companyName: string | null;
  createdAt: number;
  effectiveDate: string | null;
  expirationDate: string | null;
  facilityId: string | null;
  id: string;
  invoiceBalance: number | null;
  invoiceCharges: number | null;
  invoiceNumber: string | null;
  isAccelerated: boolean;
  isBlockPermit: boolean;
  parcel: string | null;
  portalCompanyId: string | null;
  previousAppId: string | null;
  projectEndDate: string | null;
  projectId: number | null;
  projectName: string | null;
  projectStartDate: string | null;
  status: PermitStatus | null;
  submittedDate: string | null;
  updatedAt: number;
}

export type SwpppWorksheet =
  | "Need to Schedule"
  | "Confirmed Schedule"
  | "SWPPP B & V";

export interface SwpppWorkOrder {
  accountId: number | null;
  address: string | null;
  comments: string | null;
  contact: string | null;
  contractor: string | null;
  date: string | null;
  dateEntered: string | null;
  id: number;
  invoice: string | null;
  jobName: string | null;
  phone: string | null;
  projectId: number | null;
  rowNumber: number;
  syncedAt: string;
  workCompleted: string | null;
  workDescription: string | null;
  worksheet: SwpppWorksheet;
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
  createdAt: string;
  draftId: string | null;
  error: string | null;
  eventType: NotificationEventType;
  id: number;
  metadata: string | null;
  refId: string | null;
  refType: string | null;
  sentAt: string | null;
  status: NotificationStatus;
  subject: string;
}

export type ProjectMatchReviewStatus = "pending" | "resolved" | "dismissed";

export interface ProjectMatchReview {
  accountIdHint: number | null;
  addressHint: string | null;
  aliasHints: string[];
  candidates: unknown[];
  contractorHint: string | null;
  createdAt: string;
  decision: unknown;
  id: number;
  note: string | null;
  primaryText: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  selectedProjectId: number | null;
  source: string;
  sourceKey: string;
  status: ProjectMatchReviewStatus;
  updatedAt: string;
}

// ============================================
// Input Data Types (for insert/upsert operations)
// ============================================

export interface InsertEmailData {
  attachmentNames?: string[];
  bodyFull?: string | null;
  bodyHtml?: string | null;
  bodyPreview?: string | null;
  categories?: string[];
  ccEmails?: string[];
  conversationId?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  hasAttachments?: boolean;
  internetMessageId?: string | null;
  mailboxId: number;
  messageId: string;
  receivedAt: string;
  subject?: string | null;
  toEmails?: string[];
  webUrl?: string | null;
}

export interface InsertAttachmentData {
  attachmentId: string;
  contentType?: string | null;
  emailId: number;
  name: string;
  size?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
}

export interface UpsertEstimateData {
  accountDomain?: string | null;
  accountMondayId?: string | null;
  awarded?: boolean;
  awardedValue?: number | null;
  bidSource?: string | null;
  bidStatus?: string | null;
  bidValue?: number | null;
  contractor?: string | null;
  dueDate?: string | null;
  estimateFileName?: string | null;
  estimateNumber?: string | null;
  estimateStoragePath?: string | null;
  groupId?: string | null;
  groupTitle?: string | null;
  location?: string | null;
  mondayItemId: string;
  mondayUrl?: string | null;
  name: string;
  sharepointUrl?: string | null;
}

export interface UpsertPermitData {
  accountId?: number | null;
  address?: string | null;
  city?: string | null;
  closedDate?: string | null;
  companyName?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  facilityId?: string | null;
  id: string;
  invoiceBalance?: number | null;
  invoiceCharges?: number | null;
  invoiceNumber?: string | null;
  isAccelerated?: boolean;
  isBlockPermit?: boolean;
  parcel?: string | null;
  portalCompanyId?: string | null;
  previousAppId?: string | null;
  projectEndDate?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  projectStartDate?: string | null;
  status?: string | null;
  submittedDate?: string | null;
}

// ============================================
// Marketing Permits (Market Intelligence)
// ============================================

export interface MarketingPermit {
  address: string | null;
  city: string | null;
  closedDate: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: number;
  detailScrapedAt: number | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  id: string;
  invoiceBalance: number | null;
  invoiceCharges: number | null;
  invoiceNumber: string | null;
  isAccelerated: boolean;
  isBlockPermit: boolean;
  parcel: string | null;
  previousAppId: string | null;
  projectEndDate: string | null;
  projectName: string | null;
  projectStartDate: string | null;
  rawData: Record<string, unknown> | null;
  scrapedAt: number | null;
  status: PermitStatus | null;
  submittedDate: string | null;
}

export interface UpsertMarketingPermitData {
  address?: string | null;
  city?: string | null;
  closedDate?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  id: string;
  invoiceBalance?: number | null;
  invoiceCharges?: number | null;
  invoiceNumber?: string | null;
  isAccelerated?: boolean;
  isBlockPermit?: boolean;
  parcel?: string | null;
  previousAppId?: string | null;
  projectEndDate?: string | null;
  projectName?: string | null;
  projectStartDate?: string | null;
  rawData?: Record<string, unknown> | null;
  status?: string | null;
  submittedDate?: string | null;
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
