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
  comments: string | null;
  companyName: string | null;
  facilityClass: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityType: string | null;
  reportId: string;
  reportType: string | null;
  [key: string]: string | null;
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
  actionType: string | null;
  companyName: string | null;
  docketNumber: string | null;
  facilityId: string | null;
  facilityName: string | null;
  [key: string]: string | number | null;
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
  companyName: string | null;
  enforcementActionId: string | null;
  settlementId: string;
  [key: string]: string | number | null;
}

export interface SettlementSearchParams {
  companyName?: string;
  enforcementActionId?: string;
  settlementId?: string;
}

// ============================================================================
// Site Visits
// ============================================================================

export interface SiteVisit {
  companyName: string | null;
  complianceIssue: string | null;
  facilityClass: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityType: string | null;
  visitDate: string | null;
  visitId: string;
  visitType: string | null;
  [key: string]: string | null;
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
// Shared
// ============================================================================

export type CommandHandler = (args: string[]) => Promise<void>;
