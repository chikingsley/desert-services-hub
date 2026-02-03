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
 *   bun sync-estimates.ts [options]
 *
 * Options:
 *   --limit=<n>        Max items to sync (default: all)
 *   --dry-run          Preview actions without creating/uploading
 */
import { SharePointClient } from "../client";
import {
  getItemNames,
  getItemsRich,
  query,
  updateItem,
  type MondayColumnValue,
} from "@services/monday/client";
import {
  BOARD_IDS,
  CONTACTS_COLUMNS,
  ESTIMATING_COLUMNS,
} from "@services/monday/types";

// ============================================
// Constants
// ============================================

const CUSTOMER_PROJECTS_PATH = "Customer Projects";

// Groups to skip (templates, placeholders, etc.)
const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];

const FILE_COLUMNS = [
  { column: ESTIMATING_COLUMNS.ESTIMATE, subfolder: "Estimates" },
  { column: ESTIMATING_COLUMNS.PLANS, subfolder: "Plans" },
  { column: ESTIMATING_COLUMNS.CONTRACTS, subfolder: "Contracts" },
  { column: ESTIMATING_COLUMNS.NOI, subfolder: "NOI" },
] as const;

const STATUS_MAP: Record<string, string> = {
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

const DEFAULT_STATUS = "Submitted";

const VALID_STATUSES = new Set(["Submitted", "Active", "Lost", "Finished"]);

const ILLEGAL_CHARS_REGEX = /["*:<>?/\\|#%~{}]/g;
const URL_REGEX = /https?:\/\/\S+/;

// ============================================
// Types
// ============================================

interface Asset {
  id: string;
  name: string;
  public_url: string;
}

interface EstimateProject {
  mondayId: string;
  itemName: string;
  accountName: string;
  projectName: string;
  statusFolder: string;
  letterFolder: string;
  folderPath: string;
  existingUrl: string | null;
  action: "create" | "move" | "skip";
  oldStatusFolder?: string;
  isVariant: boolean; // True if this is a variant (TF=Temp Fence, PJ=Porta John)
  variantSuffix: string | null; // "TF", "PJ", or null
  oldVariantFolderPath?: string; // Path to old variant folder that needs deletion after consolidation
}

interface SyncOptions {
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}

interface SyncProgress {
  phase: "fetching" | "syncing" | "complete";
  current?: number;
  total?: number;
  itemName?: string;
  status?: "created" | "moved" | "skipped" | "error";
  action?: string;
  filesUploaded?: number;
  errorMessage?: string;
}

interface SyncResult {
  created: number;
  moved: number;
  skipped: number;
  filesUploaded: number;
  errors: string[];
}

// ============================================
// Helpers
// ============================================

function extractUrl(raw: string): string | null {
  const match = raw.match(URL_REGEX);
  return match ? match[0].trim() : null;
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\r\n]+/g, " ") // Replace newlines with spaces
    .replace(ILLEGAL_CHARS_REGEX, "")
    .trim()
    .replace(/\.+$/, ""); // Remove trailing periods (SharePoint doesn't allow them)
}

/**
 * Check if a project name is a "TF" (Task Force) variant and extract the base name.
 * TF items should be consolidated into the same folder as the main project.
/**
 * Check if a project name has a variant prefix and extract the base name.
 * Variant items should be consolidated into the same folder as the main project.
 * 
 * Supported prefixes:
 *   - TF = Temp Fence
 *   - PJ = Porta John (portable toilets)
 *   - RO = Rough Grade Only
 *   - REBID = Re-bid of an existing project
 * 
 * Examples:
 *   "TF: ECHO CANYON" -> { isVariant: true, baseName: "ECHO CANYON", suffix: "TF" }
 *   "PJ: SIGNATURE" -> { isVariant: true, baseName: "SIGNATURE", suffix: "PJ" }
 *   "RO: PROJECT" -> { isVariant: true, baseName: "PROJECT", suffix: "RO" }
 *   "REBID: QTS PHX3" -> { isVariant: true, baseName: "QTS PHX3", suffix: "REBID" }
 *   "ECHO CANYON" -> { isVariant: false, baseName: "ECHO CANYON", suffix: null }
 */
function parseVariantPrefix(name: string): {
  isVariant: boolean;
  baseName: string;
  suffix: string | null;
} {
  const trimmed = name.trim();
  // Match TF (Temp Fence), PJ (Porta John), RO (Rough Grade Only), or REBID prefix
  const variantMatch = trimmed.match(/^(TF|PJ|RO|REBID)[\s\-_:]+(.+)$/i);
  if (variantMatch) {
    return {
      isVariant: true,
      baseName: variantMatch[2].trim(),
      suffix: variantMatch[1].toUpperCase(),
    };
  }
  return { isVariant: false, baseName: trimmed, suffix: null };
}

