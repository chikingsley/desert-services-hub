/**
 * Contract Service Types
 *
 * Types for construction contract document processing
 */

export interface PartyInfo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  rocLicense?: string;
  representative?: string;
  title?: string;
}

export interface ProjectInfo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  number?: string;
  description?: string;
}

export interface ContractAmounts {
  originalAmount: number;
  retainage?: number;
  retainageAmount?: number;
  bonding?: {
    required: boolean;
    amount?: number;
    type?: string;
  };
}

export interface ContractDates {
  effectiveDate?: string;
  executionDate?: string;
  startDate?: string;
  completionDate?: string;
  duration?: string;
}

export interface InsuranceRequirements {
  generalLiability?: number;
  autoLiability?: number;
  workersComp?: boolean;
  umbrellaExcess?: number;
  professionalLiability?: number;
  additionalInsured?: boolean;
}

export interface SiteRequirements {
  badging?: string;
  backgroundCheck?: string;
  drugTesting?: string;
  safetyOrientation?: string;
  ppeRequirements?: string[];
  siteAccess?: string;
  parking?: string;
  security?: string;
}

export interface OperationalRequirements {
  dailyReports?: string;
  progressMeetings?: string;
  communication?: string;
  submittals?: string;
  rfiProcedure?: string;
  changeOrderProcedure?: string;
  noticeDays?: number;
}

export interface FinancialRequirements {
  paymentTerms?: string;
  invoiceRequirements?: string;
  lienWaivers?: string;
  retainageRelease?: string;
  storedMaterials?: boolean;
}

export interface RiskRequirements {
  liquidatedDamages?: string;
  warranty?: string;
  indemnification?: string;
  insuranceCertTiming?: string;
  bondingDetails?: string;
}

export interface ScheduleRequirements {
  milestoneDates?: string[];
  substantialCompletion?: string;
  punchList?: string;
  finalInspection?: string;
}

export interface ComprehensiveRequirements {
  site?: SiteRequirements;
  operational?: OperationalRequirements;
  financial?: FinancialRequirements;
  risk?: RiskRequirements;
  schedule?: ScheduleRequirements;
  redFlags?: string[];
  clarificationsNeeded?: string[];
  keyQuotes?: { section: string; quote: string }[];
}

export interface ScopeItem {
  description: string;
  included: boolean;
}

export interface ExhibitInfo {
  letter: string;
  title: string;
  description?: string;
  fileName?: string;
}

export type ContractDocType =
  | "SUBCONTRACT"
  | "EXHIBIT_A"
  | "EXHIBIT_B"
  | "EXHIBIT_C"
  | "EXHIBIT_D"
  | "EXHIBIT_E"
  | "EXHIBIT_F"
  | "ADMIN_MEMO"
  | "CHANGE_ORDER"
  | "PROPOSAL"
  | "FE_FORM"
  | "OTHER";

export interface ContractDetails {
  docType: ContractDocType;
  confidence: number;
  contractor?: PartyInfo;
  subcontractor?: PartyInfo;
  owner?: PartyInfo;
  project?: ProjectInfo;
  amounts?: ContractAmounts;
  dates?: ContractDates;
  insurance?: InsuranceRequirements;
  scopeOfWork?: string;
  scopeItems?: ScopeItem[];
  exclusions?: string[];
  exhibits?: ExhibitInfo[];
  contractNumber?: string;
  purchaseOrderNumber?: string;
  primeContractDate?: string;
  requirements?: ComprehensiveRequirements;
  rawText?: string;
  extractionMethod: "jina" | "gemini-vision";
  processingTimeMs: number;
}

export interface ContractPackageSummary {
  totalDocs: number;
  mainContract?: string;
  exhibitCount: number;
  totalAmount?: number;
  hasInsuranceInfo: boolean;
  hasScopeInfo: boolean;
  hasScheduleInfo: boolean;
  hasRequirementsInfo: boolean;
}

export interface ContractPackage {
  folderPath: string;
  processedAt: string;
  totalTimeMs: number;
  contractor?: PartyInfo;
  subcontractor?: PartyInfo;
  owner?: PartyInfo;
  project?: ProjectInfo;
  amounts?: ContractAmounts;
  dates?: ContractDates;
  insurance?: InsuranceRequirements;
  scopeOfWork?: string;
  exhibits?: ExhibitInfo[];
  requirements?: ComprehensiveRequirements;
  documents: ContractDetails[];
  summary: ContractPackageSummary;
}

export interface ContractExtractionOptions {
  forceVision?: boolean;
  includeRawText?: boolean;
  maxPages?: number;
  skipClassification?: boolean;
}

export type ContractFolderOptions = ContractExtractionOptions & {
  include?: string[];
  exclude?: string[];
};

export interface LineItemMatch {
  estimateItem: {
    description: string;
    total: number;
    quantity?: number;
    unit?: string;
  };
  contractMatch: "exact" | "partial" | "missing" | "modified";
  contractDescription?: string;
  contractAmount?: number;
  priceDifference?: number;
  notes: string;
}

export interface ReconciliationVerdict {
  status: "MATCH" | "EXPLAINABLE" | "NEEDS_REVIEW" | "CANNOT_RECONCILE";
  summary: string;
  nextSteps: string[];
}

export type RedFlagSeverity = "low" | "medium" | "high";

export interface ReconciliationResult {
  projectName: string;
  contractorName: string;
  reconciliationDate: string;
  financial: {
    estimateTotal: number;
    contractTotal: number;
    difference: number;
    percentDifference: number;
    explainedDifference: number;
    unexplainedDifference: number;
    matches: boolean;
    lineItems: LineItemMatch[];
    hasLineItemPricing: boolean;
  };
  scope: {
    additionalContractItems: {
      description: string;
      notes: string;
    }[];
    redFlags: {
      issue: string;
      severity: RedFlagSeverity;
      recommendation: string;
    }[];
  };
  verdict: ReconciliationVerdict;
  processingTimeMs: number;
}
