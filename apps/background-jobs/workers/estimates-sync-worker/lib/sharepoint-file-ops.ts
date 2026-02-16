/**
 * SharePoint File Operations & Graph API
 *
 * Extracted from sharepoint-sync.ts. Contains:
 *   - File download/upload operations
 *   - SharePoint Graph API (drive, folders, move)
 *   - uploadItemFiles orchestration
 */
import { SHAREPOINT_HOST, SHAREPOINT_SITE_PATH } from "@sharepoint/paths";

// ============================================================================
// Types (shared with sharepoint-sync.ts)
// ============================================================================

export interface FileAsset {
  id: string;
  name: string;
  url: string;
  columnId: string;
  subfolder: string;
}

export interface MondayItem {
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

// ============================================================================
// File Operations
// ============================================================================

async function downloadFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Ensure an actual ArrayBuffer (not SharedArrayBuffer) for fetch BodyInit typing.
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

export async function uploadToSharePoint(
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
      body: u8ToArrayBuffer(content),
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
      body: u8ToArrayBuffer(chunk),
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

export async function fileExistsInSharePoint(
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

export async function uploadItemFiles(
  token: string,
  driveId: string,
  folderPath: string,
  item: MondayItem,
  getAssetUrl: (assetId: string) => Promise<string | null>
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

      const exists = await fileExistsInSharePoint(token, driveId, uploadPath);
      if (exists) {
        continue;
      }

      const assetUrl = await getAssetUrl(file.id);
      if (!assetUrl) {
        console.error(
          `[SharePoint] No URL for asset ${file.id} (${file.name})`
        );
        continue;
      }

      const content = await downloadFile(assetUrl);

      await ensureFolderExists(
        token,
        driveId,
        `${folderPath}/${file.subfolder}`
      );

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

// ============================================================================
// SharePoint Graph API
// ============================================================================

export async function getDriveId(token: string): Promise<string> {
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

export async function ensureFolderExists(
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

const SHAREPOINT_PATH_REGEX = /Shared%20Documents\/(.+)/;

export async function moveProjectFolder(
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
