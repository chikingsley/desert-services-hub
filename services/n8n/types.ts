/**
 * n8n Workflow Builder Types
 */

// ============================================================================
// Credential Registry
// ============================================================================

/**
 * Pre-configured credentials from your n8n instance
 */
export const CREDENTIALS = {
  monday: {
    id: "QiYn3cSgzlxRZaDF",
    name: "Monday.com account",
    type: "mondayComApi",
  },
  sharepoint: {
    id: "58WyX3gCRVkPPHjm",
    name: "Microsoft SharePoint account",
    type: "microsoftSharePointOAuth2Api",
  },
  outlook: {
    id: "b1qzCmKPi8N6Gbln",
    name: "Microsoft Outlook account",
    type: "microsoftOutlookOAuth2Api",
  },
  notion: {
    id: "3x4SDK8mBGaAQ34p",
    name: "Notion account",
    type: "notionApi",
  },
  tavily: {
    id: "hdnFulp6AnGv7vKk",
    name: "Tavily account",
    type: "tavilyApi",
  },
  openrouter: {
    id: "bdqZmy1wXVh3HTef",
    name: "OpenRouter account",
    type: "openRouterApi",
  },
} as const;

export type CredentialKey = keyof typeof CREDENTIALS;

// ============================================================================
// Node Types
// ============================================================================

export type N8nPosition = [number, number];

export interface N8nCredentialRef {
  id: string;
  name: string;
}

export interface N8nNode {
  parameters: Record<string, unknown>;
  type: string;
  typeVersion: number;
  position: N8nPosition;
  id: string;
  name: string;
  credentials?: Record<string, N8nCredentialRef>;
  webhookId?: string;
  alwaysOutputData?: boolean;
  onError?: string;
  retryOnFail?: boolean;
}

export interface N8nConnection {
  node: string;
  type: string;
  index: number;
}

export type N8nConnections = Record<
  string,
  {
    main: N8nConnection[][];
  }
>;

export interface N8nWorkflowJson {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  active: boolean;
  settings: {
    executionOrder: string;
  };
  pinData?: Record<string, unknown[]>;
  versionId?: string;
  meta?: {
    templateCredsSetupCompleted: boolean;
    instanceId: string;
  };
  id?: string;
  tags: string[];
}

// ============================================================================
// Builder Options
// ============================================================================

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ScheduleTriggerOptions {
  /** Interval in hours */
  hours?: number;
  /** Interval in minutes */
  minutes?: number;
  /** Cron expression */
  cron?: string;
}

export interface WebhookOptions {
  method?: HttpMethod;
  path: string;
  /** How to respond: 'immediately' (default) or 'lastNode' (wait for workflow to complete) */
  responseMode?: "onReceived" | "lastNode" | "responseNode";
}

export interface HttpRequestOptions {
  method?: HttpMethod;
  url: string;
  credential?: CredentialKey;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  bodyType?: "json" | "form-urlencoded" | "raw";
}

export interface CodeOptions {
  code: string;
  mode?: "runOnceForAllItems" | "runOnceForEachItem";
}

export interface IfCondition {
  leftValue: string;
  rightValue?: string | number | boolean;
  operator: {
    type: "string" | "number" | "boolean";
    operation: string;
    singleValue?: boolean;
  };
}

export interface IfOptions {
  conditions: IfCondition[];
  combinator?: "and" | "or";
  /** Automatically convert types when comparing (recommended) */
  looseTypeValidation?: boolean;
}

export type FilterOptions = IfOptions;

export interface SplitOutOptions {
  field: string;
  includeFields?: string[];
}

export interface LoopOptions {
  batchSize?: number;
}

// ============================================================================
// Native Node Options
// ============================================================================

export interface MondayGetItemsOptions {
  boardId: string;
  groupId?: string;
  limit?: number;
}

export interface MondayUpdateItemOptions {
  boardId: string;
  itemId: string;
  columnId: string;
  value: string;
}

export interface MondayCreateItemOptions {
  boardId: string;
  groupId: string;
  name: string;
  /** Column values as JSON string */
  columnValues?: string;
}

export interface MondayGetItemOptions {
  itemId: string;
}

export interface MondayGetBoardsOptions {
  limit?: number;
}

export interface MondayGetGroupsOptions {
  boardId: string;
}

export interface MondayDeleteItemOptions {
  itemId: string;
}

export interface MondayGetColumnsOptions {
  boardId: string;
}

export interface MondayAddUpdateOptions {
  itemId: string;
  body: string;
}

export interface NotionDatabaseRef {
  id: string;
  name?: string;
  url?: string;
}

