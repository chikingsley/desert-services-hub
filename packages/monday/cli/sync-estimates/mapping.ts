import type { MondayColumnValue } from "@monday/client/rich";
import type { EstimateProject } from "@monday/sync/types";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";
import {
  CUSTOMER_PROJECTS_PATH,
  extractUrl,
  getLetterFolder,
  getStatusFolder,
  parseStatusFromUrl,
  parseVariantPrefix,
  sanitizeName,
} from "@sharepoint/paths";

const VARIANT_FOLDER_PATH_RE =
  /Customer Projects\/([^/]+\/[^/]+\/[^/]+\/[^/]+)/i;

export interface EstimateItem {
  id: string;
  name: string;
  columns: Record<string, string | null>;
  columnValues: MondayColumnValue[];
}

export function buildUnknownProject(item: EstimateItem): EstimateProject {
  const { isVariant, suffix: variantSuffix } = parseVariantPrefix(item.name);
  return {
    accountName: "Unknown",
    action: "skip",
    existingUrl: null,
    folderPath: "",
    isVariant,
    itemName: item.name,
    letterFolder: "_Numeric",
    mondayId: item.id,
    projectName: sanitizeName(item.name),
    statusFolder: getStatusFolder(
      item.columns[ESTIMATING_COLUMNS.BID_STATUS.id]
    ),
    variantSuffix,
  };
}

export function deriveVariantFolderPath(
  existingUrl: string
): string | undefined {
  const pathMatch = existingUrl.match(VARIANT_FOLDER_PATH_RE);
  if (!pathMatch) {
    return undefined;
  }
  return `Customer Projects/${pathMatch[1]}`;
}

export function resolveExistingStatusAction(
  parsedUrl: string | null,
  statusFolder: string
): { action: "create" | "move" | "skip"; oldStatusFolder?: string } {
  if (!parsedUrl) {
    return { action: "create" };
  }

  if (parsedUrl !== statusFolder) {
    return { action: "move", oldStatusFolder: parsedUrl };
  }

  return { action: "skip" };
}

export function mapEstimate(
  item: EstimateItem,
  accountName: string | undefined
): EstimateProject {
  if (!accountName) {
    return buildUnknownProject(item);
  }

  const bidStatus = item.columns[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null;
  const {
    isVariant,
    baseName,
    suffix: variantSuffix,
  } = parseVariantPrefix(item.name);
  const sanitizedAccountName = sanitizeName(accountName);
  const projectName = sanitizeName(baseName);
  const statusFolder = getStatusFolder(bidStatus);
  const letterFolder = getLetterFolder(sanitizedAccountName);
  const folderPath = `${CUSTOMER_PROJECTS_PATH}/${statusFolder}/${letterFolder}/${sanitizedAccountName}/${projectName}`;

  const rawUrl = item.columns[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? "";
  const existingUrl = extractUrl(rawUrl);

  let action: "create" | "move" | "skip" = "create";
  let oldStatusFolder: string | undefined;
  let oldVariantFolderPath: string | undefined;

  if (existingUrl) {
    if (isVariant && VARIANT_FOLDER_PATH_RE.test(existingUrl)) {
      action = "create";
      oldVariantFolderPath = deriveVariantFolderPath(existingUrl);
    } else if (accountPathMatchesUrl(existingUrl, sanitizedAccountName)) {
      const parsedStatus = parseStatusFromUrl(existingUrl);
      const resolved = resolveExistingStatusAction(parsedStatus, statusFolder);
      action = resolved.action;
      oldStatusFolder = resolved.oldStatusFolder;
    }
  }

  return {
    accountName: sanitizedAccountName,
    action,
    existingUrl,
    folderPath,
    isVariant,
    itemName: item.name,
    letterFolder,
    mondayId: item.id,
    oldStatusFolder,
    oldVariantFolderPath,
    projectName,
    statusFolder,
    variantSuffix,
  };
}

function accountPathMatchesUrl(
  existingUrl: string,
  sanitizedAccountName: string
): boolean {
  const decodedUrl = decodeURIComponent(existingUrl);
  const expectedAccountPath = `/${sanitizedAccountName}/`;
  return decodedUrl.includes(expectedAccountPath);
}

export function mapEstimateItems(
  items: EstimateItem[],
  accountNames: Map<string, string>
): EstimateProject[] {
  return items.map((item) => mapEstimate(item, accountNames.get(item.id)));
}
