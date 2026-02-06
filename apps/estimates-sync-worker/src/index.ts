/// <reference types="@cloudflare/workers-types" />
/**
 * Estimates Sync Worker
 *
 * Full sync: creates folders, moves folders, downloads files from Monday,
 * uploads to SharePoint with proper naming (variant suffixes).
 *
 * Cron: 0 * * * * (hourly)
 */

// =============================================================================
// Types
// =============================================================================

export interface Env {
  MONDAY_API_KEY: string;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

interface SyncResult {
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
const CUSTOMER_PROJECTS_PATH = "Customer Projects";

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

// Status → SharePoint folder mapping
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

const DEFAULT_STATUS_FOLDER = "Submitted";
const VALID_STATUS_FOLDERS = new Set([
  "Submitted",
  "Active",
  "Lost",
  "Finished",
]);

// Variant prefix pattern
const VARIANT_PREFIXES = [
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
];
const PREFIX_PATTERN = new RegExp(
  `^(${VARIANT_PREFIXES.join("|")})[\\s\\-_:]+`,
  "i"
);

// SharePoint
const SHAREPOINT_SITE = "desertservices.sharepoint.com";
const SITE_PATH = "/sites/DataDrive";

// Regex patterns (top-level for performance)
const SHAREPOINT_PATH_REGEX = /Shared%20Documents\/(.+)/;
const URL_REGEX = /https?:\/\/\S+/;

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/sync") {
      const result = await runSync(env);
      return Response.json(result);
    }

    if (url.pathname === "/dry-run") {
      const result = await runSync(env, true);
      return Response.json(result);
    }

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    }

    return new Response(
      `Estimates Sync Worker

Endpoints:
  /health   - Health check
  /dry-run  - Preview sync (no changes)
  /sync     - Run full sync

Cron: Hourly

Full sync:
  - Creates folders for items with files
  - Moves folders when status changes
  - Downloads files from Monday
  - Uploads to SharePoint with variant suffixes (TF, PJ, etc.)
  - Updates Monday URLs`,
      { headers: { "Content-Type": "text/plain" } }
    );
  },

  scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): void {
    ctx.waitUntil(
      runSync(env).then((result) => {
        console.log(
          `[Sync] Complete: ${result.created} created, ${result.moved} moved, ${result.filesUploaded} files, ${result.errors.length} errors`
        );
      })
    );
  },
};

// =============================================================================
// Main Sync Logic
// =============================================================================

