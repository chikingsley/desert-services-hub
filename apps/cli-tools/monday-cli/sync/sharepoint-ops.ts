/**
 * SharePoint folder operations for estimate sync.
 *
 * Handles folder creation, file uploads, folder moves, and URL writeback.
 */
import { updateItem } from "@monday/client";
import { CUSTOMER_PROJECTS_PATH, FILE_COLUMNS } from "@monday/sync/helpers";
import { downloadAsset, fetchAllColumnAssets } from "@monday/sync/monday-fetch";
import type { Asset, EstimateProject } from "@monday/sync/types";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types";
import type { SharePointClient } from "@sharepoint/client";

// Cache for folders we've already ensured exist (persists across projects in a sync run)
const folderExistsCache = new Set<string>();

const FILE_UPLOAD_CONCURRENCY = 5;

/**
 * Clear the folder existence cache (call at start of each sync run).
 */
export function clearFolderCache(): void {
  folderExistsCache.clear();
}

/**
 * Ensure a folder exists, with caching to avoid redundant API calls.
 */
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

  await sp.ensureFolder(parentPath, folderName);
  folderExistsCache.add(fullPath);
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

  const columnResults = await Promise.all(
    FILE_COLUMNS.map(async ({ column, subfolder }) => {
      const subfolderPath = `${project.folderPath}/${subfolder}`;
      const assets = allAssets.get(column.id) ?? [];

      if (assets.length === 0) {
        deleteIfEmpty(sp, subfolderPath).catch(() => {
          // Fire and forget - ignore cleanup errors
        });
        return 0;
      }

      await ensureFolderCached(sp, project.folderPath, subfolder);

      let uploaded = 0;
      const chunks: Asset[][] = [];
      for (let i = 0; i < assets.length; i += FILE_UPLOAD_CONCURRENCY) {
        chunks.push(assets.slice(i, i + FILE_UPLOAD_CONCURRENCY));
      }

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (asset) => {
            const content = await downloadAsset(asset);
            let fileName = asset.name;
            if (project.isVariant && project.variantSuffix) {
              const lastDot = fileName.lastIndexOf(".");
              if (lastDot > 0) {
                fileName = `${fileName.slice(0, lastDot)}-${project.variantSuffix}${fileName.slice(lastDot)}`;
              } else {
                fileName = `${fileName}-${project.variantSuffix}`;
              }
            }
            try {
              await sp.upload(subfolderPath, fileName, content);
            } catch (firstError) {
              const errStr = String(firstError);
              const isTransient =
                errStr.includes("eTag") ||
                errStr.includes("changed since") ||
                errStr.includes("412") ||
                errStr.includes("503");
              if (isTransient) {
                await new Promise((r) => setTimeout(r, 1000));
                await sp.upload(subfolderPath, fileName, content);
              } else {
                throw firstError;
              }
            }
            return 1;
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            uploaded += result.value;
          } else {
            let msg: string;
            if (result.reason instanceof Error) {
              msg =
                result.reason.message || result.reason.name || "Unknown Error";
              if (result.reason.stack) {
                const stackLine = result.reason.stack.split("\n")[1]?.trim();
                if (stackLine && !msg.includes(stackLine)) {
                  msg += ` (${stackLine})`;
                }
              }
            } else {
              msg = String(result.reason) || "Unknown error (empty)";
            }
            errors.push(`${project.projectName}/${subfolder}: ${msg}`);
          }
        }
      }

      return uploaded;
    })
  );

  return columnResults.reduce((sum, count) => sum + count, 0);
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
    itemId: project.mondayId,
    columnValues: {
      [ESTIMATING_COLUMNS.SHAREPOINT_URL.id]: {
        url: item.webUrl,
        text: project.projectName,
      },
    },
  });
}
