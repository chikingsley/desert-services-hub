/**
 * Monday-specific constants for estimate folder sync.
 */
import { ESTIMATING_COLUMNS } from "@monday/types/schema";

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
