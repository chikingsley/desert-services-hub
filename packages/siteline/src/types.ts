export interface GraphQLErrorItem {
  message: string;
}

export interface GraphQLResponse<TData> {
  data?: TData;
  errors?: GraphQLErrorItem[];
}

export type GraphQLOperationType =
  | "mutation"
  | "query"
  | "selection-set"
  | "subscription"
  | "unknown";

export interface CurrentCompany {
  id: string;
  name: string;
}

export interface CurrentCompanyResponse {
  currentCompany: CurrentCompany;
}

export interface ProjectSummary {
  id: string;
  name: string;
  projectNumber: string;
}

export interface ContractSummary {
  contractNumber: string | null;
  id: string;
  internalProjectNumber: string | null;
  project: ProjectSummary;
  status: string;
}

export interface PaginatedContractsInput {
  billingType?: string;
  complianceStatus?: string;
  contractStatus?: string;
  cursor?: string | null;
  generalContractorIds?: string[];
  hasBillingForecast?: boolean;
  leadPMIds?: string[];
  limit?: number;
  month?: string;
  officeIds?: string[];
  payAppStatus?: string;
  projectIds?: string[];
  search?: string;
  sortCriteria?: string;
  sortOrder?: string;
  submitVia?: string;
}

export interface PaginatedContractsPage {
  contracts: ContractSummary[];
  cursor: string | null;
  hasNext: boolean;
}

export interface PaginatedContractsResponse {
  paginatedContracts: PaginatedContractsPage;
}

export interface PaginatedPayAppsInput {
  cursor?: string | null;
  limit?: number;
  paidInMonth?: string;
  status?: string;
  submittedInMonth?: string;
}

export interface PayAppSummary {
  billingEnd: string;
  billingStart: string;
  id: string;
  payAppNumber: number;
  status: string;
  submittedAt: string | null;
}

export interface PaginatedPayAppsPage {
  cursor: string | null;
  hasNext: boolean;
  payApps: PayAppSummary[];
}

export interface PaginatedPayAppsResponse {
  paginatedPayApps: PaginatedPayAppsPage;
}

export interface ContractPayAppSummary {
  id: string;
  payAppNumber: number;
  status: string;
}

export interface ContractDetails {
  contractNumber: string | null;
  id: string;
  internalProjectNumber: string | null;
  payApps: ContractPayAppSummary[];
  project: ProjectSummary;
  status: string;
}

export interface ContractResponse {
  contract: ContractDetails;
}

export interface SovLineItemSummary {
  code: string | null;
  id: string;
  name: string;
}

export interface PayAppProgressItem {
  id: string;
  progressBilled: number;
  sovLineItem: SovLineItemSummary;
  storedMaterialBilled: number;
  totalValue: number;
}

export interface PayAppDetails {
  billingEnd: string;
  billingStart: string;
  currentBilled: number;
  currentRetention: number;
  id: string;
  payAppNumber: number;
  progress: PayAppProgressItem[];
  status: string;
  submittedAt: string | null;
  timeZone: string;
  totalRetention: number;
}

export interface PayAppResponse {
  payApp: PayAppDetails;
}
