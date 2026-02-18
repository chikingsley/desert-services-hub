import { join } from "node:path";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";

/** Where downloaded files are stored (inside Docker volume). */
export const FILES_DIR =
  process.env.MONDAY_FILES_DIR ??
  join(import.meta.dir, "../../lib/db/monday-files");

/**
 * File columns on the ESTIMATING board -> storage path columns in estimates table.
 * Only ESTIMATE has a dedicated storage path column; others are stored in documents only.
 */
export const FILE_COLUMNS: Record<string, string | null> = {
  [ESTIMATING_COLUMNS.ESTIMATE.id]: "estimate_storage_path",
  [ESTIMATING_COLUMNS.PLANS.id]: null,
  [ESTIMATING_COLUMNS.CONTRACTS.id]: null,
  [ESTIMATING_COLUMNS.NOI.id]: null,
};

/** Column ID -> document type hint for classification bias. */
export const COLUMN_HINTS: Record<string, string> = {
  [ESTIMATING_COLUMNS.ESTIMATE.id]: "estimate",
  [ESTIMATING_COLUMNS.PLANS.id]: "plan",
  [ESTIMATING_COLUMNS.CONTRACTS.id]: "contract",
  [ESTIMATING_COLUMNS.NOI.id]: "noi",
};

/** Only the ESTIMATE column triggers PDF extraction via the old pipeline. */
export const EXTRACTION_COLUMN = ESTIMATING_COLUMNS.ESTIMATE.id;
