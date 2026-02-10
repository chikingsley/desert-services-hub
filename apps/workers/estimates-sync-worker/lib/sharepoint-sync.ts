/**
 * SharePoint Folder Sync — Library Module
 *
 * Extracted from the Cloudflare Worker (src/index.ts) for use inside the
 * web container's background job worker. Creates/moves SharePoint folders
 * and uploads Monday file column assets.
 *
 * Used by: apps/web/worker.ts (sync_full job)
 */

import { getGraphTokenCached } from "@lib/graph/token";
import {
  buildSharePointUrl,
  CUSTOMER_PROJECTS_PATH,
  DEFAULT_STATUS,
  extractUrl,
  getLetterFolder,
  parseStatusFromUrl,
  parseVariantPrefix,
  sanitizeName,
  SHAREPOINT_HOST,
  SHAREPOINT_SITE_PATH,
  STATUS_MAP,
} from "@lib/sharepoint/paths";

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

interface FileAsset {
  id: string;
  name: string;
  url: string;
  columnId: string;
  subfolder: string;
}

interface MondayItem {
  id: string;
  name: string;
  accountName: string;
  bidStatus: string;
  sharepointUrl: string | null;
  files: FileAsset[];
  isVariant: boolean;
  variantSuffix: string | null;
  baseName: string;
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

// Groups to skip
const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];

// Regex patterns
const SHAREPOINT_PATH_REGEX = /Shared%20Documents\/(.+)/;

// =============================================================================
// Main Sync
// =============================================================================

