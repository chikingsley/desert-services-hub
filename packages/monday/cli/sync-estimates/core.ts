/**
 * Core estimate sync logic.
 */
import { getItemsRich } from "@monday/client/rich";
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
  SyncResult,
} from "@monday/sync/types";
import { BOARD_IDS } from "@monday/types/schema";
import type { SharePointClient } from "@sharepoint/client";
import { parseStatusFromUrl } from "@sharepoint/paths";
import type { EstimateItem } from "./mapping";
import { mapEstimateItems } from "./mapping";

const DEFAULT_CONCURRENCY = 15;

const FILE_UPLOAD_LOG_PREFIX = "[DRY-RUN]";

function tallyAction(
  result: SyncResult,
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

async function processCreate(
  sp: SharePointClient,
  project: EstimateProject,
  result: SyncResult
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
      // Ignore deletion errors - folder might not exist
    }
  }

  return { files: uploaded, status: "created" };
}

async function processMove(
  sp: SharePointClient,
  project: EstimateProject,
  result: SyncResult
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
  result: SyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  if (project.action === "move") {
    return await processMove(sp, project, result);
  }
  if (project.action === "skip") {
    return { files: 0, status: "skipped" };
  }
  return await processCreate(sp, project, result);
}

function getProjectStatus(project: EstimateProject): string | null {
  const { statusFolder, existingUrl } = project;
  const currentStatus = parseStatusFromUrl(existingUrl ?? "");
  if (!(currentStatus && existingUrl)) {
    return null;
  }
  return currentStatus === statusFolder ? statusFolder : currentStatus;
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

/**
 * Sync estimate folders for all synced estimating items.
 */
export async function syncEstimateFolders(
  sp: SharePointClient,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const {
    limit,
    concurrency = DEFAULT_CONCURRENCY,
    dryRun = false,
    onProgress,
  } = options;

  const result: SyncResult = {
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

  const accountNameMap = await resolveAccountNames(items as EstimateItem[]);
  const projects = mapEstimateItems(items as EstimateItem[], accountNameMap);
  const total = projects.length;
  let completed = 0;

  reportProgress(onProgress, "syncing", { current: 0, total });

  if (dryRun) {
    for (const project of projects) {
      tallyAction(result, project.action);
      const status = getProjectStatus(project);
      completed += 1;
      reportProgress(onProgress, "syncing", {
        current: completed,
        total,
        phase: "syncing",
        itemName: project.projectName,
        action: `${FILE_UPLOAD_LOG_PREFIX} ${project.action}: ${project.folderPath}${
          status ? ` (status=${status})` : ""
        }`,
      });
    }
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

  reportProgress(onProgress, "complete", { current: total, total });
  return result;
}
