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

export interface Stakeholder {
  id: number;
  eventType: NotificationEventType;
  email: string;
  name: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: string;
}

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
  estimateStorageBucket?: string | null;
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

// ============================================
// Quoting App - SQLite Row Types
// ============================================

export interface EstimateRow {
  id: string;
  name: string;
  estimate_number: string | null;
  contractor: string | null;
  base_number: string | null;
  takeoff_id: string | null;
  job_address: string | null;
  client_name: string | null;
  client_address: string | null;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  bid_status: string | null;
  is_locked: number;
  estimator: string | null;
  estimator_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateVersionRow {
  id: string;
  estimate_id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

export interface EstimateSectionRow {
  id: string;
  version_id: string;
  name: string;
  title: string | null;
  show_subtotal: number;
  sort_order: number;
  created_at: string;
}

export interface EstimateLineItemRow {
  id: string;
  version_id: string;
  section_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  is_excluded: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Quoting App - Application Types
// ============================================

export interface QuotingEstimate {
  id: string;
  base_number: string;
  takeoff_id: string | null;
  estimate_date: string;
  estimator_name: string | null;
  estimator_email: string | null;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  notes: string | null;
  status: "draft" | "sent" | "accepted" | "declined";
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface EstimateVersion {
  id: string;
  estimate_id: string;
  version_number: number;
  change_summary: string | null;
  total: number;
  is_current: boolean;
  created_at: string;
}

export interface EstimateSection {
  id: string;
  version_id: string;
  name: string;
  title: string | null;
  show_subtotal: boolean;
  sort_order: number;
  created_at: string;
}

export interface EstimateLineItem {
  id: string;
  version_id: string;
  section_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  is_excluded: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Estimate Editor Types
// ============================================

export interface EditorLineItem {
  id: string;
  item: string;
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
  subcategoryId?: string;
  isStruck?: boolean;
}

export interface EditorSection {
  id: string;
  name: string;
  title?: string;
  showSubtotal?: boolean;
  catalogCategoryId?: string;
}

export interface EditorEstimate {
  estimateNumber: string;
  date: string;
  estimator: string;
  estimatorEmail: string;
  billTo: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
  };
  jobInfo: {
    siteName: string;
    address: string;
  };
  sections: EditorSection[];
  lineItems: EditorLineItem[];
  total: number;
}

// ============================================
// Dust Permit Tier Pricing
// ============================================

export interface DustPermitTier {
  min: number;
  max: number;
  price: number;
  label: string;
  adeqFee: number;
  filingFee: number;
}

export const DUST_PERMIT_TIERS: DustPermitTier[] = [
  {
    min: 0.1,
    max: 0.99,
    price: 1070,
    label: "<1 acre",
    adeqFee: 570,
    filingFee: 500,
  },
  {
    min: 1,
    max: 4.99,
    price: 1630,
    label: "1 - 5 acres",
    adeqFee: 1130,
    filingFee: 500,
  },
  {
    min: 5,
    max: 9.99,
    price: 1630,
    label: "5 - 10 acres",
    adeqFee: 1130,
    filingFee: 500,
  },
  {
    min: 10,
    max: 49,
    price: 4870,
    label: "10 - 49 acres",
    adeqFee: 4120,
    filingFee: 750,
  },
  {
    min: 50,
    max: 99,
    price: 7870,
    label: "50 - 99 acres",
    adeqFee: 6870,
    filingFee: 1000,
  },
  {
    min: 100,
    max: 499,
    price: 11_560,
    label: "100 - 499 acres",
    adeqFee: 10_310,
    filingFee: 1250,
  },
  {
    min: 500,
    max: Number.POSITIVE_INFINITY,
    price: 18_490,
    label: "500+ acres",
    adeqFee: 16_490,
    filingFee: 2000,
  },
];

export function getDustPermitTier(acres: number): DustPermitTier | null {
  for (const tier of DUST_PERMIT_TIERS) {
    if (acres >= tier.min && acres <= tier.max) {
      return tier;
    }
  }
  return null;
}
