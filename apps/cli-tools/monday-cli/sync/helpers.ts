/**
 * Constants and helper functions for estimate folder sync.
 */
import { ESTIMATING_COLUMNS } from "@monday/types";

export const CUSTOMER_PROJECTS_PATH = "Customer Projects";

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

export const STATUS_MAP: Record<string, string> = {
  New: "Submitted",
  "Yet to Bid": "Submitted",
  "Bid Sent": "Submitted",
  Won: "Active",
  "Pending Won": "Active",
  "Add to Projects": "Active",
  Lost: "Lost",
  Duplicates: "Lost",
  "GC Not Awarded": "Lost",
};

export const DEFAULT_STATUS = "Submitted";
export const VALID_STATUSES = new Set([
  "Submitted",
  "Active",
  "Lost",
  "Finished",
]);

const ILLEGAL_CHARS_REGEX = /["*:<>?/\\|#%~{}]/g;
const URL_REGEX = /https?:\/\/\S+/;
const TRAILING_PERIODS_REGEX = /\.+$/;
export const VARIANT_PREFIX_REGEX = /^(TF|PJ|RO|REBID)[\s\-_:]+(.+)$/i;
export const VARIANT_FOLDER_REGEX = /\/(TF|PJ|RO|REBID)[\s\-_:]/i;
export const CUSTOMER_PROJECTS_PATH_REGEX = /Customer Projects\/(.+)$/;

export function extractUrl(raw: string): string | null {
  const match = raw.match(URL_REGEX);
  return match ? match[0].trim() : null;
}

export function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\r\n]+/g, " ")
    .replace(ILLEGAL_CHARS_REGEX, "")
    .trim()
    .replace(TRAILING_PERIODS_REGEX, "");
}

/**
 * Check if a project name has a variant prefix and extract the base name.
 * Variant items should be consolidated into the same folder as the main project.
 *
 * Supported prefixes:
 *   - TF = Temp Fence
 *   - PJ = Porta John (portable toilets)
 *   - RO = Rough Grade Only
 *   - REBID = Re-bid of an existing project
 */
export function parseVariantPrefix(name: string): {
  isVariant: boolean;
  baseName: string;
  suffix: string | null;
} {
  const trimmed = name.trim();
  const variantMatch = trimmed.match(VARIANT_PREFIX_REGEX);
  if (variantMatch) {
    return {
      isVariant: true,
      baseName: variantMatch[2].trim(),
      suffix: variantMatch[1].toUpperCase(),
    };
  }
  return { isVariant: false, baseName: trimmed, suffix: null };
}

export function getStatusFolder(bidStatus: string | null): string {
  if (!bidStatus) {
    return DEFAULT_STATUS;
  }
  return STATUS_MAP[bidStatus] ?? DEFAULT_STATUS;
}

export function getLetterFolder(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  if (first >= "A" && first <= "Z") {
    return first;
  }
  return "_Numeric";
}

export function parseStatusFromUrl(url: string): string | null {
  const decoded = decodeURIComponent(url);
  const marker = "Customer Projects/";
  const idx = decoded.indexOf(marker);
  if (idx === -1) {
    return null;
  }
  const afterMarker = decoded.slice(idx + marker.length);
  const status = afterMarker.split("/")[0];
  if (status && VALID_STATUSES.has(status)) {
    return status;
  }
  return null;
}
