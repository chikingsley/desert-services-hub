/**
 * SharePoint folder sync for Monday ESTIMATING board items.
 *
 * This is the canonical runtime implementation used by Trigger.dev tasks
 * and maintenance scripts.
 * It is intentionally package-level logic so runners stay as thin adapters.
 */

import { getItemsRich, type MondayItemRich } from "@monday/client/rich";
import { SKIP_GROUPS } from "@monday/sync/helpers";
import { resolveAccountNames } from "@monday/sync/monday-fetch";
import {
  clearFolderCache,
  ensureProjectHierarchy,
  moveProjectFolder,
  uploadFilesForProject,
  writeBackUrl,
} from "@monday/sync/sharepoint-ops";
import type {
  EstimateProject,
  SyncOptions,
  SyncProgress,
} from "@monday/sync/types";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types/schema";
import { SharePointClient } from "@sharepoint/client";
import {
  CUSTOMER_PROJECTS_PATH,
  extractUrl,
  getLetterFolder,
  getStatusFolder,
  parseStatusFromUrl,
  parseVariantPrefix,
  sanitizeName,
} from "@sharepoint/paths";

const DEFAULT_CONCURRENCY = 15;
const PROGRESS_DRY_RUN_PREFIX = "[DRY-RUN]";
const VARIANT_FOLDER_PATH_RE =
  /Customer Projects\/([^/]+\/[^/]+\/[^/]+\/[^/]+)/i;

export interface SharePointSyncResult {
  created: number;
  errors: string[];
  filesUploaded: number;
  moved: number;
  processed: number;
  skipped: number;
}

function requireEnv(
  name: "AZURE_TENANT_ID" | "AZURE_CLIENT_ID" | "AZURE_CLIENT_SECRET"
): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

function createSharePointClientFromEnv(): SharePointClient {
  return new SharePointClient({
    azureClientId: requireEnv("AZURE_CLIENT_ID"),
    azureClientSecret: requireEnv("AZURE_CLIENT_SECRET"),
    azureTenantId: requireEnv("AZURE_TENANT_ID"),
  });
}

function buildUnknownProject(item: MondayItemRich): EstimateProject {
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

function deriveVariantFolderPath(existingUrl: string): string | undefined {
  const pathMatch = existingUrl.match(VARIANT_FOLDER_PATH_RE);
  if (!pathMatch) {
    return undefined;
  }
  return `${CUSTOMER_PROJECTS_PATH}/${pathMatch[1]}`;
}

function resolveExistingStatusAction(
  parsedStatus: string | null,
  statusFolder: string
): { action: "create" | "move" | "skip"; oldStatusFolder?: string } {
  if (!parsedStatus) {
    return { action: "create" };
  }

  if (parsedStatus !== statusFolder) {
    return { action: "move", oldStatusFolder: parsedStatus };
  }

  return { action: "skip" };
}

function accountPathMatchesUrl(
  existingUrl: string,
  sanitizedAccountName: string
): boolean {
  const decodedUrl = decodeURIComponent(existingUrl);
  const expectedAccountPath = `/${sanitizedAccountName}/`;
  return decodedUrl.includes(expectedAccountPath);
}

function mapEstimate(
  item: MondayItemRich,
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

function mapEstimateItems(
  items: MondayItemRich[],
  accountNames: Map<string, string>
): EstimateProject[] {
  return items.map((item) => mapEstimate(item, accountNames.get(item.id)));
}

function tallyAction(
  result: SharePointSyncResult,
  action: "create" | "move" | "skip"
): void {
  if (action === "create") {
    result.created += 1;
  } else if (action === "move") {
    result.moved += 1;
  } else {
    result.skipped += 1;
  }
}

function getProjectStatus(project: EstimateProject): string | null {
  const currentStatus = parseStatusFromUrl(project.existingUrl ?? "");
  if (!(currentStatus && project.existingUrl)) {
    return null;
  }
  return currentStatus === project.statusFolder
    ? project.statusFolder
    : currentStatus;
}

function reportProgress(
  onProgress: SyncOptions["onProgress"] | undefined,
  phase: SyncProgress["phase"],
  updates: Partial<SyncProgress> & { current?: number; total?: number }
): void {
  onProgress?.({
    current: updates.current,
    filesUploaded: updates.filesUploaded,
    phase,
    total: updates.total,
    itemName: updates.itemName,
    errorMessage: updates.errorMessage,
    action: updates.action,
    status: updates.status,
  });
}

async function processCreate(
  sp: SharePointClient,
  project: EstimateProject,
  result: SharePointSyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  try {
    await ensureProjectHierarchy(sp, project);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create folder "${project.folderPath}": ${msg}`, {
      cause: error,
    });
  }

  const uploaded = await uploadFilesForProject(sp, project, result.errors);
  result.filesUploaded += uploaded;

  try {
    await writeBackUrl(sp, project);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to write URL for "${project.projectName}": ${msg}`,
      {
        cause: error,
      }
    );
  }

  if (project.oldVariantFolderPath) {
    try {
      await sp.delete(project.oldVariantFolderPath);
    } catch {
      // Ignore deletion failures: folder may not exist after consolidation.
    }
  }

  return { files: uploaded, status: "created" };
}

async function processMove(
  sp: SharePointClient,
  project: EstimateProject,
  result: SharePointSyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  try {
    await moveProjectFolder(sp, project);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("could not be found") || msg.includes("does not exist")) {
      return processCreate(sp, project, result);
    }
    throw new Error(
      `Failed to move folder for "${project.projectName}": ${msg}`,
      {
        cause: error,
      }
    );
  }

  const uploaded = await uploadFilesForProject(sp, project, result.errors);
  result.filesUploaded += uploaded;
  await writeBackUrl(sp, project);
  return { files: uploaded, status: "moved" };
}

