/// <reference types="@cloudflare/workers-types" />

// =============================================================================
// Environment
// =============================================================================

export interface Env {
  MONDAY_API_KEY: string;
  ENABLE_PROJECT_LINK_SYNC?: string;
  PROJECTS_BOARD_ID?: string;
  ESTIMATE_PROJECT_LINK_COL?: string;
  PROJECT_ESTIMATE_LINK_COL?: string;
  LEAD_PROJECT_LINK_COL?: string;
  ESTIMATE_PROJECT_NUMBER_COL?: string;
  LEAD_PROJECT_NUMBER_COL?: string;
  PROJECT_PROJECT_NUMBER_COL?: string;
}

// =============================================================================
// Monday.com Data
// =============================================================================

export interface MondayItem {
  id: string;
  name: string;
  bidStatus: string | null;
}

export interface ItemColumnValue {
  id: string;
  text?: string | null;
  linked_item_ids?: string[];
  label?: string;
  display_value?: string | null;
}

// =============================================================================
// Job Results
// =============================================================================

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

// =============================================================================
// Snapshots (for project link sync)
// =============================================================================

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
