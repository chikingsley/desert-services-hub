/**
 * Contract Service Types
 *
 * Types for construction contract document processing
 */

export type PartyInfo = {
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
};

export type ProjectInfo = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  number?: string;
  description?: string;
};

export type ContractAmounts = {
  originalAmount: number;
  retainage?: number;
  retainageAmount?: number;
  bonding?: {
    required: boolean;
    amount?: number;
    type?: string;
  };
};

export type ContractDates = {
  effectiveDate?: string;
  executionDate?: string;
  startDate?: string;
  completionDate?: string;
  duration?: string;
};

export type InsuranceRequirements = {
  generalLiability?: number;
  autoLiability?: number;
  workersComp?: boolean;
  umbrellaExcess?: number;
  professionalLiability?: number;
  additionalInsured?: boolean;
};

export type SiteRequirements = {
  badging?: string;
  backgroundCheck?: string;
  drugTesting?: string;
  safetyOrientation?: string;
  ppeRequirements?: string[];
  siteAccess?: string;
  parking?: string;
  security?: string;
};

export type OperationalRequirements = {
  dailyReports?: string;
  progressMeetings?: string;
  communication?: string;
  submittals?: string;
  rfiProcedure?: string;
  changeOrderProcedure?: string;
  noticeDays?: number;
};

export type FinancialRequirements = {
  paymentTerms?: string;
  invoiceRequirements?: string;
  lienWaivers?: string;
  retainageRelease?: string;
  storedMaterials?: boolean;
};

export type RiskRequirements = {
  liquidatedDamages?: string;
  warranty?: string;
  indemnification?: string;
  insuranceCertTiming?: string;
  bondingDetails?: string;
};

export type ScheduleRequirements = {
  milestoneDates?: string[];
  substantialCompletion?: string;
  punchList?: string;
  finalInspection?: string;
};

export type ComprehensiveRequirements = {
  site?: SiteRequirements;
  operational?: OperationalRequirements;
  financial?: FinancialRequirements;
  risk?: RiskRequirements;
  schedule?: ScheduleRequirements;
  redFlags?: string[];
  clarificationsNeeded?: string[];
  keyQuotes?: { section: string; quote: string }[];
};

export type ScopeItem = {
  description: string;
  included: boolean;
};

export type ExhibitInfo = {
  letter: string;
  title: string;
  description?: string;
  fileName?: string;
};

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

export type ContractDetails = {
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
};

export type ContractPackageSummary = {
  totalDocs: number;
  mainContract?: string;
  exhibitCount: number;
  totalAmount?: number;
  hasInsuranceInfo: boolean;
  hasScopeInfo: boolean;
  hasScheduleInfo: boolean;
  hasRequirementsInfo: boolean;
};

export type ContractPackage = {
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
};

export type ContractExtractionOptions = {
  forceVision?: boolean;
  includeRawText?: boolean;
  maxPages?: number;
  skipClassification?: boolean;
};

export type ContractFolderOptions = ContractExtractionOptions & {
  include?: string[];
  exclude?: string[];
};

export type LineItemMatch = {
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
};

export type ReconciliationVerdict = {
  status: "MATCH" | "EXPLAINABLE" | "NEEDS_REVIEW" | "CANNOT_RECONCILE";
  summary: string;
  nextSteps: string[];
};

export type RedFlagSeverity = "low" | "medium" | "high";

export type ReconciliationResult = {
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
};
