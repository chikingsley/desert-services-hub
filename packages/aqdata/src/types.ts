// ============================================================================
// Dust Applications
// ============================================================================

export interface DustApplication {
  applicationId: string;
  facilityId: string | null;
  facilityName: string | null;
  projectName: string | null;
  companyId: string | null;
  companyName: string | null;
  status: string | null;
  submittedDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  closedDate: string | null;
  previousAppId: string | null;
  projectStartDate: string | null;
  projectCompletionDate: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  isBlockPermit: boolean;
  isAccelerated: boolean;
  invoiceNumber: string | null;
  invoiceCharges: number | null;
  invoiceBalance: number | null;
}

export type DustAppStatus =
  | "Active"
  | "Closed"
  | "Rejected"
  | "Submitted"
  | "Superseded";

export interface DustAppSearchParams {
  statuses?: DustAppStatus[];
  applicationId?: string;
  facilityId?: string;
  facilityName?: string;
  projectName?: string;
  companyName?: string;
  address?: string;
  city?: string;
  parcel?: string;
  blockPermitOnly?: boolean;
  acceleratedOnly?: boolean;
}

// ============================================================================
// Inspections
// ============================================================================

export interface Inspection {
  inspectionId: string;
  facilityId: string | null;
  facilityName: string | null;
  facilityClass: string | null;
  facilityType: string | null;
  companyId: string | null;
  companyName: string | null;
  operatingStatus: string | null;
  inspectionZone: string | null;
  asbestosZone: string | null;
  mapSquare: string | null;
  dateCompleted: string | null;
  reportState: string | null;
}

export interface InspectionSearchParams {
  facilityId?: string;
  facilityName?: string;
  facilityClass?: string;
  inspectionId?: string;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================================================
// Compliance Reports
// ============================================================================

export interface ComplianceReport {
  reportId: string;
  facilityId: string | null;
  facilityName: string | null;
  facilityClass: string | null;
  facilityType: string | null;
  reportType: string | null;
  comments: string | null;
  companyName: string | null;
  accepted: string | null;
  [key: string]: string | null;
}

export interface ComplianceReportSearchParams {
  facilityId?: string;
  facilityName?: string;
  reportId?: string;
  reportType?: string;
  companyName?: string;
}

// ============================================================================
// Enforcement Actions
// ============================================================================

export interface EnforcementAction {
  actionId: string;
  facilityId: string | null;
  facilityName: string | null;
  companyName: string | null;
  docketNumber: string | null;
  actionType: string | null;
  [key: string]: string | number | null;
}

export interface EnforcementSearchParams {
  facilityId?: string;
  facilityName?: string;
  actionId?: string;
  companyName?: string;
  actionType?: string;
}

// ============================================================================
// Settlements
// ============================================================================

export interface Settlement {
  settlementId: string;
  companyName: string | null;
  enforcementActionId: string | null;
  [key: string]: string | number | null;
}

export interface SettlementSearchParams {
  settlementId?: string;
  companyName?: string;
  enforcementActionId?: string;
}

// ============================================================================
// Site Visits
// ============================================================================

export interface SiteVisit {
  visitId: string;
  facilityId: string | null;
  facilityName: string | null;
  facilityClass: string | null;
  facilityType: string | null;
  visitType: string | null;
  complianceIssue: string | null;
  companyName: string | null;
  visitDate: string | null;
  [key: string]: string | null;
}

export interface SiteVisitSearchParams {
  facilityId?: string;
  facilityName?: string;
  visitType?: string;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================================================
// Shared
// ============================================================================

export type CommandHandler = (args: string[]) => Promise<void>;