async function processOneProject(
  sp: SharePointClient,
  project: EstimateProject,
  result: SharePointSyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  if (project.action === "move") {
    return await processMove(sp, project, result);
  }
  if (project.action === "skip") {
    return { files: 0, status: "skipped" };
  }
  return await processCreate(sp, project, result);
}

export async function syncSharePointFolders(
  options: SyncOptions = {}
): Promise<SharePointSyncResult> {
  const sp = createSharePointClientFromEnv();
  return await syncSharePointFoldersWithClient(sp, options);
}

export async function syncSharePointFoldersWithClient(
  sp: SharePointClient,
  options: SyncOptions = {}
): Promise<SharePointSyncResult> {
  const {
    limit,
    concurrency = DEFAULT_CONCURRENCY,
    dryRun = false,
    onProgress,
  } = options;

  const result: SharePointSyncResult = {
    processed: 0,
    created: 0,
    errors: [],
    filesUploaded: 0,
    moved: 0,
    skipped: 0,
  };

  clearFolderCache();
  reportProgress(onProgress, "fetching", {
    total: undefined,
    current: undefined,
  });

  const fetchOptions = limit && limit > 0 ? { maxItems: limit } : {};
  let items = await getItemsRich(BOARD_IDS.ESTIMATING, fetchOptions);
  if (limit && limit > 0 && items.length > limit) {
    items = items.slice(0, limit);
  }

  const originalCount = items.length;
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
  if (items.length < originalCount) {
    console.log(
      `Filtered out ${originalCount - items.length} items from skipped groups`
    );
  }

  reportProgress(onProgress, "fetching", { current: 0, total: items.length });

  const accountNameMap = await resolveAccountNames(items);
  const projects = mapEstimateItems(items, accountNameMap);
  const total = projects.length;
  let completed = 0;

  result.processed = total;
  reportProgress(onProgress, "syncing", { current: 0, total });

  if (dryRun) {
    for (const project of projects) {
      tallyAction(result, project.action);
      completed += 1;

      const status = getProjectStatus(project);
      reportProgress(onProgress, "syncing", {
        current: completed,
        total,
        phase: "syncing",
        itemName: project.projectName,
        action: `${PROGRESS_DRY_RUN_PREFIX} ${project.action}: ${project.folderPath}${
          status ? ` (status=${status})` : ""
        }`,
      });
    }

    result.processed = completed;
    reportProgress(onProgress, "complete", { current: total, total });
    return result;
  }

  for (let i = 0; i < projects.length; i += concurrency) {
    const batch = projects.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (project) => {
        try {
          const outcome = await processOneProject(sp, project, result);
          tallyAction(result, project.action);
          completed += 1;
          reportProgress(onProgress, "syncing", {
            current: completed,
            filesUploaded: outcome.files,
            itemName: project.projectName,
            phase: "syncing",
            status: outcome.status,
            total,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`${project.projectName}: ${errMsg}`);
          completed += 1;
          reportProgress(onProgress, "syncing", {
            current: completed,
            errorMessage: errMsg,
            itemName: project.projectName,
            phase: "syncing",
            status: "error",
            total,
          });
        }
      })
    );
  }

  result.processed = completed;
  reportProgress(onProgress, "complete", { current: total, total });
  return result;
}
