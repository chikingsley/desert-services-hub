/**
 * SharePoint folder operations for estimate sync.
 *
 * Handles folder creation, file uploads, folder moves, and URL writeback.
 */

import { updateItem } from "@monday/client/search";
import { FILE_COLUMNS } from "@monday/sync/helpers";
import { downloadAsset, fetchAllColumnAssets } from "@monday/sync/monday-fetch";
import type { Asset, EstimateProject } from "@monday/sync/types";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types/schema";
import type { SharePointClient } from "@sharepoint/client";
import { CUSTOMER_PROJECTS_PATH } from "@sharepoint/paths";

// Cache for folders we've already ensured exist (persists across projects in a sync run)
const folderExistsCache = new Set<string>();
const FILE_UPLOAD_CONCURRENCY = 5;
const TRANSIENT_ERRORS = ["eTag", "changed since", "412", "503"] as const;

/**
 * Clear the folder existence cache (call at start of each sync run).
 */
export function clearFolderCache(): void {
  folderExistsCache.clear();
}

async function ensureFolderCached(
  sp: SharePointClient,
  parentPath: string,
  folderName: string
): Promise<void> {
  const fullPath =
    parentPath === "/" || parentPath === ""
      ? folderName
      : `${parentPath}/${folderName}`;

  if (folderExistsCache.has(fullPath)) {
    return;
  }

  await sp.ensureFolder(fullPath);
  folderExistsCache.add(fullPath);
}

/**
 * Delete a folder if it contains no files.
 */
async function deleteIfEmpty(
  sp: SharePointClient,
  folderPath: string
): Promise<void> {
  try {
    const children = await sp.listFiles(folderPath);
    const hasFiles = children.some((c) => c.file);
    if (!hasFiles) {
      await sp.delete(folderPath);
    }
  } catch {
    // Folder doesn't exist - nothing to clean up
  }
}

function isTransientUploadError(error: unknown): boolean {
  const errString = String(error);
  return TRANSIENT_ERRORS.some((marker) => errString.includes(marker));
}

async function uploadAssetBatch(
  sp: SharePointClient,
  subfolderPath: string,
  assets: Asset[],
  project: EstimateProject,
  errors: string[],
  isVariant: boolean,
  variantSuffix: string | null,
  chunkSize: number
): Promise<number> {
  const chunks: Asset[][] = [];
  for (let i = 0; i < assets.length; i += chunkSize) {
    chunks.push(assets.slice(i, i + chunkSize));
  }

  let uploaded = 0;
  for (const chunk of chunks) {
    const outcomes = await Promise.allSettled(
      chunk.map((asset) => {
        const fileName = resolveAssetFileNameForVariant(
          asset,
          isVariant,
          variantSuffix
        );
        return uploadAssetWithRetry(sp, subfolderPath, asset, fileName);
      })
    );

    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        uploaded += 1;
      } else {
        errors.push(
          `${project.projectName}/${pathLastSegment(subfolderPath)}: ${serializeError(
            outcome.reason
          )}`
        );
      }
    }
  }

  return uploaded;
}

function resolveAssetFileNameForVariant(
  asset: Asset,
  isVariant: boolean,
  variantSuffix: string | null
): string {
  const baseName = asset.name;
  if (!(isVariant && variantSuffix)) {
    return baseName;
  }

  const lastDot = baseName.lastIndexOf(".");
  if (lastDot > 0) {
    return `${baseName.slice(0, lastDot)}-${variantSuffix}${baseName.slice(lastDot)}`;
  }

  return `${baseName}-${variantSuffix}`;
}

async function uploadAssetWithRetry(
  sp: SharePointClient,
  folderPath: string,
  asset: Asset,
  fileName: string
): Promise<void> {
  const content = await downloadAsset(asset);

  try {
    await sp.upload(folderPath, fileName, content);
  } catch (error) {
    if (!isTransientUploadError(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await sp.upload(folderPath, fileName, content);
  }
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    const first = error.message || error.name;
    if (error.stack) {
      const stackLine = error.stack.split("\n")[1]?.trim();
      if (stackLine && !first.includes(stackLine)) {
        return `${first} (${stackLine})`;
      }
    }
    return first || "Unknown Error";
  }

  return String(error) || "Unknown error (empty)";
}

function pathLastSegment(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}

/**
 * Create the full folder hierarchy: Status/Letter/Account/Project.
 */
export async function ensureProjectHierarchy(
  sp: SharePointClient,
  project: EstimateProject
): Promise<void> {
  const statusPath = `${CUSTOMER_PROJECTS_PATH}/${project.statusFolder}`;
  const letterPath = `${statusPath}/${project.letterFolder}`;
  const letterAccountPath = `${letterPath}/${project.accountName}`;

  await ensureFolderCached(sp, CUSTOMER_PROJECTS_PATH, project.statusFolder);
  await ensureFolderCached(sp, statusPath, project.letterFolder);
  await ensureFolderCached(sp, letterPath, project.accountName);
  await ensureFolderCached(sp, letterAccountPath, project.projectName);
}

/**
 * Upload files from Monday to SharePoint for a project.
 * Returns number of files uploaded.
 */
export async function uploadFilesForProject(
  sp: SharePointClient,
  project: EstimateProject,
  errors: string[]
): Promise<number> {
  const allAssets = await fetchAllColumnAssets(project.mondayId);
  let uploaded = 0;

  const columnResults = await Promise.all(
    FILE_COLUMNS.map(async ({ column, subfolder }) => {
      const subfolderPath = `${project.folderPath}/${subfolder}`;
      const assets = allAssets.get(column.id) ?? [];

      if (assets.length === 0) {
        await deleteIfEmpty(sp, subfolderPath).catch(() => undefined);
        return 0;
      }

      await ensureFolderCached(sp, project.folderPath, subfolder);
      return uploadAssetBatch(
        sp,
        subfolderPath,
        assets,
        project,
        errors,
        project.isVariant,
        project.variantSuffix,
        FILE_UPLOAD_CONCURRENCY
      );
    })
  );

  for (const count of columnResults) {
    uploaded += count;
  }

  return uploaded;
}

/**
 * Move a project folder between status folders.
 */
export async function moveProjectFolder(
  sp: SharePointClient,
  project: EstimateProject
): Promise<void> {
  const oldPath = `${CUSTOMER_PROJECTS_PATH}/${project.oldStatusFolder}/${project.letterFolder}/${project.accountName}/${project.projectName}`;
  const newStatusPath = `${CUSTOMER_PROJECTS_PATH}/${project.statusFolder}`;
  const newLetterPath = `${newStatusPath}/${project.letterFolder}`;

  await ensureFolderCached(sp, CUSTOMER_PROJECTS_PATH, project.statusFolder);
  await ensureFolderCached(sp, newStatusPath, project.letterFolder);
  await ensureFolderCached(sp, newLetterPath, project.accountName);
  await sp.moveItem(oldPath, `${newLetterPath}/${project.accountName}`);
}

/**
 * Write SharePoint URL back to Monday item.
 */
export async function writeBackUrl(
  sp: SharePointClient,
  project: EstimateProject
): Promise<void> {
  const item = await sp.getItemByPath(project.folderPath);

  await updateItem({
    boardId: BOARD_IDS.ESTIMATING,
    columnValues: {
      [ESTIMATING_COLUMNS.SHAREPOINT_URL.id]: {
        url: item.webUrl,
        text: project.projectName,
      },
    },
    itemId: project.mondayId,
  });
}
