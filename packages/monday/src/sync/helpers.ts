/**
 * Monday-specific constants for estimate folder sync.
 */
import {
  ESTIMATING_COLUMNS,
  ESTIMATING_SKIP_GROUPS,
} from "@monday/types/schema";

export const SKIP_GROUPS: readonly string[] = ESTIMATING_SKIP_GROUPS;

export const FILE_COLUMNS = [
  { column: ESTIMATING_COLUMNS.ESTIMATE, subfolder: "Estimates" },
  { column: ESTIMATING_COLUMNS.PLANS, subfolder: "Plans" },
  { column: ESTIMATING_COLUMNS.CONTRACTS, subfolder: "Contracts" },
  { column: ESTIMATING_COLUMNS.NOI, subfolder: "NOI" },
] as const;
