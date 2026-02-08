/**
 * Sync Monday.com estimates to SharePoint folder structure
 *
 * Downloads files from Monday file columns (Estimates, Plans, Contracts, NOI)
 * and uploads them to SharePoint under:
 *   Customer Projects/{Status}/{Letter}/{Account}/{Project Name}/{Subfolder}/
 *
 * Only creates folders when there are actual files to put in them.
 * Writes back the SharePoint URL to Monday after syncing.
 *
 * Usage:
 *   bun apps/cli-tools/monday-cli/bin/sync-estimates.ts [options]
 *
 * Options:
 *   --limit=<n>        Max items to sync (default: all)
 *   --dry-run          Preview actions without creating/uploading
 */

import {
  CUSTOMER_PROJECTS_PATH,
  CUSTOMER_PROJECTS_PATH_REGEX,
  extractUrl,
  getLetterFolder,
  getStatusFolder,
  parseStatusFromUrl,
  parseVariantPrefix,
  sanitizeName,
  VARIANT_FOLDER_REGEX,
} from "@lib/sharepoint/paths";
import { getItemsRich, type MondayColumnValue } from "@monday/client";
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
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types";
import { SharePointClient } from "@sharepoint/client";

// ============================================
// Mapping
// ============================================

function mapEstimate(
  item: {
    id: string;
    name: string;
    columns: Record<string, string | null>;
    columnValues: MondayColumnValue[];
  },
  accountName: string | undefined
): EstimateProject {
  const bidStatus = item.columns[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null;
  const {
    isVariant,
    baseName,
    suffix: variantSuffix,
  } = parseVariantPrefix(item.name);

  if (!accountName) {
    return {
      mondayId: item.id,
      itemName: item.name,
      accountName: "Unknown",
      projectName: sanitizeName(item.name),
      statusFolder: getStatusFolder(bidStatus),
      letterFolder: "_Numeric",
      folderPath: "",
      existingUrl: null,
      action: "skip",
      isVariant,
      variantSuffix,
    };
  }

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
    const decodedUrl = decodeURIComponent(existingUrl);
    const expectedAccountPath = `/${sanitizedAccountName}/`;
    const urlMatchesAccount = decodedUrl.includes(expectedAccountPath);

    const urlHasVariantFolder =
      isVariant && VARIANT_FOLDER_REGEX.test(decodedUrl);
    if (urlHasVariantFolder) {
      action = "create";
      const pathMatch = decodedUrl.match(CUSTOMER_PROJECTS_PATH_REGEX);
      if (pathMatch) {
        oldVariantFolderPath = `Customer Projects/${pathMatch[1]}`;
      }
    } else if (urlMatchesAccount) {
      const parsedStatus = parseStatusFromUrl(existingUrl);
      if (parsedStatus && parsedStatus !== statusFolder) {
        action = "move";
        oldStatusFolder = parsedStatus;
      } else if (parsedStatus && parsedStatus === statusFolder) {
        action = "skip";
      }
    } else {
      action = "create";
    }
  }

  return {
    mondayId: item.id,
    itemName: item.name,
    accountName: sanitizedAccountName,
    projectName,
    statusFolder,
    letterFolder,
    folderPath,
    existingUrl,
    action,
    oldStatusFolder,
    isVariant,
    variantSuffix,
    oldVariantFolderPath,
  };
}

// ============================================
// Sync Logic
// ============================================

function tallyAction(
  result: SyncResult,
  action: "create" | "move" | "skip"
): void {
  if (action === "create") {
    result.created++;
  } else if (action === "move") {
    result.moved++;
  } else {
    result.skipped++;
  }
}

async function processCreate(
  sp: SharePointClient,
  project: EstimateProject,
  result: SyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  try {
    await ensureProjectHierarchy(sp, project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to create folder "${project.folderPath}": ${msg}`);
  }
  const uploaded = await uploadFilesForProject(sp, project, result.errors);
  result.filesUploaded += uploaded;
  try {
    await writeBackUrl(sp, project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to write URL for "${project.projectName}": ${msg}`);
  }

  if (project.oldVariantFolderPath) {
    try {
      await sp.delete(project.oldVariantFolderPath);
    } catch {
      // Ignore deletion errors - folder might not exist
    }
  }

  return { status: "created", files: uploaded };
}

async function processMove(
  sp: SharePointClient,
  project: EstimateProject,
  result: SyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  try {
    await moveProjectFolder(sp, project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("could not be found") || msg.includes("does not exist")) {
      return processCreate(sp, project, result);
    }
    throw new Error(
      `Failed to move folder for "${project.projectName}": ${msg}`
    );
  }
  const uploaded = await uploadFilesForProject(sp, project, result.errors);
  result.filesUploaded += uploaded;
  await writeBackUrl(sp, project);
  return { status: "moved", files: uploaded };
}

const DEFAULT_CONCURRENCY = 15;