/**
 * Run a full SharePoint folder sync.
 * Fetches all items from Monday, creates/moves folders, uploads files.
 */
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
        const targetFolder = STATUS_MAP[item.bidStatus] ?? DEFAULT_STATUS;
        const currentFolder = parseStatusFromUrl(item.sharepointUrl);

        // Build folder path using BASE name (without variant prefix)
        const projectName = sanitizeName(item.baseName);
        const accountName = sanitizeName(item.accountName);
        const letter = getLetterFolder(accountName);
        const folderPath = `${CUSTOMER_PROJECTS_PATH}/${targetFolder}/${letter}/${accountName}/${projectName}`;

        if (!item.sharepointUrl && item.files.length > 0) {
          // No URL but has files — create folder and upload
          const created = await ensureFolderExists(token, driveId, folderPath);
          if (created) {
            const uploaded = await uploadItemFiles(
              token,
              driveId,
              folderPath,
              item
            );
            result.filesUploaded += uploaded;

            const url = buildSharePointUrl(folderPath);
            await updateMondayUrl(item.id, url, item.name);
            result.created++;
            console.log(
              `[SharePoint] Created: ${item.name} → ${projectName}/ (${uploaded} files)`
            );
          }
        } else if (
          item.sharepointUrl &&
          currentFolder &&
          currentFolder !== targetFolder
        ) {
          // URL exists but wrong folder — move
          const moved = await moveProjectFolder(
            token,
            driveId,
            item.sharepointUrl,
            currentFolder,
            targetFolder
          );
          if (moved) {
            const newUrl = item.sharepointUrl.replace(
              currentFolder,
              targetFolder
            );
            await updateMondayUrl(item.id, newUrl, item.name);

            const uploaded = await uploadItemFiles(
              token,
              driveId,
              folderPath,
              item
            );
            result.filesUploaded += uploaded;

            result.moved++;
            console.log(
              `[SharePoint] Moved: ${item.name} (${currentFolder} → ${targetFolder})`
            );
          } else {
            result.skipped++;
          }
        } else if (item.sharepointUrl && item.files.length > 0) {
          // URL exists, correct folder — check for new files
          const uploaded = await uploadItemFiles(
            token,
            driveId,
            folderPath,
            item
          );
          if (uploaded > 0) {
            result.filesUploaded += uploaded;
            console.log(
              `[SharePoint] Uploaded ${uploaded} new files: ${item.name}`
            );
          }
          result.skipped++;
        } else {
          result.skipped++;
        }
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
  if (!key) throw new Error("Missing MONDAY_API_KEY");
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
            column_values: Array<{
              id: string;
              text?: string;
              value?: string;
              display_value?: string;
            }>;
          }>;
        };
      }>;
    };

    const page = data.boards?.[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        if (SKIP_GROUPS.includes(item.group.title)) {
          continue;
        }

        const accountCol = item.column_values.find(
          (c) => c.id === ACCOUNTS_COLUMN
        );
        const statusCol = item.column_values.find(
          (c) => c.id === BID_STATUS_COLUMN
        );
        const urlCol = item.column_values.find(
          (c) => c.id === SHAREPOINT_URL_COLUMN
        );

        // Parse variant prefix
        const { isVariant, baseName, suffix } = parseVariantPrefix(item.name);

        // Extract files from all file columns
        const files: FileAsset[] = [];
        for (const colId of FILE_COLUMNS) {
          const col = item.column_values.find((c) => c.id === colId);
          if (col?.value) {
            try {
              const parsed = JSON.parse(col.value);
              if (parsed?.files?.length > 0) {
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
              }
            } catch {
              // Invalid JSON, skip
            }
          }
        }

        items.push({
          id: item.id,
          name: item.name,
          accountName:
            accountCol?.display_value || accountCol?.text || "Unknown",
          bidStatus: statusCol?.text || "",
          sharepointUrl: urlCol?.text ? extractUrl(urlCol.text) : null,
          files,
          isVariant,
          variantSuffix: suffix,
          baseName,
        });
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

// =============================================================================
// File Operations
// =============================================================================

async function downloadFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

async function uploadToSharePoint(
  token: string,
  driveId: string,
  filePath: string,
  content: Uint8Array
): Promise<{ success: boolean; webUrl?: string; error?: string }> {
  const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

  const encodedPath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  if (content.length <= SIMPLE_UPLOAD_LIMIT) {
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}:/content`;
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `Upload failed: ${res.status} - ${errorText}`,
      };
    }

    const data = (await res.json()) as { webUrl: string };
    return { success: true, webUrl: data.webUrl };
  }

  // Chunked upload for large files
  const sessionUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}:/createUploadSession`;
  const sessionRes = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      item: { "@microsoft.graph.conflictBehavior": "replace" },
    }),
  });

  if (!sessionRes.ok) {
    return {
      success: false,
      error: `Failed to create upload session: ${sessionRes.status}`,
    };
  }

  const sessionData = (await sessionRes.json()) as { uploadUrl: string };
  const chunkUploadUrl = sessionData.uploadUrl;

  const CHUNK_SIZE = 10 * 1024 * 1024;
  const fileSize = content.length;
  let offset = 0;

  while (offset < fileSize) {
    const end = Math.min(offset + CHUNK_SIZE, fileSize);
    const chunk = content.slice(offset, end);
    const contentRange = `bytes ${offset}-${end - 1}/${fileSize}`;

    const chunkRes = await fetch(chunkUploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": chunk.length.toString(),
        "Content-Range": contentRange,
      },
      body: chunk,
    });

    if (!chunkRes.ok) {
      const errorText = await chunkRes.text();
      return {
        success: false,
        error: `Chunk upload failed: ${chunkRes.status} - ${errorText}`,
      };
    }

    if (end === fileSize) {
      const data = (await chunkRes.json()) as { webUrl: string };
      return { success: true, webUrl: data.webUrl };
    }

    offset = end;
  }

  return { success: false, error: "Upload completed but no response" };
}

