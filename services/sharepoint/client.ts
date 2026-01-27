/**
 * SharePoint client using Microsoft Graph API
 * Uses app-only authentication (client credentials)
 */
import { ClientSecretCredential } from "@azure/identity";
import {
  Client,
  FileUpload,
  type LargeFileUploadSession,
  LargeFileUploadTask,
  type PageCollection,
  PageIterator,
} from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import type {
  SharePointConfig,
  SharePointDrive,
  SharePointFile,
  SharePointFolder,
  SharePointItem,
  SharePointList,
  SharePointListItem,
  SharePointSite,
} from "./types";

/**
 * Default SharePoint site and drive configuration
 * DataDrive: https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents
 */
const DEFAULT_SITE_PATH = "sites/DataDrive";
const DEFAULT_DRIVE_NAME = "Documents"; // "Shared Documents" appears as "Documents" in API

/** Simple PUT upload limit (Graph API caps at 250MB, we use 4MB threshold for reliability) */
const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024;

/** Upload session chunk size — 5MB (must be multiple of 320KB) */
const UPLOAD_CHUNK_SIZE = 5 * 320 * 1024;

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

  /**
   * Get the default DataDrive site ID
   */
  async getDefaultSiteId(): Promise<string> {
    if (this.cachedDefaultSiteId) {
      return this.cachedDefaultSiteId;
    }
    const site = await this.getSiteByPath(DEFAULT_SITE_PATH);
    this.cachedDefaultSiteId = site.id;
    return site.id;
  }

  /**
   * Get the default "Shared Documents" drive ID from DataDrive
   * This is the most common drive used for file operations
   */
  async getDefaultDriveId(): Promise<string> {
    if (this.cachedDefaultDriveId) {
      return this.cachedDefaultDriveId;
    }

    const siteId = await this.getDefaultSiteId();
    const drives = await this.listDrives(siteId);
    const docDrive = drives.find(
      (d) => d.name === DEFAULT_DRIVE_NAME || d.name === "Shared Documents"
    );

    if (!docDrive) {
      throw new Error(
        `Default drive not found. Available drives: ${drives.map((d) => d.name).join(", ")}`
      );
    }

    this.cachedDefaultDriveId = docDrive.id;
    return docDrive.id;
  }

  // ============================================================================
  // Convenience methods using default drive
  // ============================================================================

  /**
   * List files in a folder on the default drive (auto-paginates)
   */
  async listFiles(folderPath = "/"): Promise<SharePointItem[]> {
    const driveId = await this.getDefaultDriveId();

    return this.isRootPath(folderPath)
      ? this.listDriveItems(driveId)
      : this.listFolderItems(driveId, folderPath);
  }

  /**
   * Search files on the default drive (auto-paginates)
   */
  async search(query: string): Promise<SharePointItem[]> {
    const driveId = await this.getDefaultDriveId();
    return this.searchFiles(driveId, query);
  }

  /**
   * Download a file from the default drive by path
   */
  async download(filePath: string): Promise<Buffer> {
    const driveId = await this.getDefaultDriveId();
    return this.downloadFileByPath(driveId, filePath);
  }

  /**
   * Upload a file to the default drive.
   * Automatically uses upload sessions for files > 4MB.
   */
  async upload(
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<SharePointItem> {
    const driveId = await this.getDefaultDriveId();

    if (content.length > LARGE_FILE_THRESHOLD) {
      return this.uploadLargeFile(driveId, folderPath, fileName, content);
    }

    return this.uploadFile(driveId, folderPath, fileName, content);
  }

  /**
   * Create a folder on the default drive (idempotent — returns existing folder if it exists)
   */
  async mkdir(parentPath: string, folderName: string): Promise<SharePointItem> {
    const driveId = await this.getDefaultDriveId();
    return this.createFolder(driveId, parentPath, folderName);
  }

  /**
   * Create a full nested folder path on the default drive (idempotent).
   * Each segment is created if it doesn't exist.
   *
   * @example
   * await sp.ensureFolder("Customer Projects/Active/W/Weis Builders/The Verge");
   */
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

  /**
   * Check if a file or folder exists at the given path
   */
  async exists(itemPath: string): Promise<boolean> {
    const driveId = await this.getDefaultDriveId();
    try {
      await this.client.api(`/drives/${driveId}/root:/${itemPath}`).get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file or folder on the default drive by path
   */
  async delete(itemPath: string): Promise<void> {
    const driveId = await this.getDefaultDriveId();
    const item = await this.client
      .api(`/drives/${driveId}/root:/${itemPath}`)
      .get();

    await this.deleteItem(driveId, item.id);
  }

  /**
   * Get worksheet used range data (rows/columns)
   */
  async getWorksheetData(
    driveId: string,
    itemId: string,
    worksheetName: string
  ): Promise<unknown[][]> {
    const response = await this.client
      .api(
        `/drives/${driveId}/items/${itemId}/workbook/worksheets/${worksheetName}/usedRange`
      )
      .get();

    return response.values ?? [];
  }

  // ============================================================================
  // Site Operations
  // ============================================================================

  /**
   * Get the root SharePoint site
   */
  async getRootSite(): Promise<SharePointSite> {
    const site = await this.client.api("/sites/root").get();
    return this.parseSite(site);
  }

  /**
   * Search for SharePoint sites (auto-paginates)
   */
  async searchSites(query = "*"): Promise<SharePointSite[]> {
    const response: PageCollection = await this.client
      .api(`/sites?search=${encodeURIComponent(query)}`)
      .get();
    return this.collectPages(response, (s) => this.parseSite(s));
  }

  /**
   * Get a site by its path (e.g., "sites/DustControl")
   */
  async getSiteByPath(sitePath: string): Promise<SharePointSite> {
    // Extract hostname from root site first
    const rootSite = await this.getRootSite();
    const hostname = new URL(rootSite.webUrl).hostname;
    const site = await this.client.api(`/sites/${hostname}:/${sitePath}`).get();
    return this.parseSite(site);
  }

  /**
   * Get a site by its ID
   */
  async getSiteById(siteId: string): Promise<SharePointSite> {
    const site = await this.client.api(`/sites/${siteId}`).get();
    return this.parseSite(site);
  }

  /**
   * List all drives (document libraries) in a site
   */
  async listDrives(siteId: string): Promise<SharePointDrive[]> {
    const response = await this.client.api(`/sites/${siteId}/drives`).get();
    return (response.value ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      name: d.name as string,
      driveType: d.driveType as string,
      webUrl: d.webUrl as string,
    }));
  }

  /**
   * List items in a drive's root folder (auto-paginates)
   */
  async listDriveItems(driveId: string): Promise<SharePointItem[]> {
    const response: PageCollection = await this.client
      .api(`/drives/${driveId}/root/children`)
      .get();
    return this.collectPages(response, (i) => this.parseItem(i));
  }

  /**
   * List items in a specific folder (auto-paginates)
   */
  async listFolderItems(
    driveId: string,
    folderPath: string
  ): Promise<SharePointItem[]> {
    const response: PageCollection = await this.client
      .api(`/drives/${driveId}/root:/${folderPath}:/children`)
      .get();
    return this.collectPages(response, (i) => this.parseItem(i));
  }

  /**
   * Get a file's content as a Buffer
   */
  async downloadFile(driveId: string, itemId: string): Promise<Buffer> {
    const response = await this.client
      .api(`/drives/${driveId}/items/${itemId}/content`)
      .get();
    return this.responseToBuffer(response);
  }

  /**
   * Download a file by path
   */
  async downloadFileByPath(driveId: string, filePath: string): Promise<Buffer> {
    const response = await this.client
      .api(`/drives/${driveId}/root:/${filePath}:/content`)
      .get();
    return this.responseToBuffer(response);
  }

  /**
   * Convert response (Buffer, ArrayBuffer, or ReadableStream) to Buffer
   */
  private responseToBuffer(response: unknown): Buffer | Promise<Buffer> {
    if (Buffer.isBuffer(response)) {
      return response;
    }

    if (response instanceof ArrayBuffer) {
      return Buffer.from(response);
    }

    if (this.isReadableStream(response)) {
      return this.readStreamToBuffer(response);
    }

    return Buffer.from(response as ArrayBuffer);
  }

  private isReadableStream(
    value: unknown
  ): value is ReadableStream<Uint8Array> {
    return value !== null && typeof value === "object" && "getReader" in value;
  }

  private async readStreamToBuffer(
    stream: ReadableStream<Uint8Array>
  ): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    let result = await reader.read();
    while (result.done === false) {
      if (result.value) {
        chunks.push(result.value);
      }
      result = await reader.read();
    }

    return Buffer.concat(chunks);
  }

  /**
   * Upload a small file (< 4MB) to a drive via simple PUT
   */
  async uploadFile(
    driveId: string,
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<SharePointItem> {
    const isRoot = this.isRootPath(folderPath);
    const filePath = isRoot ? fileName : `${folderPath}/${fileName}`;
    const apiPath = `/drives/${driveId}/root:/${filePath}:/content`;

    const response = await this.client.api(apiPath).put(content);
    return this.parseItem(response);
  }

  /**
   * Upload a large file (> 4MB) using a resumable upload session.
   * Chunks are 1.6MB (5 * 320KB) for reliability.
   */
  async uploadLargeFile(
    driveId: string,
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<SharePointItem> {
    const isRoot = this.isRootPath(folderPath);
    const filePath = isRoot ? fileName : `${folderPath}/${fileName}`;
    const sessionUrl = `/drives/${driveId}/root:/${filePath}:/createUploadSession`;

    const session: LargeFileUploadSession =
      await LargeFileUploadTask.createUploadSession(this.client, sessionUrl, {
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
          name: fileName,
        },
      });

    const fileObj = new FileUpload(content, fileName, content.length);
    const task = new LargeFileUploadTask(this.client, fileObj, session, {
      rangeSize: UPLOAD_CHUNK_SIZE,
    });

    const result = await task.upload();
    const body = result.responseBody as Record<string, unknown>;
    return this.parseItem(body);
  }

  /**
   * Create a folder (idempotent — uses "rename" conflict behavior which
   * returns the existing folder without error if it already exists)
   */
  async createFolder(
    driveId: string,
    parentPath: string,
    folderName: string
  ): Promise<SharePointItem> {
    const isRoot = this.isRootPath(parentPath);
    const apiPath = isRoot
      ? `/drives/${driveId}/root/children`
      : `/drives/${driveId}/root:/${parentPath}:/children`;

    const response = await this.client.api(apiPath).post({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });

    return this.parseItem(response);
  }

  private isRootPath(path: string): boolean {
    return path === "/" || path === "";
  }

  /**
   * Delete an item (file or folder)
   */
  async deleteItem(driveId: string, itemId: string): Promise<void> {
    await this.client.api(`/drives/${driveId}/items/${itemId}`).delete();
  }

  /**
   * Search for files in a drive (auto-paginates)
   */
  async searchFiles(driveId: string, query: string): Promise<SharePointItem[]> {
    const escaped = query.replace(/'/g, "''");
    const response: PageCollection = await this.client
      .api(`/drives/${driveId}/root/search(q='${escaped}')`)
      .get();
    return this.collectPages(response, (i) => this.parseItem(i));
  }

  /**
   * List SharePoint lists in a site
   */
  async listLists(siteId: string): Promise<SharePointList[]> {
    const response = await this.client.api(`/sites/${siteId}/lists`).get();
    return (response.value ?? []).map((l: Record<string, unknown>) => ({
      id: l.id as string,
      name: l.name as string,
      displayName: l.displayName as string,
      webUrl: l.webUrl as string,
      description: l.description as string | undefined,
    }));
  }

  /**
   * Get items from a SharePoint list (auto-paginates)
   */
  async getListItems(
    siteId: string,
    listId: string
  ): Promise<SharePointListItem[]> {
    const response: PageCollection = await this.client
      .api(`/sites/${siteId}/lists/${listId}/items`)
      .expand("fields")
      .get();
    return this.collectPages(response, (i) => ({
      id: i.id as string,
      fields: (i.fields as Record<string, unknown>) ?? {},
      createdDateTime: i.createdDateTime as string,
      lastModifiedDateTime: i.lastModifiedDateTime as string,
    }));
  }

  /**
   * Add an item to a SharePoint list
   */
  async addListItem(
    siteId: string,
    listId: string,
    fields: Record<string, unknown>
  ): Promise<SharePointListItem> {
    const response = await this.client
      .api(`/sites/${siteId}/lists/${listId}/items`)
      .post({ fields });
    return {
      id: response.id,
      fields: response.fields ?? {},
      createdDateTime: response.createdDateTime,
      lastModifiedDateTime: response.lastModifiedDateTime,
    };
  }

  /**
   * Update a list item
   */
  async updateListItem(
    siteId: string,
    listId: string,
    itemId: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    await this.client
      .api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
      .patch(fields);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Collect all pages from a paginated Graph API response.
   * Uses the SDK's PageIterator to follow @odata.nextLink automatically.
   */
  private async collectPages<T>(
    response: PageCollection,
    transform: (item: Record<string, unknown>) => T
  ): Promise<T[]> {
    const items: T[] = [];

    const iterator = new PageIterator(
      this.client,
      response,
      (data: Record<string, unknown>) => {
        items.push(transform(data));
        return true; // continue iterating
      }
    );

    await iterator.iterate();
    return items;
  }

  private parseSite(site: Record<string, unknown>): SharePointSite {
    return {
      id: site.id as string,
      name: site.name as string,
      displayName: (site.displayName as string) ?? (site.name as string),
      webUrl: site.webUrl as string,
      description: site.description as string | undefined,
    };
  }

  private parseItem(item: Record<string, unknown>): SharePointItem {
    return {
      id: item.id as string,
      name: item.name as string,
      webUrl: item.webUrl as string,
      size: item.size as number | undefined,
      createdDateTime: item.createdDateTime as string,
      lastModifiedDateTime: item.lastModifiedDateTime as string,
      folder: item.folder as SharePointFolder | undefined,
      file: item.file as SharePointFile | undefined,
    };
  }
}
