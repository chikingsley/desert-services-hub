/**
 * Types for Monday status sync jobs.
 */

export interface CleanupResult {
  errors: string[];
  openSentCount: number;
  toUpdateCount: number;
  updatedCount: number;
  wonCount: number;
}

export interface LeadsSyncResult {
  alreadyCorrectCount?: number;
  errors: string[];
  leadsCount: number;
  noMappingCount?: number;
  noStatusCount?: number;
  skippedCount: number;
  updatedCount: number;
}

export interface ProjectLinkSyncResult {
  enabled: boolean;
  errors: string[];
  leadsCount: number;
  linkedEstimates: number;
  linkedLeads: number;
  linkedProjects: number;
  projectNumbersUpdated: number;
  skippedCount: number;
}

export interface ProjectLinkSyncConfig {
  enabled: boolean;
  estimateProjectLinkCol: string;
  estimateProjectNumberCol: string | null;
  leadProjectLinkCol: string | null;
  leadProjectNumberCol: string | null;
  projectEstimateLinkCol: string;
  projectProjectNumberCol: string | null;
  projectsBoardId: string;
}

export interface LeadWithEstimate {
  currentStatus: string | null;
  estimateId: string;
  id: string;
  linkedProjectIds: string[];
  mirroredBidStatus: string | null;
  name: string;
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
  display_value?: string | null;
  id: string;
  label?: string;
  linked_item_ids?: string[];
  text?: string | null;
}
