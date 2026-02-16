/**
 * SharePoint Folder Sync — Library Module
 *
 * Extracted from the Cloudflare Worker (src/index.ts) for use inside the
 * web container's background job worker. Creates/moves SharePoint folders
 * and uploads Monday file column assets.
 *
 * Used by: apps/web/worker.ts (sync_full job)
 */

import { SKIP_GROUPS } from "@background-jobs/jobs/config";
import { getGraphTokenCached } from "@lib/graph/token";
import {
  buildCustomerProjectsPath,
  buildSharePointUrl,
  DEFAULT_STATUS,
  extractUrl,
  parseStatusFromUrl,
  parseVariantPrefix,
  STATUS_MAP,
} from "@sharepoint/paths";
import type { MondayItem } from "./sharepoint-file-ops";
import {
  ensureFolderExists,
  getDriveId,
  moveProjectFolder,
  uploadItemFiles,
} from "./sharepoint-file-ops";

// =============================================================================
// Types
// =============================================================================

export interface SharePointSyncResult {
  processed: number;
  moved: number;
  created: number;
  filesUploaded: number;
  skipped: number;
  errors: string[];
}

// =============================================================================
// Constants
// =============================================================================

const BOARD_ID = "7943937851";

// Column IDs
const ACCOUNTS_COLUMN = "mirror_mkqz3ngj";
const BID_STATUS_COLUMN = "deal_stage";
const SHAREPOINT_URL_COLUMN = "link_mky1n6pa";

// File columns with their SharePoint subfolder names
const FILE_COLUMN_MAP: Record<string, string> = {
  files__1: "Estimates",
  files_mkq02x34: "Plans",
  files_mkq0zbcq: "Contracts",
  file_mkq08m8m: "NOI",
};

const FILE_COLUMNS = Object.keys(FILE_COLUMN_MAP);

// =============================================================================
// Main Sync
// =============================================================================

async function syncOneItem(
  item: MondayItem,
  token: string,
  driveId: string,
  result: SharePointSyncResult
): Promise<void> {
  const targetFolder = STATUS_MAP[item.bidStatus] ?? DEFAULT_STATUS;
  const currentFolder = parseStatusFromUrl(item.sharepointUrl);

  const folderPath = buildCustomerProjectsPath({
    accountName: item.accountName,
    projectName: item.baseName,
    statusFolder: targetFolder,
  });

  if (!item.sharepointUrl && item.files.length > 0) {
    const created = await ensureFolderExists(token, driveId, folderPath);
    if (!created) {
      return;
    }

    const uploaded = await uploadItemFiles(
      token,
      driveId,
      folderPath,
      item,
      getAssetUrl
    );
    result.filesUploaded += uploaded;

    const url = buildSharePointUrl(folderPath);
    await updateMondayUrl(item.id, url, item.name);
    result.created++;
    console.log(
      `[SharePoint] Created: ${item.name} → ${item.baseName}/ (${uploaded} files)`
    );
    return;
  }

  if (item.sharepointUrl && currentFolder && currentFolder !== targetFolder) {
    const moved = await moveProjectFolder(
      token,
      driveId,
      item.sharepointUrl,
      currentFolder,
      targetFolder
    );
    if (!moved) {
      result.skipped++;
      return;
    }

    const newUrl = item.sharepointUrl.replace(currentFolder, targetFolder);
    await updateMondayUrl(item.id, newUrl, item.name);

    const uploaded = await uploadItemFiles(
      token,
      driveId,
      folderPath,
      item,
      getAssetUrl
    );
    result.filesUploaded += uploaded;
    result.moved++;
    console.log(
      `[SharePoint] Moved: ${item.name} (${currentFolder} → ${targetFolder})`
    );
    return;
  }

  if (item.sharepointUrl && item.files.length > 0) {
    const uploaded = await uploadItemFiles(
      token,
      driveId,
      folderPath,
      item,
      getAssetUrl
    );
    if (uploaded > 0) {
      result.filesUploaded += uploaded;
      console.log(`[SharePoint] Uploaded ${uploaded} new files: ${item.name}`);
    }
  }

  result.skipped++;
}

