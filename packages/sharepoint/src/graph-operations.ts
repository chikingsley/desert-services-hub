/**
 * Low-level Graph API operations for SharePoint resources.
 * Each function takes a Graph `Client` as its first parameter.
 */

import type {
  Client,
  LargeFileUploadSession,
  PageCollection,
} from "@microsoft/microsoft-graph-client";
import {
  FileUpload,
  LargeFileUploadTask,
} from "@microsoft/microsoft-graph-client";
import type {
  SharePointDrive,
  SharePointItem,
  SharePointList,
  SharePointListItem,
  SharePointSite,
} from "@sharepoint/types";
import {
  collectPages,
  isRootPath,
  parseItem,
  parseSite,
  responseToBuffer,
} from "./graph-helpers";

/** Simple PUT upload limit (4MB threshold for reliability) */
export const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024;
/** Upload session chunk size — 1.6MB (must be multiple of 320KB) */
const UPLOAD_CHUNK_SIZE = 5 * 320 * 1024;

// — Sites —

export async function getRootSite(client: Client): Promise<SharePointSite> {
  const site = await client.api("/sites/root").get();
  return parseSite(site);
}

export async function searchSites(
  client: Client,
  query = "*"
): Promise<SharePointSite[]> {
  const response: PageCollection = await client
    .api(`/sites?search=${encodeURIComponent(query)}`)
    .get();
  return collectPages(client, response, (s) => parseSite(s));
}

export async function getSiteByPath(
  client: Client,
  sitePath: string
): Promise<SharePointSite> {
  const rootSite = await getRootSite(client);
  const { hostname } = new URL(rootSite.webUrl);
  const site = await client.api(`/sites/${hostname}:/${sitePath}`).get();
  return parseSite(site);
}

export async function getSiteById(
  client: Client,
  siteId: string
): Promise<SharePointSite> {
  const site = await client.api(`/sites/${siteId}`).get();
  return parseSite(site);
}

// — Drives —

export async function listDrives(
  client: Client,
  siteId: string
): Promise<SharePointDrive[]> {
  const response = await client.api(`/sites/${siteId}/drives`).get();
  return (response.value ?? []).map((d: Record<string, unknown>) => ({
    driveType: d.driveType as string,
    id: d.id as string,
    name: d.name as string,
    webUrl: d.webUrl as string,
  }));
}

export async function listDriveItems(
  client: Client,
  driveId: string
): Promise<SharePointItem[]> {
  const response: PageCollection = await client
    .api(`/drives/${driveId}/root/children`)
    .get();
  return collectPages(client, response, (i) => parseItem(i));
}

export async function listFolderItems(
  client: Client,
  driveId: string,
  folderPath: string
): Promise<SharePointItem[]> {
  const response: PageCollection = await client
    .api(`/drives/${driveId}/root:/${folderPath}:/children`)
    .get();
  return collectPages(client, response, (i) => parseItem(i));
}

export async function downloadFile(
  client: Client,
  driveId: string,
  itemId: string
): Promise<Buffer> {
  const response = await client
    .api(`/drives/${driveId}/items/${itemId}/content`)
    .get();
  return responseToBuffer(response);
}

export async function downloadFileByPath(
  client: Client,
  driveId: string,
  filePath: string
): Promise<Buffer> {
  const response = await client
    .api(`/drives/${driveId}/root:/${filePath}:/content`)
    .get();
  return responseToBuffer(response);
}

export async function uploadFile(
  client: Client,
  driveId: string,
  folderPath: string,
  fileName: string,
  content: Buffer
): Promise<SharePointItem> {
  const filePath = isRootPath(folderPath)
    ? fileName
    : `${folderPath}/${fileName}`;
  const apiPath = `/drives/${driveId}/root:/${filePath}:/content`;
  const response = await client.api(apiPath).put(content);
  return parseItem(response);
}