async function runSync(env: Env, dryRun = false): Promise<SyncResult> {
  const result: SyncResult = {
    processed: 0,
    moved: 0,
    created: 0,
    filesUploaded: 0,
    skipped: 0,
    errors: [],
  };

  try {
    console.log("[Sync] Fetching items from Monday...");
    const items = await getEstimateItems(env);
    console.log(`[Sync] Found ${items.length} items`);

    // Get Graph token and drive ID once
    const token = await getGraphToken(env);
    const driveId = await getDriveId(token);

    for (const item of items) {
      result.processed++;

      try {
        const targetFolder =
          STATUS_MAP[item.bidStatus] ?? DEFAULT_STATUS_FOLDER;
        const currentFolder = parseStatusFromUrl(item.sharepointUrl);

        // Build folder path using BASE name (without variant prefix)
        const projectName = sanitizeName(item.baseName);
        const accountName = sanitizeName(item.accountName);
        const letter = getLetterFolder(accountName);
        const folderPath = `${CUSTOMER_PROJECTS_PATH}/${targetFolder}/${letter}/${accountName}/${projectName}`;

        if (!item.sharepointUrl && item.files.length > 0) {
          // No URL but has files - create folder and upload
          if (dryRun) {
            result.created++;
          } else {
            const created = await ensureFolderExists(
              token,
              driveId,
              folderPath
            );
            if (created) {
              // Upload files with variant suffix
              const uploaded = await uploadItemFiles(
                env,
                token,
                driveId,
                folderPath,
                item
              );
              result.filesUploaded += uploaded;

              // Set URL
              const url = buildSharePointUrl(folderPath);
              await updateMondayUrl(env, item.id, url, item.name);
              result.created++;
              console.log(
                `[Sync] Created: ${item.name} → ${projectName}/ (${uploaded} files)`
              );
            }
          }
        } else if (
          item.sharepointUrl &&
          currentFolder &&
          currentFolder !== targetFolder
        ) {
          // URL exists but wrong folder - move
          if (dryRun) {
            result.moved++;
          } else {
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
              await updateMondayUrl(env, item.id, newUrl, item.name);

              // Also upload any new files
              const newFolderPath = folderPath; // Already has correct targetFolder
              const uploaded = await uploadItemFiles(
                env,
                token,
                driveId,
                newFolderPath,
                item
              );
              result.filesUploaded += uploaded;

              result.moved++;
              console.log(
                `[Sync] Moved: ${item.name} (${currentFolder} → ${targetFolder})`
              );
            } else {
              result.skipped++;
            }
          }
        } else if (item.sharepointUrl && item.files.length > 0) {
          // URL exists, correct folder - check for new files to upload
          if (!dryRun) {
            const uploaded = await uploadItemFiles(
              env,
              token,
              driveId,
              folderPath,
              item
            );
            if (uploaded > 0) {
              result.filesUploaded += uploaded;
              console.log(
                `[Sync] Uploaded ${uploaded} new files: ${item.name}`
              );
            }
          }
          result.skipped++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        const msg = `${item.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[Sync] Error: ${msg}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Sync failed: ${error}`);
    console.error(`[Sync] ${error}`);
    return result;
  }
}

// =============================================================================
// Monday API
// =============================================================================

async function mondayQuery(env: Env, query: string): Promise<unknown> {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.MONDAY_API_KEY,
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

async function getEstimateItems(env: Env): Promise<MondayItem[]> {
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

    const data = (await mondayQuery(env, query)) as {
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
                      url: "", // Will fetch via assets API
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
          sharepointUrl: extractUrl(urlCol?.text),
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

async function getAssetUrl(env: Env, assetId: string): Promise<string | null> {
  const query = `query { assets(ids: [${assetId}]) { public_url } }`;
  const data = (await mondayQuery(env, query)) as {
    assets?: Array<{ public_url: string }>;
  };
  return data.assets?.[0]?.public_url ?? null;
}

async function updateMondayUrl(
  env: Env,
  itemId: string,
  url: string,
  name: string
): Promise<void> {
  const value = JSON.stringify({ url, text: name });
  const query = `
    mutation {
      change_column_value(
        board_id: ${BOARD_ID}
        item_id: ${itemId}
        column_id: "${SHAREPOINT_URL_COLUMN}"
        value: ${JSON.stringify(value)}
      ) { id }
    }
  `;
  await mondayQuery(env, query);
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Download a file from a URL and return as Uint8Array
 */
async function downloadFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Upload a file to SharePoint via Graph API
 * Uses simple upload for files ≤4MB, chunked upload for larger files
 */
async function uploadToSharePoint(
  token: string,
  driveId: string,
  filePath: string,
  content: Uint8Array
): Promise<{ success: boolean; webUrl?: string; error?: string }> {
  const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4MB

  // URL encode each path segment
  const encodedPath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  if (content.length <= SIMPLE_UPLOAD_LIMIT) {
    // Simple upload - use ArrayBuffer for Workers compatibility
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}:/content`;
    const bodyBuffer = (content.buffer as ArrayBuffer).slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    );
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: bodyBuffer,
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
  const uploadUrl = sessionData.uploadUrl;

  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
  const fileSize = content.length;
  let offset = 0;

  while (offset < fileSize) {
    const end = Math.min(offset + CHUNK_SIZE, fileSize);
    const chunk = content.slice(offset, end);
    const contentRange = `bytes ${offset}-${end - 1}/${fileSize}`;

    // Convert chunk to ArrayBuffer for Workers compatibility
    const chunkBuffer = (chunk.buffer as ArrayBuffer).slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength
    );
    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": chunk.length.toString(),
        "Content-Range": contentRange,
      },
      body: chunkBuffer,
    });

    if (!chunkRes.ok) {
      const errorText = await chunkRes.text();
      return {
        success: false,
        error: `Chunk upload failed: ${chunkRes.status} - ${errorText}`,
      };
    }

    // Final chunk returns the completed item
    if (end === fileSize) {
      const data = (await chunkRes.json()) as { webUrl: string };
      return { success: true, webUrl: data.webUrl };
    }

    offset = end;
  }

  return { success: false, error: "Upload completed but no response" };
}

/**
 * Check if a file exists in SharePoint
 */
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

/**
 * Upload all files for a Monday item to SharePoint
 */
async function uploadItemFiles(
  env: Env,
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

      // Build upload path: folderPath/Subfolder/filename
      const uploadPath = `${folderPath}/${file.subfolder}/${fileName}`;

      // Check if file already exists in SharePoint
      const exists = await fileExistsInSharePoint(token, driveId, uploadPath);
      if (exists) {
        console.log(`[Sync] File exists, skipping: ${fileName}`);
        continue;
      }

      // Get asset URL from Monday
      const assetUrl = await getAssetUrl(env, file.id);
      if (!assetUrl) {
        console.error(`[Sync] No URL for asset ${file.id} (${file.name})`);
        continue;
      }

      // Download file from Monday
      console.log(`[Sync] Downloading: ${file.name}`);
      const content = await downloadFile(assetUrl);

      // Ensure subfolder exists
      await ensureFolderExists(
        token,
        driveId,
        `${folderPath}/${file.subfolder}`
      );

      // Upload to SharePoint
      console.log(`[Sync] Uploading: ${fileName} (${content.length} bytes)`);
      const result = await uploadToSharePoint(
        token,
        driveId,
        uploadPath,
        content
      );

      if (result.success) {
        uploaded++;
        console.log(`[Sync] Uploaded: ${fileName}`);
      } else {
        console.error(`[Sync] Upload failed for ${fileName}: ${result.error}`);
      }
    } catch (error) {
      console.error(`[Sync] Failed to process ${file.name}: ${error}`);
    }
  }

  return uploaded;
}

// =============================================================================
// SharePoint Graph API
// =============================================================================

async function getGraphToken(env: Env): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.AZURE_CLIENT_ID,
    client_secret: env.AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function getDriveId(token: string): Promise<string> {
  const endpoint = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}:${SITE_PATH}:/drives`;
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
          `[Sync] Failed to create folder ${currentPath}: ${createRes.status}`
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
      console.log(`[Sync] Folder not found: ${currentPath}`);
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

// =============================================================================
// Utilities
// =============================================================================

function parseVariantPrefix(name: string): {
  isVariant: boolean;
  baseName: string;
  suffix: string | null;
} {
  const match = name.match(PREFIX_PATTERN);
  if (match) {
    return {
      isVariant: true,
      baseName: name.slice(match[0].length).trim(),
      suffix: match[1].toUpperCase(),
    };
  }
  return { isVariant: false, baseName: name.trim(), suffix: null };
}

function parseStatusFromUrl(url: string | null): string | null {
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
  return VALID_STATUS_FOLDERS.has(status) ? status : null;
}

function extractUrl(text?: string): string | null {
  if (!text) {
    return null;
  }
  const match = text.match(URL_REGEX);
  return match?.[0] ?? null;
}

function sanitizeName(name: string): string {
  return name.replace(/["*:<>?/\\|#%~{}]/g, "_").trim();
}

function getLetterFolder(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "_Numeric";
}

function buildSharePointUrl(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://${SHAREPOINT_SITE}${SITE_PATH}/Shared%20Documents/${encodedPath}`;
}