function getStatusFolder(bidStatus: string | null): string {
  if (!bidStatus) {
    return DEFAULT_STATUS;
  }
  return STATUS_MAP[bidStatus] ?? DEFAULT_STATUS;
}

function getLetterFolder(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  if (first >= "A" && first <= "Z") {
    return first;
  }
  return "_Numeric"; // Use underscore prefix instead of # to avoid SharePoint path issues
}

function parseStatusFromUrl(url: string): string | null {
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

// ============================================
// Monday file fetching
// ============================================

async function fetchItemAssets(
  itemId: string,
  columnId: string
): Promise<Asset[]> {
  const result = await query<{
    items: Array<{ assets: Asset[] }>;
  }>(`
    query {
      items(ids: [${itemId}]) {
        assets(column_ids: ["${columnId}"]) {
          id
          name
          public_url
        }
      }
    }
  `);
  return result.items[0]?.assets ?? [];
}

/**
 * Fetch assets for all file columns in parallel (instead of sequentially)
 */
async function fetchAllColumnAssets(
  itemId: string
): Promise<Map<string, Asset[]>> {
  const columnIds = FILE_COLUMNS.map((c) => c.column.id);
  const results = await Promise.all(
    columnIds.map((columnId) => fetchItemAssets(itemId, columnId))
  );

  const assetMap = new Map<string, Asset[]>();
  columnIds.forEach((columnId, index) => {
    assetMap.set(columnId, results[index] ?? []);
  });
  return assetMap;
}

async function downloadAsset(asset: Asset): Promise<Buffer> {
  const response = await fetch(asset.public_url);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================
// Account Resolution
// ============================================

/**
 * Get linked item IDs from a column value
 */
function getLinkedIds(
  columnValues: MondayColumnValue[],
  columnId: string
): string[] {
  const col = columnValues.find((c) => c.id === columnId);
  return col?.linkedItemIds ?? [];
}

/**
 * Resolve account names for all items using board relations
 *
 * Strategy:
 * 1. Try ACCOUNTS board relation (direct link to account)
 * 2. Fall back to CONTACTS board relation -> then lookup contact's CONTRACTOR
 * 3. Fall back to CONTRACTOR mirror column (display_value)
 */
async function resolveAccountNames(
  items: Array<{
    id: string;
    columns: Record<string, string | null>;
    columnValues: MondayColumnValue[];
  }>
): Promise<Map<string, string>> {
  const accountNameMap = new Map<string, string>();

  // Collect all account IDs and contact IDs we need to look up
  const directAccountIds = new Set<string>();
  const contactIds = new Set<string>();
  const itemsNeedingContactLookup: string[] = [];

  for (const item of items) {
    // Try direct ACCOUNTS relation first
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );

    if (accountIds.length > 0) {
      // Has direct account link
      directAccountIds.add(accountIds[0]);
    } else {
      // Try CONTACTS relation as fallback
      const contactIdList = getLinkedIds(
        item.columnValues,
        ESTIMATING_COLUMNS.CONTACTS.id
      );
      if (contactIdList.length > 0) {
        contactIds.add(contactIdList[0]);
        itemsNeedingContactLookup.push(item.id);
      }
    }
  }

  // Batch lookup account names
  const accountNames = await getItemNames([...directAccountIds]);

  // Map items with direct account links
  for (const item of items) {
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );
    if (accountIds.length > 0 && accountNames.has(accountIds[0])) {
      accountNameMap.set(item.id, accountNames.get(accountIds[0])!);
    }
  }

  // For items with contacts, look up the contact's CONTRACTOR relation
  if (contactIds.size > 0) {
    // Get contact items to find their account links
    const contactIdsArray = [...contactIds];
    const contactAccountMap = await lookupContactAccounts(contactIdsArray);

    for (const item of items) {
      if (accountNameMap.has(item.id)) continue; // Already resolved

      const contactIdList = getLinkedIds(
        item.columnValues,
        ESTIMATING_COLUMNS.CONTACTS.id
      );
      if (contactIdList.length > 0) {
        const accountName = contactAccountMap.get(contactIdList[0]);
        if (accountName) {
          accountNameMap.set(item.id, accountName);
        }
      }
    }
  }

  // Fall back to CONTRACTOR mirror column for any remaining items
  for (const item of items) {
    if (accountNameMap.has(item.id)) continue;

    // Mirror columns have display_value, not text - check columnValues
    const mirrorCol = item.columnValues.find(
      (c) => c.id === ESTIMATING_COLUMNS.CONTRACTOR.id
    );
    const mirrorValue = mirrorCol?.displayValue;
    if (mirrorValue && mirrorValue !== "null") {
      accountNameMap.set(item.id, mirrorValue);
    }
  }

  return accountNameMap;
}