export async function syncSharePointFolders(): Promise<SharePointSyncResult> {
  const result: SharePointSyncResult = {
    processed: 0,
    moved: 0,
    created: 0,
    filesUploaded: 0,
    skipped: 0,
    errors: [],
  };

  try {
    console.log("[SharePoint] Fetching items from Monday...");
    const items = await getEstimateItems();
    console.log(`[SharePoint] Found ${items.length} items`);

    const token = await getGraphTokenCached();
    const driveId = await getDriveId(token);

    for (const item of items) {
      result.processed++;
      try {
        await syncOneItem(item, token, driveId, result);
      } catch (error) {
        const msg = `${item.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[SharePoint] Error: ${msg}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Sync failed: ${error}`);
    console.error(`[SharePoint] ${error}`);
    return result;
  }
}

// =============================================================================
// Monday API
// =============================================================================

function getMondayApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) {
    throw new Error("Missing MONDAY_API_KEY");
  }
  return key;
}

async function mondayQuery(query: string): Promise<unknown> {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getMondayApiKey(),
      "API-Version": "2026-01",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Monday API error: ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: unknown;
    errors?: unknown[];
  };
  if (json.errors) {
    throw new Error(`Monday errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

interface RawColumnValue {
  id: string;
  text?: string;
  value?: string;
  display_value?: string;
}

function extractFileAssets(
  columnValues: RawColumnValue[]
): MondayItem["files"] {
  const files: MondayItem["files"] = [];
  for (const colId of FILE_COLUMNS) {
    const col = columnValues.find((c) => c.id === colId);
    if (!col?.value) {
      continue;
    }
    try {
      const parsed = JSON.parse(col.value);
      if (!parsed?.files?.length) {
        continue;
      }
      for (const file of parsed.files) {
        if (file.assetId && file.name) {
          files.push({
            id: file.assetId.toString(),
            name: file.name,
            url: "",
            columnId: colId,
            subfolder: FILE_COLUMN_MAP[colId],
          });
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  return files;
}

function transformRawItem(rawItem: {
  id: string;
  name: string;
  column_values: RawColumnValue[];
}): MondayItem {
  const accountCol = rawItem.column_values.find(
    (c) => c.id === ACCOUNTS_COLUMN
  );
  const statusCol = rawItem.column_values.find(
    (c) => c.id === BID_STATUS_COLUMN
  );
  const urlCol = rawItem.column_values.find(
    (c) => c.id === SHAREPOINT_URL_COLUMN
  );

  const { isVariant, baseName, suffix } = parseVariantPrefix(rawItem.name);
  const files = extractFileAssets(rawItem.column_values);

  return {
    id: rawItem.id,
    name: rawItem.name,
    accountName: accountCol?.display_value || accountCol?.text || "Unknown",
    bidStatus: statusCol?.text || "",
    sharepointUrl: urlCol?.text ? extractUrl(urlCol.text) : null,
    files,
    isVariant,
    variantSuffix: suffix,
    baseName,
  };
}

async function getEstimateItems(): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;

  const allColumns = [
    ACCOUNTS_COLUMN,
    BID_STATUS_COLUMN,
    SHAREPOINT_URL_COLUMN,
    ...FILE_COLUMNS,
  ];

  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : "";

    const query = `
      query {
        boards(ids: ${BOARD_ID}) {
          items_page(limit: 500${cursorPart}) {
            cursor
            items {
              id
              name
              group { title }
              column_values(ids: ["${allColumns.join('", "')}"]) {
                id
                text
                value
                ... on MirrorValue { display_value }
              }
            }
          }
        }
      }
    `;

    const data = (await mondayQuery(query)) as {
      boards: Array<{
        items_page: {
          cursor: string | null;
          items: Array<{
            id: string;
            name: string;
            group: { title: string };
            column_values: RawColumnValue[];
          }>;
        };
      }>;
    };

    const page = data.boards?.[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        if (!SKIP_GROUPS.has(item.group.title)) {
          items.push(transformRawItem(item));
        }
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

  return items;
}

async function getAssetUrl(assetId: string): Promise<string | null> {
  const q = `query { assets(ids: [${assetId}]) { public_url } }`;
  const data = (await mondayQuery(q)) as {
    assets?: Array<{ public_url: string }>;
  };
  return data.assets?.[0]?.public_url ?? null;
}

async function updateMondayUrl(
  itemId: string,
  url: string,
  name: string
): Promise<void> {
  const value = JSON.stringify({ url, text: name });
  const q = `
    mutation {
      change_column_value(
        board_id: ${BOARD_ID}
        item_id: ${itemId}
        column_id: "${SHAREPOINT_URL_COLUMN}"
        value: ${JSON.stringify(value)}
      ) { id }
    }
  `;
  await mondayQuery(q);
}
