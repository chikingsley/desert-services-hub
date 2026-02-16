import { join } from "node:path";
import { ESTIMATING_COLUMNS } from "@monday/types";

/** Where downloaded files are stored (inside Docker volume). */
export const FILES_DIR =
  process.env.MONDAY_FILES_DIR ??
  join(import.meta.dir, "../../lib/db/monday-files");

/** CWD for the pdf-analysis Python CLI. */
export const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../packages/documents/pdf-analysis-cli"
);

/** File columns on the ESTIMATING board -> storage path columns in estimates table. */
export const FILE_COLUMNS = {
  [ESTIMATING_COLUMNS.ESTIMATE.id]: "estimate_storage_path",
} as const;

/** Only the ESTIMATE column triggers PDF extraction. */
export const EXTRACTION_COLUMN = ESTIMATING_COLUMNS.ESTIMATE.id;