async function fileExistsInSharePoint(
  token: string,
  driveId: string,
  filePath: string
): Promise<boolean> {
  const encodedPath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const endpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function uploadItemFiles(
  token: string,
  driveId: string,
  folderPath: string,
  item: MondayItem
): Promise<number> {
  let uploaded = 0;

  for (const file of item.files) {
    try {
      // Build filename with variant suffix
      let fileName = file.name;
      if (item.isVariant && item.variantSuffix) {
        const lastDot = fileName.lastIndexOf(".");
        if (lastDot > 0) {
          fileName = `${fileName.slice(0, lastDot)}-${item.variantSuffix}${fileName.slice(lastDot)}`;
        } else {
          fileName = `${fileName}-${item.variantSuffix}`;
        }
      }

      const uploadPath = `${folderPath}/${file.subfolder}/${fileName}`;

      // Check if file already exists
      const exists = await fileExistsInSharePoint(token, driveId, uploadPath);
      if (exists) {
        continue;
      }

      // Get asset URL from Monday
      const assetUrl = await getAssetUrl(file.id);
      if (!assetUrl) {
        console.error(
          `[SharePoint] No URL for asset ${file.id} (${file.name})`
        );
        continue;
      }

      // Download from Monday
      const content = await downloadFile(assetUrl);

      // Ensure subfolder exists
      await ensureFolderExists(
        token,
        driveId,
        `${folderPath}/${file.subfolder}`
      );

      // Upload to SharePoint
      const result = await uploadToSharePoint(
        token,
        driveId,
        uploadPath,
        content
      );

      if (result.success) {
        uploaded++;
        console.log(
          `[SharePoint] Uploaded: ${fileName} (${content.length} bytes)`
        );
      } else {
        console.error(
          `[SharePoint] Upload failed for ${fileName}: ${result.error}`
        );
      }
    } catch (error) {
      console.error(`[SharePoint] Failed to process ${file.name}: ${error}`);
    }
  }

  return uploaded;
}

// =============================================================================
// SharePoint Graph API
// =============================================================================

async function getDriveId(token: string): Promise<string> {
  const endpoint = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:${SHAREPOINT_SITE_PATH}:/drives`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get drives: ${res.status}`);
  }

  const data = (await res.json()) as {
    value: Array<{ id: string; name: string }>;
  };
  const docDrive = data.value.find(
    (d) => d.name === "Documents" || d.name === "Shared Documents"
  );
  if (!docDrive) {
    throw new Error("Could not find Documents drive");
  }
  return docDrive.id;
}

async function ensureFolderExists(
  token: string,
  driveId: string,
  path: string
): Promise<boolean> {
  const pathParts = path.split("/");
  let currentPath = "";

  for (const part of pathParts) {
    const parentPath = currentPath;
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    const checkEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(currentPath)}`;
    const checkRes = await fetch(checkEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (checkRes.status === 404) {
      const createEndpoint = parentPath
        ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(parentPath)}:/children`
        : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

      const createRes = await fetch(createEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: part,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });

      if (!createRes.ok && createRes.status !== 409) {
        console.log(
          `[SharePoint] Failed to create folder ${currentPath}: ${createRes.status}`
        );
        return false;
      }
    }
  }

  return true;
}

async function moveProjectFolder(
  token: string,
  driveId: string,
  sharepointUrl: string,
  fromStatus: string,
  toStatus: string
): Promise<boolean> {
  const match = sharepointUrl.match(SHAREPOINT_PATH_REGEX);
  if (!match) {
    return false;
  }

  const currentPath = decodeURIComponent(match[1]);
  const itemEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(currentPath)}`;
  const itemRes = await fetch(itemEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!itemRes.ok) {
    if (itemRes.status === 404) {
      console.log(`[SharePoint] Folder not found: ${currentPath}`);
      return false;
    }
    throw new Error(`Failed to get folder: ${itemRes.status}`);
  }

  const itemData = (await itemRes.json()) as { id: string };
  const newPath = currentPath.replace(`/${fromStatus}/`, `/${toStatus}/`);
  const newParentPath = newPath.substring(0, newPath.lastIndexOf("/"));

  await ensureFolderExists(token, driveId, newParentPath);

  const destEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(newParentPath)}`;
  const destRes = await fetch(destEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!destRes.ok) {
    return false;
  }

  const destData = (await destRes.json()) as { id: string };
  const moveEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemData.id}`;
  const moveRes = await fetch(moveEndpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parentReference: { id: destData.id } }),
  });

  return moveRes.ok;
}
