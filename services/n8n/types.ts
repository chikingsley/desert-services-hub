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

export type N8nCredentialRef = {
  id: string;
  name: string;
};

export type N8nNode = {
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
};

export type N8nConnection = {
  node: string;
  type: string;
  index: number;
};

export type N8nConnections = Record<
  string,
  {
    main: N8nConnection[][];
  }
>;

export type N8nWorkflowJson = {
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
};

// ============================================================================
// Builder Options
// ============================================================================

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ScheduleTriggerOptions = {
  /** Interval in hours */
  hours?: number;
  /** Interval in minutes */
  minutes?: number;
  /** Cron expression */
  cron?: string;
};

export type WebhookOptions = {
  method?: HttpMethod;
  path: string;
  /** How to respond: 'immediately' (default) or 'lastNode' (wait for workflow to complete) */
  responseMode?: "onReceived" | "lastNode" | "responseNode";
};

export type HttpRequestOptions = {
  method?: HttpMethod;
  url: string;
  credential?: CredentialKey;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  bodyType?: "json" | "form-urlencoded" | "raw";
};

export type CodeOptions = {
  code: string;
  mode?: "runOnceForAllItems" | "runOnceForEachItem";
};

export type IfCondition = {
  leftValue: string;
  rightValue?: string | number | boolean;
  operator: {
    type: "string" | "number" | "boolean";
    operation: string;
    singleValue?: boolean;
  };
};

export type IfOptions = {
  conditions: IfCondition[];
  combinator?: "and" | "or";
  /** Automatically convert types when comparing (recommended) */
  looseTypeValidation?: boolean;
};

export type FilterOptions = IfOptions;

export type SplitOutOptions = {
  field: string;
  includeFields?: string[];
};

export type LoopOptions = {
  batchSize?: number;
};

// ============================================================================
// Native Node Options
// ============================================================================

export type MondayGetItemsOptions = {
  boardId: string;
  groupId?: string;
  limit?: number;
};

export type MondayUpdateItemOptions = {
  boardId: string;
  itemId: string;
  columnId: string;
  value: string;
};

export type MondayCreateItemOptions = {
  boardId: string;
  groupId: string;
  name: string;
  /** Column values as JSON string */
  columnValues?: string;
};

export type MondayGetItemOptions = {
  itemId: string;
};

export type MondayGetBoardsOptions = {
  limit?: number;
};

export type MondayGetGroupsOptions = {
  boardId: string;
};

export type MondayDeleteItemOptions = {
  itemId: string;
};

export type MondayGetColumnsOptions = {
  boardId: string;
};

export type MondayAddUpdateOptions = {
  itemId: string;
  body: string;
};

export type NotionDatabaseRef = {
  id: string;
  name?: string;
  url?: string;
};

export type NotionFilterCondition = {
  key: string;
  condition:
    | "is_empty"
    | "is_not_empty"
    | "equals"
    | "does_not_equal"
    | "contains"
    | "does_not_contain";
  value?: string;
};

export type NotionGetAllOptions = {
  database: NotionDatabaseRef;
  limit?: number;
  returnAll?: boolean;
  filters?: NotionFilterCondition[];
  sortBy?: { key: string; direction: "ascending" | "descending" };
};

export type NotionCreatePageOptions = {
  database: NotionDatabaseRef;
  title: string;
  properties?: Record<string, unknown>;
};

export type NotionUpdatePageOptions = {
  pageId: string;
  properties: Array<{
    key: string;
    value: unknown;
    type?: "relation" | "text" | "number" | "select" | "url";
  }>;
};

export type DataTableRef = {
  id: string;
  name?: string;
};

export type DataTableUpsertOptions = {
  table: DataTableRef;
  matchColumn: string;
  matchValue: string;
  columns: Record<string, string>;
};

export type DataTableGetOptions = {
  table: DataTableRef;
  matchColumn: string;
  matchValue: string;
  limit?: number;
};

export type MaricopaAssessorOptions = {
  /** Search query (address, APN, etc.) */
  query?: string;
  /** Assessor Parcel Number for direct lookup */
  apn?: string;
  /** API token header value */
  token?: string;
};

// ============================================================================
// Notion Additional Options
// ============================================================================

export type NotionGetPageOptions = {
  pageId: string;
};

export type NotionArchivePageOptions = {
  pageId: string;
};

// ============================================================================
// Outlook Options
// ============================================================================

export type OutlookSendEmailOptions = {
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
};

export type OutlookSearchEmailsOptions = {
  /** OData filter expression, e.g., "contains(subject, 'invoice')" */
  filter?: string;
  /** Folder to search in */
  folderId?: string;
  limit?: number;
};

export type OutlookGetFoldersOptions = {
  limit?: number;
};

// ============================================================================
// SharePoint Options
// ============================================================================

export type SharePointSiteRef = {
  /** Site ID or name */
  id: string;
  name?: string;
};

export type SharePointListFilesOptions = {
  site: SharePointSiteRef;
  /** Folder path or ID */
  folderId?: string;
  limit?: number;
};

export type SharePointDownloadFileOptions = {
  site: SharePointSiteRef;
  fileId: string;
};

export type SharePointUploadFileOptions = {
  site: SharePointSiteRef;
  /** Parent folder ID */
  folderId: string;
  fileName: string;
  /** Binary data field name from previous node */
  binaryPropertyName?: string;
};

export type SharePointCreateFolderOptions = {
  site: SharePointSiteRef;
  /** Parent folder ID */
  parentFolderId: string;
  folderName: string;
};

// ============================================================================
// Spreadsheet File Options
// ============================================================================

export type SpreadsheetFileOptions = {
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
};

// ============================================================================
// Convert to File Options
// ============================================================================

export type ConvertToFileOptions = {
  /** Output file format */
  fileFormat?: "csv" | "xlsx" | "html" | "ods" | "rtf";
  /** Binary property name to store the file */
  binaryPropertyName?: string;
  /** File name for the output */
  fileName?: string;
  /** Sheet name for spreadsheet formats */
  sheetName?: string;
};

// ============================================================================
// PDF Options
// ============================================================================

export type PdfExtractOptions = {
  /** Binary property name containing the PDF */
  binaryPropertyName?: string;
  /** Maximum number of pages to extract (default: all) */
  maxPages?: number;
  /** Join pages with this separator */
  pageSeparator?: string;
};
