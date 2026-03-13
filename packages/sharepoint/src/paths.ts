/**
 * Shared SharePoint folder path utilities.
 *
 * Single source of truth for folder name sanitization, letter-folder routing,
 * variant-prefix parsing, status mapping, and URL helpers.
 *
 * Consumers: monday sync package, inspections-email-worker
 */

// =============================================================================
// Constants
// =============================================================================

export const CUSTOMER_PROJECTS_PATH = "Customer Projects";
export const UNCATEGORIZED_CUSTOMER_PROJECTS_PATH = `${CUSTOMER_PROJECTS_PATH}/Uncategorized`;

export const SHAREPOINT_HOST = "desertservices.sharepoint.com";
export const SHAREPOINT_SITE_PATH = "/sites/DataDrive";

export const STATUS_MAP: Record<string, string> = {
  "Add to Projects": "Active",
  "Bid Sent": "Submitted",
  Duplicates: "Lost",
  "GC Not Awarded": "Lost",
  Lost: "Lost",
  New: "Submitted",
  "Pending Won": "Active",
  Won: "Active",
  "Yet to Bid": "Submitted",
};

export const DEFAULT_STATUS = "Submitted";

export const VALID_STATUSES = new Set([
  "Submitted",
  "Active",
  "Lost",
  "Finished",
]);

export const VARIANT_PREFIXES = [
  "TF",
  "PJ",
  "RO",
  "REBID",
  "CFS",
  "INSPECTIONS",
  "LW",
  "MISC",
  "SF",
  "SS",
] as const;

// =============================================================================
// Compiled regex patterns (top-level for performance)
// =============================================================================

const ILLEGAL_CHARS_REGEX = /["*:<>?/\\|#%~{}]/g;
const TRAILING_PERIODS_REGEX = /\.+$/;
const URL_REGEX = /https?:\/\/\S+/;

export const VARIANT_PREFIX_REGEX = new RegExp(
  `^(${VARIANT_PREFIXES.join("|")})[\\s\\-_:]+(.+)$`,
  "i"
);

export const VARIANT_FOLDER_REGEX = new RegExp(
  `/(${VARIANT_PREFIXES.join("|")})[\\s\\-_:]`,
  "i"
);

export const CUSTOMER_PROJECTS_PATH_REGEX = /Customer Projects\/(.+)$/;

// =============================================================================
// Sanitization
// =============================================================================

/**
 * Sanitize a name for use as a SharePoint folder/file name.
 * Collapses newlines, replaces illegal characters with `_`,
 * trims whitespace, and strips trailing periods.
 */
export function sanitizeName(name: string): string {
  return name
    .replaceAll(/[\r\n]+/g, " ")
    .replace(ILLEGAL_CHARS_REGEX, "_")
    .trim()
    .replace(TRAILING_PERIODS_REGEX, "");
}

// =============================================================================
// Folder routing
// =============================================================================

/**
 * Get the single-letter folder (A–Z) for alphabetical grouping.
 * Names starting with a digit go to `_Numeric`.
 */
export function getLetterFolder(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "_Numeric";
}

/**
 * Get the A-M / N-Z half-alphabet folder used by the inspections tree.
 * Numbers and A–M → "PROJECTS A-M", N–Z → "PROJECTS N-Z".
 */
export function getProjectsFolder(name: string): string {
  const first = name.charAt(0).toUpperCase();
  const isFirstHalf =
    (first >= "0" && first <= "9") || (first >= "A" && first <= "M");
  return isFirstHalf ? "PROJECTS A-M" : "PROJECTS N-Z";
}

// =============================================================================
// Variant prefix parsing
// =============================================================================

export interface VariantResult {
  baseName: string;
  isVariant: boolean;
  suffix: string | null;
}

/**
 * Check if a project name has a variant prefix and extract the base name.
 *
 * Supported prefixes: TF (Temp Fence), PJ (Porta John), RO (Rough Grade Only),
 * REBID, CFS, INSPECTIONS, LW (Lien Waiver), MISC, SF, SS.
 */
export function parseVariantPrefix(name: string): VariantResult {
  const trimmed = name.trim();
  const match = trimmed.match(VARIANT_PREFIX_REGEX);
  if (match) {
    return {
      baseName: match[2].trim(),
      isVariant: true,
      suffix: match[1].toUpperCase(),
    };
  }
  return { baseName: trimmed, isVariant: false, suffix: null };
}

// =============================================================================
// Status helpers
// =============================================================================

/**
 * Map a Monday bid-status label to a SharePoint status folder name.
 */
export function getStatusFolder(bidStatus: string | null): string {
  if (!bidStatus) {
    return DEFAULT_STATUS;
  }
  return STATUS_MAP[bidStatus] ?? DEFAULT_STATUS;
}

/**
 * Extract the status folder name from a SharePoint "Customer Projects/…" URL.
 */
export function parseStatusFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  const decoded = decodeURIComponent(url);
  const marker = "Customer Projects/";
  const idx = decoded.indexOf(marker);
  if (idx === -1) {
    return null;
  }
  const afterMarker = decoded.slice(idx + marker.length);
  const status = afterMarker.split("/")[0];
  return status && VALID_STATUSES.has(status) ? status : null;
}

// =============================================================================
// URL helpers
// =============================================================================

/**
 * Extract the first HTTP(S) URL from a string.
 */
export function extractUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0].trim() : null;
}

/**
 * Build a full SharePoint URL from a relative document-library path.
 */
export function buildSharePointUrl(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://${SHAREPOINT_HOST}${SHAREPOINT_SITE_PATH}/Shared%20Documents/${encodedPath}`;
}

/**
 * Build the canonical folder path for a project under Customer Projects.
 * Pattern: Customer Projects/{status}/{letter}/{account}/{project}
 */
export function buildCustomerProjectsPath(params: {
  accountName: string;
  projectName: string;
  statusFolder: string;
}): string {
  const account = sanitizeName(params.accountName);
  const { baseName } = parseVariantPrefix(params.projectName);
  const project = sanitizeName(baseName);
  const letter = getLetterFolder(account);
  return `${CUSTOMER_PROJECTS_PATH}/${params.statusFolder}/${letter}/${account}/${project}`;
}
