/**
 * Type definitions for SharePoint client
 */

export interface SharePointConfig {
  azureClientId: string;
  azureClientSecret: string;
  azureTenantId: string;
}

export interface SharePointSite {
  description?: string;
  displayName: string;
  id: string;
  name: string;
  webUrl: string;
}

export interface SharePointDrive {
  driveType: string;
  id: string;
  name: string;
  webUrl: string;
}

export interface SharePointFolder {
  childCount: number;
}

export interface SharePointFile {
  mimeType: string;
}

export interface SharePointItem {
  createdDateTime: string;
  file?: SharePointFile;
  folder?: SharePointFolder;
  id: string;
  lastModifiedDateTime: string;
  name: string;
  size?: number;
  webUrl: string;
}

export interface SharePointList {
  description?: string;
  displayName: string;
  id: string;
  name: string;
  webUrl: string;
}

export interface SharePointListItem {
  createdDateTime: string;
  fields: Record<string, unknown>;
  id: string;
  lastModifiedDateTime: string;
}
