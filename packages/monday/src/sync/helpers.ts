/**
 * Monday-specific constants for estimate folder sync.
 *
 * SharePoint path utilities live in @sharepoint/paths — re-exported here
 * so existing importers (sync-estimates.ts, sharepoint-ops.ts) keep working.
 */
// Re-export shared SharePoint path utilities
export {
  CUSTOMER_PROJECTS_PATH,
  CUSTOMER_PROJECTS_PATH_REGEX,
  DEFAULT_STATUS,
  extractUrl,
  getLetterFolder,
  getStatusFolder,
  parseStatusFromUrl,
  parseVariantPrefix,
  STATUS_MAP,
  sanitizeName,
  VALID_STATUSES,
  VARIANT_FOLDER_REGEX,
  VARIANT_PREFIX_REGEX,
} from "@sharepoint/paths";

import { ESTIMATING_COLUMNS } from "@monday/types";

export const SKIP_GROUPS = [
  "Shell Estimates ( Do Not Move)",
  "Sales Team Estimates",
];

export const FILE_COLUMNS = [
  { column: ESTIMATING_COLUMNS.ESTIMATE, subfolder: "Estimates" },
  { column: ESTIMATING_COLUMNS.PLANS, subfolder: "Plans" },
  { column: ESTIMATING_COLUMNS.CONTRACTS, subfolder: "Contracts" },
  { column: ESTIMATING_COLUMNS.NOI, subfolder: "NOI" },
] as const;
