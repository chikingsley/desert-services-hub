/**
 * SharePoint client — public facade using Microsoft Graph API.
 *
 * Convenience methods operate on the default DataDrive site/drive.
 * For low-level control, use graph-operations.ts functions directly.
 */
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import type {
  SharePointConfig,
  SharePointDrive,
  SharePointItem,
  SharePointList,
  SharePointListItem,
  SharePointSite,
} from "@sharepoint/types";
import { isRootPath, parseItem } from "./graph-helpers";
import {
  addListItem,
  createFolder,
  deleteItem,
  downloadFile,
  downloadFileByPath,
  getListItems,
  getRootSite,
  getSiteById,
  getSiteByPath,
  getWorksheetData,
  LARGE_FILE_THRESHOLD,
  listDriveItems,
  listDrives,
  listFolderItems,
  listLists,
  searchFiles,
  searchSites,
  updateListItem,
  uploadFile,
  uploadLargeFile,
} from "./graph-operations";

const DEFAULT_SITE_PATH = "sites/DataDrive";
const DEFAULT_DRIVE_NAME = "Documents";

export class SharePointClient {
  private readonly client: Client;
  private cachedDefaultDriveId: string | null = null;
  private cachedDefaultSiteId: string | null = null;

  constructor(config: SharePointConfig) {
    const credential = new ClientSecretCredential(
      config.azureTenantId,
      config.azureClientId,
      config.azureClientSecret
    );
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });
    this.client = Client.initWithMiddleware({ authProvider });
  }

  // ===========================================================================
  // Default drive/site resolution
  // ===========================================================================

  async getDefaultSiteId(): Promise<string> {
    if (this.cachedDefaultSiteId) {
      return this.cachedDefaultSiteId;
    }
    const site = await getSiteByPath(this.client, DEFAULT_SITE_PATH);
    this.cachedDefaultSiteId = site.id;
    return site.id;
  }

  async getDefaultDriveId(): Promise<string> {
    if (this.cachedDefaultDriveId) {
      return this.cachedDefaultDriveId;
    }
    const siteId = await this.getDefaultSiteId();
    const drives = await listDrives(this.client, siteId);
    const docDrive = drives.find(
      (d) => d.name === DEFAULT_DRIVE_NAME || d.name === "Shared Documents"
    );
    if (!docDrive) {
      throw new Error(
        `Default drive not found. Available: ${drives.map((d) => d.name).join(", ")}`
      );
    }
    this.cachedDefaultDriveId = docDrive.id;
    return docDrive.id;
  }

  // ===========================================================================
  // Convenience methods (default drive)
  // ===========================================================================

  async listFiles(folderPath = "/"): Promise<SharePointItem[]> {
    const driveId = await this.getDefaultDriveId();
    return isRootPath(folderPath)
      ? listDriveItems(this.client, driveId)
      : listFolderItems(this.client, driveId, folderPath);
  }

  async search(query: string): Promise<SharePointItem[]> {
    const driveId = await this.getDefaultDriveId();
    return searchFiles(this.client, driveId, query);
  }

  async download(filePath: string): Promise<Buffer> {
    const driveId = await this.getDefaultDriveId();
    return downloadFileByPath(this.client, driveId, filePath);
  }

  async upload(
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<SharePointItem> {
    const driveId = await this.getDefaultDriveId();
    return content.length > LARGE_FILE_THRESHOLD
      ? uploadLargeFile(this.client, driveId, folderPath, fileName, content)
      : uploadFile(this.client, driveId, folderPath, fileName, content);
  }

  async mkdir(parentPath: string, folderName: string): Promise<SharePointItem> {
    const driveId = await this.getDefaultDriveId();
    return createFolder(this.client, driveId, parentPath, folderName);
  }

  async ensureFolder(fullPath: string): Promise<SharePointItem> {
    const segments = fullPath.split("/").filter(Boolean);
    let currentPath = "";
    let lastItem: SharePointItem | undefined;
    for (const segment of segments) {
      lastItem = await this.mkdir(currentPath || "/", segment);
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    }
    if (!lastItem) {
      throw new Error(`Cannot create empty folder path: "${fullPath}"`);
    }
    return lastItem;
  }

  async exists(itemPath: string): Promise<boolean> {
    const driveId = await this.getDefaultDriveId();
    try {
      await this.client.api(`/drives/${driveId}/root:/${itemPath}`).get();
      return true;
    } catch {
      return false;
    }
  }

  async delete(itemPath: string): Promise<void> {
    const driveId = await this.getDefaultDriveId();
    const item = await this.client
      .api(`/drives/${driveId}/root:/${itemPath}`)
      .get();
    await deleteItem(this.client, driveId, item.id);
  }

  async getItemByPath(itemPath: string): Promise<SharePointItem> {
    const driveId = await this.getDefaultDriveId();
    const item = await this.client
      .api(`/drives/${driveId}/root:/${itemPath}`)
      .get();
    return parseItem(item as Record<string, unknown>);
  }

  async moveItem(
    sourcePath: string,
    destinationFolderPath: string,
    newName?: string
  ): Promise<SharePointItem> {
    const driveId = await this.getDefaultDriveId();
    const source = await this.client
      .api(`/drives/${driveId}/root:/${sourcePath}`)
      .get();
    const destination = isRootPath(destinationFolderPath)
      ? await this.client.api(`/drives/${driveId}/root`).get()
      : await this.client
          .api(`/drives/${driveId}/root:/${destinationFolderPath}`)
          .get();
    const payload: Record<string, unknown> = {
      parentReference: { id: destination.id as string },
    };
    if (newName) {
      payload.name = newName;
    }
    const moved = await this.client
      .api(`/drives/${driveId}/items/${source.id as string}`)
      .patch(payload);
    return parseItem(moved as Record<string, unknown>);
  }

  // ===========================================================================
  // Delegated resource operations (pass-through to graph-operations)
  // ===========================================================================

  getRootSite(): Promise<SharePointSite> {
    return getRootSite(this.client);
  }
  searchSites(query?: string): Promise<SharePointSite[]> {
    return searchSites(this.client, query);
  }
  getSiteByPath(sitePath: string): Promise<SharePointSite> {
    return getSiteByPath(this.client, sitePath);
  }
  getSiteById(siteId: string): Promise<SharePointSite> {
    return getSiteById(this.client, siteId);
  }
  listDrives(siteId: string): Promise<SharePointDrive[]> {
    return listDrives(this.client, siteId);
  }
  listDriveItems(driveId: string): Promise<SharePointItem[]> {
    return listDriveItems(this.client, driveId);
  }
  listFolderItems(
    driveId: string,
    folderPath: string
  ): Promise<SharePointItem[]> {
    return listFolderItems(this.client, driveId, folderPath);
  }
  downloadFile(driveId: string, itemId: string): Promise<Buffer> {
    return downloadFile(this.client, driveId, itemId);
  }
  downloadFileByPath(driveId: string, filePath: string): Promise<Buffer> {
    return downloadFileByPath(this.client, driveId, filePath);
  }
  uploadFile(
    driveId: string,
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<SharePointItem> {
    return uploadFile(this.client, driveId, folderPath, fileName, content);
  }
  uploadLargeFile(
    driveId: string,
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<SharePointItem> {
    return uploadLargeFile(this.client, driveId, folderPath, fileName, content);
  }
  createFolder(
    driveId: string,
    parentPath: string,
    folderName: string
  ): Promise<SharePointItem> {
    return createFolder(this.client, driveId, parentPath, folderName);
  }
  deleteItem(driveId: string, itemId: string): Promise<void> {
    return deleteItem(this.client, driveId, itemId);
  }
  searchFiles(driveId: string, query: string): Promise<SharePointItem[]> {
    return searchFiles(this.client, driveId, query);
  }
  listLists(siteId: string): Promise<SharePointList[]> {
    return listLists(this.client, siteId);
  }
  getListItems(siteId: string, listId: string): Promise<SharePointListItem[]> {
    return getListItems(this.client, siteId, listId);
  }
  addListItem(
    siteId: string,
    listId: string,
    fields: Record<string, unknown>
  ): Promise<SharePointListItem> {
    return addListItem(this.client, siteId, listId, fields);
  }
  updateListItem(
    siteId: string,
    listId: string,
    itemId: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    return updateListItem(this.client, siteId, listId, itemId, fields);
  }
  getWorksheetData(
    driveId: string,
    itemId: string,
    worksheetName: string
  ): Promise<unknown[][]> {
    return getWorksheetData(this.client, driveId, itemId, worksheetName);
  }
}