/**
 * Look up account names for contacts via their CONTRACTOR relation
 */
async function lookupContactAccounts(
  contactIds: string[]
): Promise<Map<string, string>> {
  if (contactIds.length === 0) return new Map();

  const contactAccountMap = new Map<string, string>();
  const accountIdsToLookup = new Set<string>();
  const contactToAccountId = new Map<string, string>();

  // Query contacts to get their CONTRACTOR (account) links
  const BATCH_SIZE = 50;
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const idsStr = batch.join(",");

    interface ContactQueryResult {
      items: Array<{
        id: string;
        column_values: Array<{
          id: string;
          linked_item_ids?: string[];
        }>;
      }>;
    }

    const result = await query<ContactQueryResult>(`
      query {
        items(ids: [${idsStr}]) {
          id
          column_values(ids: ["${CONTACTS_COLUMNS.CONTRACTOR.id}"]) {
            id
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    `);

    for (const contact of result.items) {
      const relCol = contact.column_values[0];
      const accountId = relCol?.linked_item_ids?.[0];
      if (accountId) {
        contactToAccountId.set(contact.id, accountId);
        accountIdsToLookup.add(accountId);
      }
    }
  }

  // Look up account names
  const accountNames = await getItemNames([...accountIdsToLookup]);

  // Map contact -> account name
  for (const [contactId, accountId] of contactToAccountId) {
    const name = accountNames.get(accountId);
    if (name) {
      contactAccountMap.set(contactId, name);
    }
  }

  return contactAccountMap;
}

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
      projectName: sanitizeFolderName(item.name),
      statusFolder: getStatusFolder(bidStatus),
      letterFolder: "_Numeric",
      folderPath: "",
      existingUrl: null,
      action: "skip",
      isVariant,
      variantSuffix,
    };
  }

  const sanitizedAccountName = sanitizeFolderName(accountName);
  // Use base name (without TF prefix) for folder path - TF items go in same folder as main project
  const projectName = sanitizeFolderName(baseName);
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

    // For variant items (TF, PJ, RO, REBID), if existing URL points to a variant-prefixed folder,
    // we need to recreate in the base folder (consolidation)
    const urlHasVariantFolder =
      isVariant && /\/(TF|PJ|RO|REBID)[\s\-_:]/i.test(decodedUrl);
    if (urlHasVariantFolder) {
      // Variant item currently in separate folder - need to recreate in base folder
      action = "create";
      // Extract old variant folder path from URL for deletion after consolidation
      const pathMatch = decodedUrl.match(/Customer Projects\/(.+)$/);
      if (pathMatch) {
        oldVariantFolderPath = `Customer Projects/${pathMatch[1]}`;
      }
    } else if (urlMatchesAccount) {
      // URL has correct account, check if status folder needs updating
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
// SharePoint operations
// ============================================

// Cache for folders we've already ensured exist (persists across projects in a sync run)
const folderExistsCache = new Set<string>();

/**
 * Ensure a folder exists, with caching to avoid redundant API calls
 * Many projects share the same Status/Letter/Account folders
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
    return; // Already exists, skip API call
  }

  await sp.ensureFolder(parentPath, folderName);
  folderExistsCache.add(fullPath);
}

async function ensureProjectHierarchy(
  sp: SharePointClient,
  project: EstimateProject
): Promise<void> {
  const statusPath = `${CUSTOMER_PROJECTS_PATH}/${project.statusFolder}`;
  const letterPath = `${statusPath}/${project.letterFolder}`;
  const letterAccountPath = `${letterPath}/${project.accountName}`;

  // Use cached folder creation for shared parent folders
  await ensureFolderCached(sp, CUSTOMER_PROJECTS_PATH, project.statusFolder);
  await ensureFolderCached(sp, statusPath, project.letterFolder);
  await ensureFolderCached(sp, letterPath, project.accountName);
  // Project folder is unique, but still cache it
  await ensureFolderCached(sp, letterAccountPath, project.projectName);
}

// Max concurrent file uploads per project to avoid overwhelming APIs
const FILE_UPLOAD_CONCURRENCY = 5;

async function uploadFilesForProject(
  sp: SharePointClient,
  project: EstimateProject,
  errors: string[]
): Promise<number> {
  // Step 1: Fetch all column assets in PARALLEL (instead of sequential)
  const allAssets = await fetchAllColumnAssets(project.mondayId);

  // Step 2: Process all columns in PARALLEL
  const columnResults = await Promise.all(
    FILE_COLUMNS.map(async ({ column, subfolder }) => {
      const subfolderPath = `${project.folderPath}/${subfolder}`;
      const assets = allAssets.get(column.id) ?? [];

      if (assets.length === 0) {
        // Fire and forget - don't wait for empty folder cleanup
        deleteIfEmpty(sp, subfolderPath).catch(() => {
          // Ignore errors - fire and forget cleanup
        });
        return 0;
      }

      // Ensure subfolder exists (cached)
      await ensureFolderCached(sp, project.folderPath, subfolder);

      // Step 3: Upload files in PARALLEL with concurrency limit
      let uploaded = 0;
      const chunks: Asset[][] = [];
      for (let i = 0; i < assets.length; i += FILE_UPLOAD_CONCURRENCY) {
        chunks.push(assets.slice(i, i + FILE_UPLOAD_CONCURRENCY));
      }

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (asset) => {
            const content = await downloadAsset(asset);
            // For variant items, add suffix to filename (before extension)
            // e.g., "estimate.pdf" -> "estimate-TF.pdf" or "estimate-PJ.pdf"
            let fileName = asset.name;
            if (project.isVariant && project.variantSuffix) {
              const lastDot = fileName.lastIndexOf(".");
              if (lastDot > 0) {
                fileName = `${fileName.slice(0, lastDot)}-${project.variantSuffix}${fileName.slice(lastDot)}`;
              } else {
                fileName = `${fileName}-${project.variantSuffix}`;
              }
            }
            // Retry once on transient errors (eTag mismatch, etc.)
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
                // Wait a moment and retry
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
            // Capture full error details - don't allow empty messages
            let msg: string;
            if (result.reason instanceof Error) {
              msg =
                result.reason.message || result.reason.name || "Unknown Error";
              if (result.reason.stack) {
                // Include first line of stack for debugging
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
    // Folder doesn't exist — nothing to clean up
  }
}

async function moveProjectFolder(
  sp: SharePointClient,
  project: EstimateProject
): Promise<void> {
  const oldPath = `${CUSTOMER_PROJECTS_PATH}/${project.oldStatusFolder}/${project.letterFolder}/${project.accountName}/${project.projectName}`;
  const newStatusPath = `${CUSTOMER_PROJECTS_PATH}/${project.statusFolder}`;
  const newLetterPath = `${newStatusPath}/${project.letterFolder}`;
  const newAccountPath = `${newLetterPath}/${project.accountName}`;

  // Use cached folder creation for destination hierarchy
  await ensureFolderCached(sp, CUSTOMER_PROJECTS_PATH, project.statusFolder);
  await ensureFolderCached(sp, newStatusPath, project.letterFolder);
  await ensureFolderCached(sp, newLetterPath, project.accountName);
  await sp.moveItem(oldPath, newAccountPath);
}

async function writeBackUrl(
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

  // If this was a variant consolidation, delete the old variant folder
  if (project.oldVariantFolderPath) {
    try {
      await sp.delete(project.oldVariantFolderPath);
    } catch {
      // Ignore deletion errors - folder might not exist or have been already deleted
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
    // If source folder doesn't exist, fall back to create
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

const DEFAULT_CONCURRENCY = 15; // Increased from 10 since per-project operations are now more efficient

/**
 * Clear the folder existence cache (call at start of each sync run)
 */
function clearFolderCache(): void {
  folderExistsCache.clear();
}

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

  // Clear folder cache at start of each sync run
  clearFolderCache();

  onProgress?.({ phase: "fetching" });
  const fetchOptions = limit && limit > 0 ? { maxItems: limit } : {};
  let items = await getItemsRich(BOARD_IDS.ESTIMATING, fetchOptions);

  if (limit && limit > 0 && items.length > limit) {
    items = items.slice(0, limit);
  }

  // Filter out template/placeholder groups
  const originalCount = items.length;
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
  if (items.length < originalCount) {
    console.log(
      `Filtered out ${originalCount - items.length} items from skipped groups`
    );
  }

  // Resolve account names using board relations (ACCOUNTS, then CONTACTS fallback)
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

  // Process in parallel batches
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

  // Parse --limit (supports both --limit=10 and --limit 10)
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

  // Parse --concurrency (supports both --concurrency=10 and --concurrency 10)
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
        console.log("DRY RUN — no folders will be created or moved\n");
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
      // Print error immediately if there is one
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
