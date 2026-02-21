// ============================================================================
// Dust Applications
// ============================================================================

export interface DustApplication {
  address: string | null;
  applicationId: string;
  city: string | null;
  closedDate: string | null;
  companyId: string | null;
  companyName: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  facilityId: string | null;
  facilityName: string | null;
  invoiceBalance: number | null;
  invoiceCharges: number | null;
  invoiceNumber: string | null;
  isAccelerated: boolean;
  isBlockPermit: boolean;
  parcel: string | null;
  previousAppId: string | null;
  projectCompletionDate: string | null;
  projectName: string | null;
  projectStartDate: string | null;
  status: string | null;
  submittedDate: string | null;
}

export type DustAppStatus =
  | "Active"
  | "Closed"
  | "Rejected"
  | "Submitted"
  | "Superseded";

export interface DustAppSearchParams {
  acceleratedOnly?: boolean;
  address?: string;
  applicationId?: string;
  blockPermitOnly?: boolean;
  city?: string;
  companyName?: string;
  facilityId?: string;
  facilityName?: string;
  parcel?: string;
  projectName?: string;
  statuses?: DustAppStatus[];
}

// ============================================================================
// Inspections
// ============================================================================

export interface Inspection {
  asbestosZone: string | null;
  companyId: string | null;
  companyName: string | null;
  dateCompleted: string | null;
  facilityClass: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityType: string | null;
  inspectionId: string;
  inspectionZone: string | null;
  mapSquare: string | null;
  operatingStatus: string | null;
  reportState: string | null;
}

export interface InspectionSearchParams {
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
  facilityClass?: string;
  facilityId?: string;
  facilityName?: string;
  inspectionId?: string;
}

// ============================================================================
// Compliance Reports
// ============================================================================

export interface ComplianceReport {
  accepted: string | null;
  category: string | null;
  comments: string | null;
  companyId: string | null;
  companyName: string | null;
  description: string | null;
  facilityClass: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityType: string | null;
  previousReportId: string | null;
  receivedDate: string | null;
  reportId: string;
  reportType: string | null;
  reviewedDate: string | null;
}

export interface ComplianceReportSearchParams {
  companyName?: string;
  facilityId?: string;
  facilityName?: string;
  reportId?: string;
  reportType?: string;
}

// ============================================================================
// Enforcement Actions
// ============================================================================

export interface EnforcementAction {
  actionId: string;
  actionState: string | null;
  actionType: string | null;
  companyId: string | null;
  companyName: string | null;
  docketNumber: string | null;
  facilityId: string | null;
  facilityName: string | null;
  isSep: boolean;
  penaltyAmount: number | null;
  potentialViolationEndDate: string | null;
  potentialViolationStartDate: string | null;
  sepOffsetAmount: number | null;
}

export interface EnforcementSearchParams {
  actionId?: string;
  actionType?: string;
  companyName?: string;
  facilityId?: string;
  facilityName?: string;
}

// ============================================================================
// Settlements
// ============================================================================

export interface Settlement {
  companyId: string | null;
  companyName: string | null;
  enforcementActionId: string | null;
  settlementAmount: number | null;
  settlementId: string;
  state: string | null;
}

export interface SettlementSearchParams {
  companyName?: string;
  enforcementActionId?: string;
  settlementId?: string;
}

// ============================================================================
// Complaints
// ============================================================================

export interface ComplaintFacility {
  companyName: string | null;
  facilityId: string | null;
  facilityName: string | null;
}

export interface Complaint {
  activityDate: string | null;
  closedDate: string | null;
  complaintId: string;
  enteredDate: string | null;
  facilities: ComplaintFacility[];
  inspectionZone: string | null;
  investigationCategory: string | null;
  investigationSubcategory: string | null;
  mapSquare: string | null;
  receivedDate: string | null;
  state: string | null;
}

// ============================================================================
// Site Visits
// ============================================================================

export interface SiteVisit {
  companyId: string | null;
  companyName: string | null;
  complianceIssue: string | null;
  evaluators: string | null;
  facilityClass: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityType: string | null;
  inspectionId: string | null;
  operatingStatus: string | null;
  visitDate: string | null;
  visitId: string;
  visitType: string | null;
}

export interface SiteVisitSearchParams {
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
  facilityId?: string;
  facilityName?: string;
  visitType?: string;
}

// ============================================================================
// Asbestos Notifications
// ============================================================================

export interface AsbestosInvoice {
  invoiceBalance: number | null;
  invoiceCharges: number | null;
  invoiceNumber: string | null;
}

export interface AsbestosNotification {
  asbestosZone: string | null;
  closedDate: string | null;
  companyId: string | null;
  companyName: string | null;
  county: string | null;
  createdDate: string | null;
  demolitionEndDate: string | null;
  demolitionStartDate: string | null;
  expirationDate: string | null;
  facilityId: string | null;
  facilityName: string | null;
  invoices: AsbestosInvoice[];
  legacyAsbNumber: string | null;
  notificationNumber: string;
  previousNotificationNumber: string | null;
  removalEndDate: string | null;
  removalStartDate: string | null;
  status: string | null;
  submittedDate: string | null;
}

// ============================================================================
// Invoices
// ============================================================================

export interface Invoice {
  balance: number | null;
  companyId: string | null;
  companyName: string | null;
  createdDate: string | null;
  dueDate: string | null;
  facilityId: string | null;
  facilityName: string | null;
  invoiceId: string;
  invoiceStatus: string | null;
  invoiceType: string | null;
  referenceNumber: string | null;
  totalCharges: number | null;
  totalCredits: number | null;
  totalPayments: number | null;
}

// ============================================================================
// Shared
// ============================================================================

export type CommandHandler = (args: string[]) => Promise<void>;
