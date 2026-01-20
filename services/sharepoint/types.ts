/**
 * Type definitions for SharePoint client
 */

export type SharePointConfig = {
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
};

export type SharePointSite = {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
  description?: string;
};

export type SharePointDrive = {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
};

export type SharePointFolder = {
  childCount: number;
};

export type SharePointFile = {
  mimeType: string;
};

export type SharePointItem = {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  folder?: SharePointFolder;
  file?: SharePointFile;
};

export type SharePointList = {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
  description?: string;
};

export type SharePointListItem = {
  id: string;
  fields: Record<string, unknown>;
  createdDateTime: string;
  lastModifiedDateTime: string;
};
