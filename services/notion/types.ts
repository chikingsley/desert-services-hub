/**
 * Notion Service Types
 */

export type NotionPage = {
  id: string;
  properties: Record<string, unknown>;
  icon?: { type: string; external?: { url: string } };
  created_time?: string;
  last_edited_time?: string;
};

export type NotionDatabase = {
  id: string;
  title: string;
  properties: Record<string, { name: string; type: string }>;
};

export type NotionQueryResult<T = NotionPage> = {
  results: T[];
  has_more: boolean;
  next_cursor?: string;
};

export type CreatePageOptions = {
  databaseId: string;
  properties: Record<string, unknown>;
  icon?: { type: "external"; external: { url: string } };
};

export type UpdatePageOptions = {
  pageId: string;
  properties?: Record<string, unknown>;
  icon?: { type: "external"; external: { url: string } };
  archived?: boolean;
};

export type QueryDatabaseOptions = {
  databaseId: string;
  filter?: Record<string, unknown>;
  sorts?: Array<{
    property?: string;
    timestamp?: string;
    direction: "ascending" | "descending";
  }>;
  pageSize?: number;
  startCursor?: string;
};

// File upload types
export type FileUploadResult = {
  id: string;
  upload_url: string;
};
