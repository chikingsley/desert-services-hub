/**
 * Types for Monday status sync jobs.
 */

export interface CleanupResult {
  wonCount: number;
  openSentCount: number;
  toUpdateCount: number;
  updatedCount: number;
  errors: string[];
}

export interface LeadsSyncResult {
  leadsCount: number;
  updatedCount: number;
  skippedCount: number;
  noStatusCount?: number;
  noMappingCount?: number;
  alreadyCorrectCount?: number;
  errors: string[];
}

export interface ProjectLinkSyncResult {
  enabled: boolean;
  leadsCount: number;
  linkedLeads: number;
  linkedEstimates: number;
  linkedProjects: number;
  projectNumbersUpdated: number;
  skippedCount: number;
  errors: string[];
}

export interface ProjectLinkSyncConfig {
  enabled: boolean;
  projectsBoardId: string;
  estimateProjectLinkCol: string;
  projectEstimateLinkCol: string;
  leadProjectLinkCol: string | null;
  estimateProjectNumberCol: string | null;
  leadProjectNumberCol: string | null;
  projectProjectNumberCol: string | null;
}

export interface LeadWithEstimate {
  id: string;
  name: string;
  estimateId: string;
  currentStatus: string | null;
  mirroredBidStatus: string | null;
  linkedProjectIds: string[];
  projectNumber: string | null;
}

export interface EstimateSnapshot {
  id: string;
  linkedProjectIds: string[];
  projectNumber: string | null;
}

export interface ProjectSnapshot {
  id: string;
  linkedEstimateIds: string[];
  projectNumber: string | null;
}

export interface LeadFetchOptions {
  leadProjectLinkCol?: string | null;
  leadProjectNumberCol?: string | null;
}

/** Column value shape from Monday GraphQL (with typed fragments). */
export interface ItemColumnValue {
  id: string;
  text?: string | null;
  linked_item_ids?: string[];
  label?: string;
  display_value?: string | null;
}
