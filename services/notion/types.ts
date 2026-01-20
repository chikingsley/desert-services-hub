/**
 * Notion Service Types
 */

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  icon?: { type: string; external?: { url: string } };
  created_time?: string;
  last_edited_time?: string;
}

export interface NotionDatabase {
  id: string;
  title: string;
  properties: Record<string, { name: string; type: string }>;
}

export interface NotionQueryResult<T = NotionPage> {
  results: T[];
  has_more: boolean;
  next_cursor?: string;
}

export interface CreatePageOptions {
  databaseId: string;
  properties: Record<string, unknown>;
  icon?: { type: "external"; external: { url: string } };
}

export interface UpdatePageOptions {
  pageId: string;
  properties?: Record<string, unknown>;
  icon?: { type: "external"; external: { url: string } };
  archived?: boolean;
}

export interface QueryDatabaseOptions {
  databaseId: string;
  filter?: Record<string, unknown>;
  sorts?: Array<{
    property?: string;
    timestamp?: string;
    direction: "ascending" | "descending";
  }>;
  pageSize?: number;
  startCursor?: string;
}

// File upload types
export interface FileUploadResult {
  id: string;
  upload_url: string;
}