export async function uploadLargeFile(
  client: Client,
  driveId: string,
  folderPath: string,
  fileName: string,
  content: Buffer
): Promise<SharePointItem> {
  const filePath = isRootPath(folderPath)
    ? fileName
    : `${folderPath}/${fileName}`;
  const sessionUrl = `/drives/${driveId}/root:/${filePath}:/createUploadSession`;

  const session: LargeFileUploadSession =
    await LargeFileUploadTask.createUploadSession(client, sessionUrl, {
      item: {
        "@microsoft.graph.conflictBehavior": "replace",
        name: fileName,
      },
    });

  const fileObj = new FileUpload(content, fileName, content.length);
  const task = new LargeFileUploadTask(client, fileObj, session, {
    rangeSize: UPLOAD_CHUNK_SIZE,
  });

  const result = await task.upload();
  return parseItem(result.responseBody as Record<string, unknown>);
}

export async function searchFiles(
  client: Client,
  driveId: string,
  query: string
): Promise<SharePointItem[]> {
  const escaped = query.replaceAll(/'/g, "''");
  const response: PageCollection = await client
    .api(`/drives/${driveId}/root/search(q='${escaped}')`)
    .get();
  return collectPages(client, response, (i) => parseItem(i));
}

export async function deleteItem(
  client: Client,
  driveId: string,
  itemId: string
): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}`).delete();
}

// — Folders —

/** Create a folder (idempotent). On 409, returns the existing folder. */
export async function createFolder(
  client: Client,
  driveId: string,
  parentPath: string,
  folderName: string
): Promise<SharePointItem> {
  const root = isRootPath(parentPath);
  const apiPath = root
    ? `/drives/${driveId}/root/children`
    : `/drives/${driveId}/root:/${parentPath}:/children`;

  try {
    const response = await client.api(apiPath).post({
      "@microsoft.graph.conflictBehavior": "fail",
      folder: {},
      name: folderName,
    });

    return parseItem(response);
  } catch (error: unknown) {
    const { statusCode } = error as { statusCode?: unknown };
    const { code } = error as { code?: unknown };
    if (statusCode === 409 || code === "nameAlreadyExists") {
      const folderPath = root ? folderName : `${parentPath}/${folderName}`;
      const existing = await client
        .api(`/drives/${driveId}/root:/${folderPath}`)
        .get();
      return parseItem(existing as Record<string, unknown>);
    }
    throw error;
  }
}

export async function listLists(
  client: Client,
  siteId: string
): Promise<SharePointList[]> {
  const response = await client.api(`/sites/${siteId}/lists`).get();
  return (response.value ?? []).map((l: Record<string, unknown>) => ({
    description: l.description as string | undefined,
    displayName: l.displayName as string,
    id: l.id as string,
    name: l.name as string,
    webUrl: l.webUrl as string,
  }));
}

export async function getListItems(
  client: Client,
  siteId: string,
  listId: string
): Promise<SharePointListItem[]> {
  const response: PageCollection = await client
    .api(`/sites/${siteId}/lists/${listId}/items`)
    .expand("fields")
    .get();
  return collectPages(client, response, (i) => ({
    createdDateTime: i.createdDateTime as string,
    fields: (i.fields as Record<string, unknown>) ?? {},
    id: i.id as string,
    lastModifiedDateTime: i.lastModifiedDateTime as string,
  }));
}

export async function addListItem(
  client: Client,
  siteId: string,
  listId: string,
  fields: Record<string, unknown>
): Promise<SharePointListItem> {
  const response = await client
    .api(`/sites/${siteId}/lists/${listId}/items`)
    .post({ fields });
  return {
    createdDateTime: response.createdDateTime,
    fields: response.fields ?? {},
    id: response.id,
    lastModifiedDateTime: response.lastModifiedDateTime,
  };
}

export async function updateListItem(
  client: Client,
  siteId: string,
  listId: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await client
    .api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
    .patch(fields);
}

export async function getWorksheetData(
  client: Client,
  driveId: string,
  itemId: string,
  worksheetName: string
): Promise<unknown[][]> {
  const response = await client
    .api(
      `/drives/${driveId}/items/${itemId}/workbook/worksheets/${worksheetName}/usedRange`
    )
    .get();
  return response.values ?? [];
}