export interface NotionFilterCondition {
  key: string;
  condition:
    | "is_empty"
    | "is_not_empty"
    | "equals"
    | "does_not_equal"
    | "contains"
    | "does_not_contain";
  value?: string;
}

export interface NotionGetAllOptions {
  database: NotionDatabaseRef;
  limit?: number;
  returnAll?: boolean;
  filters?: NotionFilterCondition[];
  sortBy?: { key: string; direction: "ascending" | "descending" };
}

export interface NotionCreatePageOptions {
  database: NotionDatabaseRef;
  title: string;
  properties?: Record<string, unknown>;
}

export interface NotionUpdatePageOptions {
  pageId: string;
  properties: Array<{
    key: string;
    value: unknown;
    type?: "relation" | "text" | "number" | "select" | "url";
  }>;
}

export interface DataTableRef {
  id: string;
  name?: string;
}

export interface DataTableUpsertOptions {
  table: DataTableRef;
  matchColumn: string;
  matchValue: string;
  columns: Record<string, string>;
}

export interface DataTableGetOptions {
  table: DataTableRef;
  matchColumn: string;
  matchValue: string;
  limit?: number;
}

export interface MaricopaAssessorOptions {
  /** Search query (address, APN, etc.) */
  query?: string;
  /** Assessor Parcel Number for direct lookup */
  apn?: string;
  /** API token header value */
  token?: string;
}

// ============================================================================
// Notion Additional Options
// ============================================================================

export interface NotionGetPageOptions {
  pageId: string;
}

export interface NotionArchivePageOptions {
  pageId: string;
}

// ============================================================================
// Outlook Options
// ============================================================================

export interface OutlookSendEmailOptions {
  to: string;
  subject: string;
  body: string;
  /** Content type: 'text' or 'html' */
  bodyType?: "text" | "html";
  cc?: string;
  bcc?: string;
  replyTo?: string;
  /** Save to sent folder */
  saveToSentItems?: boolean;
}

export interface OutlookSearchEmailsOptions {
  /** OData filter expression, e.g., "contains(subject, 'invoice')" */
  filter?: string;
  /** Folder to search in */
  folderId?: string;
  limit?: number;
}

export interface OutlookGetFoldersOptions {
  limit?: number;
}

// ============================================================================
// SharePoint Options
// ============================================================================

export interface SharePointSiteRef {
  /** Site ID or name */
  id: string;
  name?: string;
}

export interface SharePointListFilesOptions {
  site: SharePointSiteRef;
  /** Folder path or ID */
  folderId?: string;
  limit?: number;
}

export interface SharePointDownloadFileOptions {
  site: SharePointSiteRef;
  fileId: string;
}

export interface SharePointUploadFileOptions {
  site: SharePointSiteRef;
  /** Parent folder ID */
  folderId: string;
  fileName: string;
  /** Binary data field name from previous node */
  binaryPropertyName?: string;
}

export interface SharePointCreateFolderOptions {
  site: SharePointSiteRef;
  /** Parent folder ID */
  parentFolderId: string;
  folderName: string;
}

// ============================================================================
// Spreadsheet File Options
// ============================================================================

export interface SpreadsheetFileOptions {
  /** Operation: read from binary or convert to binary */
  operation?: "fromFile" | "toFile";
  /** File format */
  fileFormat?: "csv" | "xlsx" | "xls" | "ods";
  /** Sheet name to read (for multi-sheet files) */
  sheetName?: string;
  /** Binary property name containing the file */
  binaryPropertyName?: string;
  /** Include empty cells */
  includeEmptyCells?: boolean;
  /** Header row number (1-indexed), or 0 for no header */
  headerRow?: number;
  /** Starting row for data (after header) */
  startingRow?: number;
  /** Range to read (e.g., "A1:D10") */
  range?: string;
}

// ============================================================================
// Convert to File Options
// ============================================================================

export interface ConvertToFileOptions {
  /** Output file format */
  fileFormat?: "csv" | "xlsx" | "html" | "ods" | "rtf";
  /** Binary property name to store the file */
  binaryPropertyName?: string;
  /** File name for the output */
  fileName?: string;
  /** Sheet name for spreadsheet formats */
  sheetName?: string;
}

// ============================================================================
// PDF Options
// ============================================================================

export interface PdfExtractOptions {
  /** Binary property name containing the PDF */
  binaryPropertyName?: string;
  /** Maximum number of pages to extract (default: all) */
  maxPages?: number;
  /** Join pages with this separator */
  pageSeparator?: string;
}