function processOneProject(
  sp: SharePointClient,
  project: EstimateProject,
  result: SyncResult
): Promise<{ status: SyncProgress["status"]; files: number }> {
  if (project.action === "move") {
    return processMove(sp, project, result);
  }
  if (project.action === "skip") {
    return Promise.resolve({ status: "skipped" as const, files: 0 });
  }
  return processCreate(sp, project, result);
}

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
    moved: 0,
    skipped: 0,
    filesUploaded: 0,
    errors: [],
  };

  clearFolderCache();

  onProgress?.({ phase: "fetching" });
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

  onProgress?.({ phase: "fetching", current: 0, total: items.length });
  const accountNames = await resolveAccountNames(items);

  const projects = items.map((item) =>
    mapEstimate(item, accountNames.get(item.id))
  );
  const total = projects.length;
  let completed = 0;
  onProgress?.({ phase: "syncing", current: 0, total });

  if (dryRun) {
    for (const project of projects) {
      tallyAction(result, project.action);
      completed++;
      onProgress?.({
        phase: "syncing",
        current: completed,
        total,
        itemName: project.projectName,
        action: `[DRY-RUN] ${project.action}: ${project.folderPath}`,
      });
    }
    onProgress?.({ phase: "complete", current: total, total });
    return result;
  }

  for (let i = 0; i < projects.length; i += concurrency) {
    const batch = projects.slice(i, i + concurrency);
    const promises = batch.map(async (project) => {
      try {
        const outcome = await processOneProject(sp, project, result);
        tallyAction(result, project.action);
        completed++;
        onProgress?.({
          phase: "syncing",
          current: completed,
          total,
          itemName: project.projectName,
          status: outcome.status,
          filesUploaded: outcome.files,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`${project.projectName}: ${errMsg}`);
        completed++;
        onProgress?.({
          phase: "syncing",
          current: completed,
          total,
          itemName: project.projectName,
          status: "error",
          errorMessage: errMsg,
        });
      }
    });
    await Promise.all(promises);
  }

  onProgress?.({ phase: "complete", current: total, total });
  return result;
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);

  let limit: number | undefined;
  const limitEqArg = args.find((a) => a.startsWith("--limit="));
  if (limitEqArg) {
    limit = Number.parseInt(limitEqArg.split("=")[1] ?? "0", 10);
  } else {
    const limitIdx = args.indexOf("--limit");
    if (limitIdx !== -1 && args[limitIdx + 1]) {
      limit = Number.parseInt(args[limitIdx + 1], 10);
    }
  }

  let concurrency: number | undefined;
  const concurrencyEqArg = args.find((a) => a.startsWith("--concurrency="));
  if (concurrencyEqArg) {
    concurrency = Number.parseInt(concurrencyEqArg.split("=")[1] ?? "10", 10);
  } else {
    const concurrencyIdx = args.indexOf("--concurrency");
    if (concurrencyIdx !== -1 && args[concurrencyIdx + 1]) {
      concurrency = Number.parseInt(args[concurrencyIdx + 1], 10);
    }
  }

  const dryRun = args.includes("--dry-run");

  const azureTenantId = process.env.AZURE_TENANT_ID;
  const azureClientId = process.env.AZURE_CLIENT_ID;
  const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(azureTenantId && azureClientId && azureClientSecret)) {
    console.error(
      "Missing required AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET env vars"
    );
    process.exit(1);
  }

  const sp = new SharePointClient({
    azureTenantId,
    azureClientId,
    azureClientSecret,
  });

  console.log("=".repeat(50));
  console.log("MONDAY > SHAREPOINT FOLDER SYNC");
  console.log("=".repeat(50));
  console.log(`Limit: ${limit ?? "all"}`);
  console.log(`Concurrency: ${concurrency ?? DEFAULT_CONCURRENCY}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`${"=".repeat(50)}\n`);

  const STATUS_ICONS: Record<string, string> = {
    created: "\u2713",
    moved: "\u2192",
    skipped: "\u2013",
    error: "\u2717",
  };

  function logSyncingProgress(p: SyncProgress): void {
    if (p.current === 0) {
      console.log(`Found ${p.total} estimates\n`);
      if (dryRun) {
        console.log("DRY RUN \u2014 no folders will be created or moved\n");
      }
    }
    if (p.itemName) {
      const icon = p.status ? (STATUS_ICONS[p.status] ?? "?") : "?";
      const label = (p.status ?? "unknown").padEnd(7);
      const name = p.itemName.slice(0, 45).padEnd(45);
      const files =
        p.filesUploaded !== undefined ? `  [${p.filesUploaded} files]` : "";
      const extra = p.action ? `  ${p.action}` : "";
      console.log(
        `[${p.current}/${p.total}] ${icon} ${label} ${name}${files}${extra}`
      );
      if (p.status === "error" && p.errorMessage) {
        console.log(`    ERROR: ${p.errorMessage}`);
      }
    }
  }

  syncEstimateFolders(sp, {
    limit,
    concurrency,
    dryRun,
    onProgress: (p) => {
      if (p.phase === "fetching") {
        console.log("Fetching items from Monday.com...");
      } else if (p.phase === "syncing" && p.current !== undefined) {
        logSyncingProgress(p);
      }
    },
  })
    .then((r) => {
      console.log(`\n${"=".repeat(50)}`);
      console.log("SYNC COMPLETE");
      console.log("=".repeat(50));
      console.log(`Created: ${r.created}`);
      console.log(`Moved:   ${r.moved}`);
      console.log(`Skipped: ${r.skipped}`);
      console.log(`Files:   ${r.filesUploaded}`);

      if (r.errors.length > 0) {
        console.log(`\nErrors (${r.errors.length}):`);
        for (const err of r.errors.slice(0, 10)) {
          console.log(`  - ${err}`);
        }
        if (r.errors.length > 10) {
          console.log(`  ... and ${r.errors.length - 10} more`);
        }
      }
    })
    .catch((error) => {
      console.error("Sync failed:", error);
      process.exit(1);
    });
}
