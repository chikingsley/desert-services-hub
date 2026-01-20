/**
 * n8n Workflow Builder & API Client
 *
 * Programmatically create n8n workflow JSON files and manage workflows via API.
 *
 * @example
 * // Build and push a workflow
 * const workflow = N8nWorkflow.create('My Workflow')
 *   .scheduleTrigger({ hours: 1 })
 *   .httpRequest('Get Data', { url: 'https://api.example.com', credential: 'monday' })
 *   .code('Process', { code: 'return $input.all()' })
 *   .chain('Schedule Trigger', 'Get Data', 'Process');
 *
 * const api = new N8nApi();
 * const created = await api.createWorkflow(workflow);
 * console.log('Created:', created.id);
 */

import type {
  CodeOptions,
  ConvertToFileOptions,
  CredentialKey,
  DataTableGetOptions,
  DataTableUpsertOptions,
  FilterOptions,
  HttpRequestOptions,
  IfOptions,
  LoopOptions,
  MaricopaAssessorOptions,
  MondayAddUpdateOptions,
  MondayCreateItemOptions,
  MondayDeleteItemOptions,
  MondayGetBoardsOptions,
  MondayGetColumnsOptions,
  MondayGetGroupsOptions,
  MondayGetItemOptions,
  MondayGetItemsOptions,
  MondayUpdateItemOptions,
  N8nConnections,
  N8nNode,
  N8nPosition,
  N8nWorkflowJson,
  NotionArchivePageOptions,
  NotionCreatePageOptions,
  NotionGetAllOptions,
  NotionGetPageOptions,
  NotionUpdatePageOptions,
  OutlookGetFoldersOptions,
  OutlookSearchEmailsOptions,
  OutlookSendEmailOptions,
  PdfExtractOptions,
  ScheduleTriggerOptions,
  SharePointCreateFolderOptions,
  SharePointDownloadFileOptions,
  SharePointListFilesOptions,
  SharePointUploadFileOptions,
  SplitOutOptions,
  SpreadsheetFileOptions,
  WebhookOptions,
} from "./types";
import { CREDENTIALS } from "./types";

// Instance ID from your n8n instance
const INSTANCE_ID =
  "e3e3d34b1a5faf682aac16d5ca43946ee224d1cc748dee50098bb11420181ecc";

// Node spacing for auto-positioning
const NODE_SPACING_X = 224;
const NODE_START_X = 0;
const NODE_START_Y = 0;

/**
 * Generate a UUID v4
 */
function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Get credential info by key
 */
function getCredentialInfo(key: CredentialKey): {
  ref: { id: string; name: string };
  type: string;
} {
  const cred = CREDENTIALS[key];
  return {
    ref: { id: cred.id, name: cred.name },
    type: cred.type,
  };
}

export class N8nWorkflow {
  private readonly name: string;
  private readonly nodes: N8nNode[] = [];
  private readonly connections: N8nConnections = {};
  private nodeIndex = 0;

  private constructor(name: string) {
    this.name = name;
  }

  /**
   * Create a new workflow builder
   */
  static create(name: string): N8nWorkflow {
    return new N8nWorkflow(name);
  }

  /**
   * Get the next auto-position for a node
   */
  private nextPosition(): N8nPosition {
    const x = NODE_START_X + this.nodeIndex * NODE_SPACING_X;
    this.nodeIndex += 1;
    return [x, NODE_START_Y];
  }

  /**
   * Add a raw node (for advanced use cases)
   */
  addNode(
    node: Omit<N8nNode, "id" | "position"> & { position?: N8nPosition }
  ): this {
    this.nodes.push({
      ...node,
      id: uuid(),
      position: node.position ?? this.nextPosition(),
    });
    return this;
  }

  // ============================================================================
  // Trigger Nodes
  // ============================================================================

  /**
   * Add a schedule trigger (cron/interval)
   */
  scheduleTrigger(options: ScheduleTriggerOptions = {}): this {
    const interval: Record<string, unknown>[] = [];

    if (options.hours) {
      interval.push({ field: "hours", hoursInterval: options.hours });
    } else if (options.minutes) {
      interval.push({ field: "minutes", minutesInterval: options.minutes });
    } else if (options.cron) {
      interval.push({ field: "cronExpression", expression: options.cron });
    } else {
      // Default: every hour
      interval.push({ field: "hours", hoursInterval: 1 });
    }

    return this.addNode({
      parameters: { rule: { interval } },
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
    });
  }

  /**
   * Add a manual trigger (for testing)
   */
  manualTrigger(name = "Manual Trigger"): this {
    return this.addNode({
      parameters: {},
      name,
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
    });
  }

  /**
   * Add a webhook trigger
   * @param options.responseMode - 'onReceived' (immediate), 'lastNode' (wait for result), 'responseNode' (custom response node)
   */
  webhook(name: string, options: WebhookOptions): this {
    return this.addNode({
      parameters: {
        httpMethod: options.method ?? "POST",
        path: options.path,
        responseMode: options.responseMode ?? "onReceived",
        options: {},
      },
      name,
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      webhookId: uuid(),
    });
  }

  // ============================================================================
  // HTTP Nodes
  // ============================================================================

  /**
   * Add an HTTP request node
   */
  httpRequest(name: string, options: HttpRequestOptions): this {
    const parameters: Record<string, unknown> = {
      method: options.method ?? "GET",
      url: options.url,
      options: {},
    };

    // Headers
    if (options.headers) {
      parameters.sendHeaders = true;
      parameters.headerParameters = {
        parameters: Object.entries(options.headers).map(([k, v]) => ({
          name: k,
          value: v,
        })),
      };
    }

    // Body
    if (options.body) {
      parameters.sendBody = true;
      if (options.bodyType === "form-urlencoded") {
        parameters.contentType = "form-urlencoded";
        parameters.bodyParameters = {
          parameters: Object.entries(
            options.body as Record<string, unknown>
          ).map(([k, v]) => ({ name: k, value: v })),
        };
      } else {
        parameters.specifyBody = "json";
        parameters.jsonBody =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      }
    }

    // Credentials
    const node: Omit<N8nNode, "id" | "position"> = {
      parameters,
      name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
    };

    if (options.credential) {
      const { ref, type } = getCredentialInfo(options.credential);
      node.credentials = { [type]: ref };
      parameters.authentication = "predefinedCredentialType";
      parameters.nodeCredentialType = type;
    }

    return this.addNode(node);
  }

  // ============================================================================
  // Code Nodes
  // ============================================================================

  /**
   * Add a JavaScript code node
   */
  code(name: string, options: CodeOptions | string): this {
    const opts = typeof options === "string" ? { code: options } : options;

    return this.addNode({
      parameters: {
        mode: opts.mode ?? "runOnceForAllItems",
        jsCode: opts.code,
      },
      name,
      type: "n8n-nodes-base.code",
      typeVersion: 2,
    });
  }

  // ============================================================================
  // Logic Nodes
  // ============================================================================

  /**
   * Add an If node (conditional branching)
   */
  ifNode(name: string, options: IfOptions): this {
    return this.addNode({
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: options.looseTypeValidation ? "loose" : "strict",
            version: 2,
          },
          conditions: options.conditions.map((c) => ({
            id: uuid(),
            leftValue: c.leftValue,
            rightValue: c.rightValue ?? "",
            operator: c.operator,
          })),
          combinator: options.combinator ?? "and",
        },
        options: {},
      },
      name,
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
    });
  }

  /**
   * Add a Filter node
   */
  filter(name: string, options: FilterOptions): this {
    return this.addNode({
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: options.looseTypeValidation ? "loose" : "strict",
            version: 2,
          },
          conditions: options.conditions.map((c) => ({
            id: uuid(),
            leftValue: c.leftValue,
            rightValue: c.rightValue ?? "",
            operator: c.operator,
          })),
          combinator: options.combinator ?? "and",
        },
        options: {},
      },
      name,
      type: "n8n-nodes-base.filter",
      typeVersion: 2.2,
    });
  }

  /**
   * Add a Split Out node (extract array field)
   */
  splitOut(name: string, options: SplitOutOptions): this {
    const params: Record<string, unknown> = {
      fieldToSplitOut: options.field,
      options: {},
    };

    if (options.includeFields) {
      params.include = "selectedOtherFields";
      params.fieldsToInclude = options.includeFields.join(",");
    }

    return this.addNode({
      parameters: params,
      name,
      type: "n8n-nodes-base.splitOut",
      typeVersion: 1,
    });
  }

  /**
   * Add a Loop Over Items node (batch processing)
   */
  loop(name: string, options: LoopOptions = {}): this {
    return this.addNode({
      parameters: {
        batchSize: options.batchSize ?? 1,
        options: {},
      },
      name,
      type: "n8n-nodes-base.splitInBatches",
      typeVersion: 3,
    });
  }

  /**
   * Add a Limit node
   */
  limit(name: string, count = 1): this {
    return this.addNode({
      parameters: { maxItems: count },
      name,
      type: "n8n-nodes-base.limit",
      typeVersion: 1,
    });
  }

  // ============================================================================
  // Monday.com Native Nodes
  // ============================================================================

  /**
   * Add a Monday.com node with standard credentials
   */
  private addMondayNode(
    name: string,
    parameters: Record<string, unknown>
  ): this {
    const { ref, type } = getCredentialInfo("monday");
    return this.addNode({
      parameters,
      name,
      type: "n8n-nodes-base.mondayCom",
      typeVersion: 1,
      credentials: { [type]: ref },
    });
  }

  /**
   * Get items from a Monday.com board
   */
  mondayGetItems(name: string, options: MondayGetItemsOptions): this {
    const params: Record<string, unknown> = {
      resource: "boardItem",
      operation: "getAll",
      boardId: options.boardId,
      limit: options.limit ?? 50,
    };

    if (options.groupId) {
      params.groupId = options.groupId;
    }

    return this.addMondayNode(name, params);
  }

  /**
   * Update a Monday.com item column
   */
  mondayUpdateColumn(name: string, options: MondayUpdateItemOptions): this {
    return this.addMondayNode(name, {
      resource: "boardItem",
      operation: "changeColumnValue",
      boardId: options.boardId,
      itemId: options.itemId,
      columnId: options.columnId,
      value: options.value,
    });
  }

  /**
   * Create a new item in a Monday.com board
   */
  mondayCreateItem(name: string, options: MondayCreateItemOptions): this {
    const additionalFields = options.columnValues
      ? { columnValues: options.columnValues }
      : {};

    return this.addMondayNode(name, {
      resource: "boardItem",
      operation: "create",
      boardId: options.boardId,
      groupId: options.groupId,
      name: options.name,
      additionalFields,
    });
  }

  /**
   * Get a single Monday.com item by ID
   */
  mondayGetItem(name: string, options: MondayGetItemOptions): this {
    return this.addMondayNode(name, {
      resource: "boardItem",
      operation: "get",
      itemId: options.itemId,
    });
  }

  /**
   * Delete a Monday.com item
   */
  mondayDeleteItem(name: string, options: MondayDeleteItemOptions): this {
    return this.addMondayNode(name, {
      resource: "boardItem",
      operation: "delete",
      itemId: options.itemId,
    });
  }

  /**
   * Get all boards from Monday.com
   */
  mondayGetBoards(name: string, options: MondayGetBoardsOptions = {}): this {
    return this.addMondayNode(name, {
      resource: "board",
      operation: "getAll",
      limit: options.limit ?? 50,
    });
  }

  /**
   * Get groups from a Monday.com board
   */
  mondayGetGroups(name: string, options: MondayGetGroupsOptions): this {
    return this.addMondayNode(name, {
      resource: "boardGroup",
      operation: "getAll",
      boardId: options.boardId,
    });
  }

  /**
   * Get columns/schema from a Monday.com board
   */
  mondayGetColumns(name: string, options: MondayGetColumnsOptions): this {
    return this.addMondayNode(name, {
      resource: "boardColumn",
      operation: "getAll",
      boardId: options.boardId,
    });
  }

  /**
   * Add an update/comment to a Monday.com item
   */
  mondayAddUpdate(name: string, options: MondayAddUpdateOptions): this {
    return this.addMondayNode(name, {
      resource: "boardItemUpdate",
      operation: "create",
      itemId: options.itemId,
      body: options.body,
    });
  }

  // ============================================================================
  // Notion Native Nodes
  // ============================================================================

  /**
   * Add a Notion node with standard credentials
   */
  private addNotionNode(
    name: string,
    parameters: Record<string, unknown>
  ): this {
    const { ref, type } = getCredentialInfo("notion");
    return this.addNode({
      parameters,
      name,
      type: "n8n-nodes-base.notion",
      typeVersion: 2.2,
      credentials: { [type]: ref },
    });
  }

  /**
   * Create a Notion database reference object
   */
  private notionDbRef(database: { id: string; name?: string; url?: string }): {
    __rl: true;
    value: string;
    mode: "list";
    cachedResultName: string;
    cachedResultUrl?: string;
  } {
    return {
      __rl: true,
      value: database.id,
      mode: "list",
      cachedResultName: database.name ?? "Database",
      cachedResultUrl:
        database.url ??
        `https://www.notion.so/${database.id.replace(/-/g, "")}`,
    };
  }

  /**
   * Create a Notion page ID reference object
   */
  private notionPageRef(pageId: string): {
    __rl: true;
    value: string;
    mode: "id";
  } {
    return { __rl: true, value: pageId, mode: "id" };
  }

  /**
   * Get all pages from a Notion database
   */
  notionGetAll(name: string, options: NotionGetAllOptions): this {
    const params: Record<string, unknown> = {
      resource: "databasePage",
      operation: "getAll",
      databaseId: this.notionDbRef(options.database),
      options: {},
    };

    if (options.returnAll) {
      params.returnAll = true;
    } else {
      params.limit = options.limit ?? 50;
    }

    if (options.filters && options.filters.length > 0) {
      params.filterType = "manual";
      params.filters = {
        conditions: options.filters.map((f) => ({
          key: f.key,
          condition: f.condition,
          ...(f.value ? { value: f.value } : {}),
        })),
      };
    }

    if (options.sortBy) {
      params.options = {
        sort: {
          sortValue: [
            {
              key: options.sortBy.key,
              direction: options.sortBy.direction,
            },
          ],
        },
      };
    }

    return this.addNotionNode(name, params);
  }

  /**
   * Create a page in a Notion database
   */
  notionCreatePage(name: string, options: NotionCreatePageOptions): this {
    return this.addNotionNode(name, {
      resource: "databasePage",
      databaseId: this.notionDbRef(options.database),
      title: options.title,
      options: options.properties ?? {},
    });
  }

  /**
   * Update a Notion page
   */
  notionUpdatePage(name: string, options: NotionUpdatePageOptions): this {
    return this.addNotionNode(name, {
      resource: "databasePage",
      operation: "update",
      pageId: this.notionPageRef(options.pageId),
      propertiesUi: {
        propertyValues: options.properties.map((p) => {
          if (p.type === "relation") {
            return { key: p.key, relationValue: p.value };
          }
          return { key: p.key, value: p.value };
        }),
      },
      options: {},
    });
  }

  /**
   * Get a single Notion database page by ID
   */
  notionGetPage(name: string, options: NotionGetPageOptions): this {
    return this.addNotionNode(name, {
      resource: "databasePage",
      operation: "get",
      pageId: this.notionPageRef(options.pageId),
    });
  }

  /**
   * Archive (soft-delete) a Notion page
   */
  notionArchivePage(name: string, options: NotionArchivePageOptions): this {
    return this.addNotionNode(name, {
      resource: "page",
      operation: "archive",
      pageId: this.notionPageRef(options.pageId),
    });
  }

  // ============================================================================
  // Outlook Native Nodes
  // ============================================================================

  /**
   * Add an Outlook node with standard credentials
   */
  private addOutlookNode(
    name: string,
    parameters: Record<string, unknown>
  ): this {
    const { ref, type } = getCredentialInfo("outlook");
    return this.addNode({
      parameters,
      name,
      type: "n8n-nodes-base.microsoftOutlook",
      typeVersion: 2,
      credentials: { [type]: ref },
    });
  }

  /**
   * Get messages from Outlook
   */
  outlookGetMessages(
    name: string,
    options: { limit?: number; fields?: string[] } = {}
  ): this {
    return this.addOutlookNode(name, {
      operation: "getAll",
      limit: options.limit ?? 50,
      output: options.fields ? "fields" : "simple",
      ...(options.fields ? { fields: options.fields } : {}),
      options: {},
    });
  }

  /**
   * Send an email via Outlook
   */
  outlookSendEmail(name: string, options: OutlookSendEmailOptions): this {
    const params: Record<string, unknown> = {
      operation: "send",
      toRecipients: options.to,
      subject: options.subject,
      bodyContent: options.body,
      options: {},
    };

    if (options.bodyType === "html") {
      params.bodyContentType = "html";
    }

    if (options.cc) {
      params.ccRecipients = options.cc;
    }

    if (options.bcc) {
      params.bccRecipients = options.bcc;
    }

    if (options.replyTo) {
      params.replyTo = options.replyTo;
    }

    if (options.saveToSentItems === false) {
      params.saveToSentItems = false;
    }

    return this.addOutlookNode(name, params);
  }

  /**
   * Search emails in Outlook with OData filter
   */
  outlookSearchEmails(name: string, options: OutlookSearchEmailsOptions): this {
    const params: Record<string, unknown> = {
      operation: "getAll",
      returnAll: false,
      limit: options.limit ?? 50,
      options: {},
    };

    if (options.filter) {
      params.filters = { filter: options.filter };
    }

    if (options.folderId) {
      params.folderId = {
        __rl: true,
        value: options.folderId,
        mode: "id",
      };
    }

    return this.addOutlookNode(name, params);
  }

  /**
   * Get mail folders from Outlook
   */
  outlookGetFolders(
    name: string,
    options: OutlookGetFoldersOptions = {}
  ): this {
    return this.addOutlookNode(name, {
      resource: "folder",
      operation: "getAll",
      returnAll: false,
      limit: options.limit ?? 50,
    });
  }

  // ============================================================================
  // SharePoint Native Nodes
  // ============================================================================

  /**
   * Add a SharePoint node with standard credentials
   */
  private addSharePointNode(
    name: string,
    parameters: Record<string, unknown>
  ): this {
    const { ref, type } = getCredentialInfo("sharepoint");
    return this.addNode({
      parameters,
      name,
      type: "n8n-nodes-base.microsoftSharePoint",
      typeVersion: 1,
      credentials: { [type]: ref },
    });
  }

  /**
   * Create a SharePoint site reference object
   */
  private sharePointSiteRef(site: { id: string; name?: string }): {
    __rl: true;
    value: string;
    mode: "id";
    cachedResultName: string;
  } {
    return {
      __rl: true,
      value: site.id,
      mode: "id",
      cachedResultName: site.name ?? "Site",
    };
  }

  /**
   * Create a SharePoint ID reference object
   */
  private sharePointIdRef(id: string): {
    __rl: true;
    value: string;
    mode: "id";
  } {
    return { __rl: true, value: id, mode: "id" };
  }

  /**
   * List files in a SharePoint folder
   */
  sharePointListFiles(name: string, options: SharePointListFilesOptions): this {
    return this.addSharePointNode(name, {
      resource: "file",
      operation: "getAll",
      siteId: this.sharePointSiteRef(options.site),
      folderId: this.sharePointIdRef(options.folderId ?? "root"),
      returnAll: false,
      limit: options.limit ?? 50,
    });
  }

  /**
   * Create a folder in SharePoint
   */
  sharePointCreateFolder(
    name: string,
    options: SharePointCreateFolderOptions
  ): this {
    return this.addSharePointNode(name, {
      resource: "folder",
      operation: "create",
      siteId: this.sharePointSiteRef(options.site),
      parentFolderId: this.sharePointIdRef(options.parentFolderId),
      name: options.folderName,
    });
  }

  /**
   * Upload a file to SharePoint
   */
  sharePointUploadFile(
    name: string,
    options: SharePointUploadFileOptions
  ): this {
    return this.addSharePointNode(name, {
      resource: "file",
      operation: "upload",
      siteId: this.sharePointSiteRef(options.site),
      folderId: this.sharePointIdRef(options.folderId),
      fileName: options.fileName,
      binaryPropertyName: options.binaryPropertyName ?? "data",
    });
  }

  /**
   * Download a file from SharePoint
   *
   * Returns binary data that can be passed to extractFromFile for parsing
   */
  sharePointDownloadFile(
    name: string,
    options: SharePointDownloadFileOptions
  ): this {
    return this.addSharePointNode(name, {
      resource: "file",
      operation: "download",
      siteId: this.sharePointSiteRef(options.site),
      fileId: this.sharePointIdRef(options.fileId),
    });
  }

  /**
   * Extract data from a file (Excel, CSV, etc.)
   *
   * Use after sharePointDownloadFile to parse spreadsheets into JSON rows.
   * Replaces the old "Spreadsheet File" node in n8n 1.21.0+
   */
  extractFromFile(name: string, options: SpreadsheetFileOptions = {}): this {
    const params: Record<string, unknown> = {
      operation: "fromFile",
      binaryPropertyName: options.binaryPropertyName ?? "data",
    };

    // File format options
    const formatOptions: Record<string, unknown> = {};
    if (options.sheetName) {
      formatOptions.sheetName = options.sheetName;
    }
    if (options.headerRow !== undefined) {
      formatOptions.headerRow = options.headerRow;
    }
    if (options.range) {
      formatOptions.range = options.range;
    }
    if (options.includeEmptyCells !== undefined) {
      formatOptions.includeEmptyCells = options.includeEmptyCells;
    }

    if (Object.keys(formatOptions).length > 0) {
      params.options = formatOptions;
    }

    return this.addNode({
      parameters: params,
      name,
      type: "n8n-nodes-base.extractFromFile",
      typeVersion: 1,
    });
  }

  /**
   * Convert JSON data to a file (Excel, CSV, etc.)
   *
   * Use to create spreadsheet files from data that can be uploaded to SharePoint.
   */
  convertToFile(name: string, options: ConvertToFileOptions = {}): this {
    const fileOptions: Record<string, unknown> = {};
    if (options.fileName) {
      fileOptions.fileName = options.fileName;
    }
    if (options.sheetName) {
      fileOptions.sheetName = options.sheetName;
    }

    return this.addNode({
      parameters: {
        operation: "toFile",
        fileFormat: options.fileFormat ?? "xlsx",
        binaryPropertyName: options.binaryPropertyName ?? "data",
        options: fileOptions,
      },
      name,
      type: "n8n-nodes-base.convertToFile",
      typeVersion: 1.1,
    });
  }

  /**
   * Extract text from a PDF file
   *
   * Use after downloading a PDF from SharePoint to extract its text content.
   */
  pdfExtract(name: string, options: PdfExtractOptions = {}): this {
    const pdfOptions: Record<string, unknown> = {};
    if (options.maxPages !== undefined) {
      pdfOptions.maxPages = options.maxPages;
    }
    if (options.pageSeparator !== undefined) {
      pdfOptions.joinPages = options.pageSeparator;
    }

    return this.addNode({
      parameters: {
        operation: "pdf",
        binaryPropertyName: options.binaryPropertyName ?? "data",
        options: pdfOptions,
      },
      name,
      type: "n8n-nodes-base.extractFromFile",
      typeVersion: 1,
    });
  }

  // ============================================================================
  // DataTable Nodes
  // ============================================================================

  /**
   * Upsert rows in a DataTable
   */
  dataTableUpsert(name: string, options: DataTableUpsertOptions): this {
    const schema = Object.keys(options.columns).map((key) => ({
      id: key,
      displayName: key,
      required: false,
      defaultMatch: false,
      display: true,
      type: "string",
      readOnly: false,
      removed: false,
    }));

    return this.addNode({
      parameters: {
        operation: "upsert",
        dataTableId: {
          __rl: true,
          value: options.table.id,
          mode: "list",
          cachedResultName: options.table.name ?? "Table",
        },
        filters: {
          conditions: [
            {
              keyName: options.matchColumn,
              keyValue: options.matchValue,
            },
          ],
        },
        columns: {
          mappingMode: "defineBelow",
          value: options.columns,
          matchingColumns: [],
          schema,
          attemptToConvertTypes: false,
          convertFieldsToString: false,
        },
        options: {},
      },
      name,
      type: "n8n-nodes-base.dataTable",
      typeVersion: 1,
    });
  }

  /**
   * Get rows from a DataTable
   */
  dataTableGet(name: string, options: DataTableGetOptions): this {
    return this.addNode({
      parameters: {
        operation: "get",
        dataTableId: {
          __rl: true,
          value: options.table.id,
          mode: "list",
          cachedResultName: options.table.name ?? "Table",
        },
        filters: {
          conditions: [
            {
              keyName: options.matchColumn,
              keyValue: options.matchValue,
            },
          ],
        },
        limit: options.limit ?? 1,
      },
      name,
      type: "n8n-nodes-base.dataTable",
      typeVersion: 1,
      alwaysOutputData: true,
    });
  }

  // ============================================================================
  // Maricopa County Assessor API
  // ============================================================================

  /**
   * Search Maricopa County Assessor property data
   */
  maricopaSearch(name: string, options: MaricopaAssessorOptions): this {
    const params: Record<string, unknown> = {
      url: "https://mcassessor.maricopa.gov/search/property/",
      sendQuery: true,
      queryParameters: {
        parameters: [{ name: "q", value: options.query ?? "" }],
      },
      options: {},
    };

    if (options.token) {
      params.sendHeaders = true;
      params.headerParameters = {
        parameters: [{ name: "AUTHORIZATION", value: options.token }],
      };
    }

    return this.addNode({
      parameters: params,
      name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
    });
  }

  /**
   * Get parcel details from Maricopa County Assessor
   */
  maricopaParcel(name: string, options: MaricopaAssessorOptions): this {
    const params: Record<string, unknown> = {
      url: `https://mcassessor.maricopa.gov/parcel/${options.apn ?? ""}`,
      options: {},
    };

    if (options.token) {
      params.sendHeaders = true;
      params.headerParameters = {
        parameters: [{ name: "AUTHORIZATION", value: options.token }],
      };
    }

    return this.addNode({
      parameters: params,
      name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
    });
  }

  // ============================================================================
  // Connections
  // ============================================================================

  /**
   * Connect two nodes (single connection)
   */
  connect(from: string, to: string, outputIndex = 0): this {
    if (!this.connections[from]) {
      this.connections[from] = { main: [] };
    }

    const conn = this.connections[from];

    // Ensure we have enough output arrays
    while (conn.main.length <= outputIndex) {
      conn.main.push([]);
    }

    conn.main[outputIndex]?.push({
      node: to,
      type: "main",
      index: 0,
    });

    return this;
  }

  /**
   * Chain multiple nodes together in sequence
   */
  chain(...nodeNames: string[]): this {
    for (let i = 0; i < nodeNames.length - 1; i++) {
      const from = nodeNames[i];
      const to = nodeNames[i + 1];
      if (from && to) {
        this.connect(from, to);
      }
    }
    return this;
  }

  /**
   * Connect from an If node's branches
   * @param ifNodeName - Name of the If node
   * @param trueBranch - Node to connect for true condition
   * @param falseBranch - Node to connect for false condition
   */
  ifBranches(
    ifNodeName: string,
    trueBranch: string,
    falseBranch?: string
  ): this {
    this.connect(ifNodeName, trueBranch, 0);
    if (falseBranch) {
      this.connect(ifNodeName, falseBranch, 1);
    }
    return this;
  }

  // ============================================================================
  // Build
  // ============================================================================

  /**
   * Build the workflow JSON (full format for file export)
   */
  build(): N8nWorkflowJson {
    return {
      name: this.name,
      nodes: this.nodes,
      connections: this.connections,
      active: false,
      settings: {
        executionOrder: "v1",
      },
      pinData: {},
      versionId: uuid(),
      meta: {
        templateCredsSetupCompleted: true,
        instanceId: INSTANCE_ID,
      },
      id: uuid().replace(/-/g, "").slice(0, 16),
      tags: [],
    };
  }

  /**
   * Build workflow for API submission (minimal fields)
   */
  buildForApi(): Pick<
    N8nWorkflowJson,
    "name" | "nodes" | "connections" | "settings"
  > {
    return {
      name: this.name,
      nodes: this.nodes,
      connections: this.connections,
      settings: {
        executionOrder: "v1",
      },
    };
  }

  /**
   * Build and return as JSON string
   */
  toJSON(pretty = true): string {
    return JSON.stringify(this.build(), null, pretty ? 2 : 0);
  }

  /**
   * Build and write to file
   */
  async writeToFile(path: string): Promise<void> {
    await Bun.write(path, this.toJSON());
  }

  /**
   * Push workflow directly to n8n API
   */
  async push(api?: N8nApi): Promise<N8nApiWorkflow> {
    const client = api ?? new N8nApi();
    return await client.createWorkflow(this);
  }
}

// ============================================================================
// API Client
// ============================================================================

export interface N8nApiWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings: { executionOrder: string };
}

export interface N8nNodeOutput {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

export interface N8nExecutionData {
  resultData: {
    runData: Record<
      string,
      Array<{
        data: { main: N8nNodeOutput[][] };
        startTime: number;
        executionTime: number;
      }>
    >;
  };
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  status: "success" | "error" | "waiting" | "running";
  startedAt: string;
  stoppedAt: string;
  mode: "manual" | "trigger" | "webhook";
  data?: N8nExecutionData;
}

export interface N8nExecutionListOptions {
  workflowId?: string;
  status?: "success" | "error" | "waiting";
  limit?: number;
  includeData?: boolean;
}

export interface N8nApiOptions {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * n8n REST API Client
 *
 * @example
 * const api = new N8nApi();
 * const workflows = await api.listWorkflows();
 * const workflow = await api.getWorkflow('abc123');
 * await api.deleteWorkflow('abc123');
 */
export class N8nApi {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: N8nApiOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.N8N_BASE_URL ?? "";
    this.apiKey = options.apiKey ?? process.env.N8N_API_KEY ?? "";

    if (!this.baseUrl) {
      throw new Error("N8N_BASE_URL not set");
    }
    if (!this.apiKey) {
      throw new Error("N8N_API_KEY not set");
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "X-N8N-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = (await res
        .json()
        .catch(() => ({ message: res.statusText }))) as { message?: string };
      throw new Error(`n8n API error: ${error.message ?? res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<N8nApiWorkflow[]> {
    const data = await this.request<{ data: N8nApiWorkflow[] }>(
      "GET",
      "/workflows"
    );
    return data.data;
  }

  /**
   * Get a workflow by ID
   */
  async getWorkflow(id: string): Promise<N8nApiWorkflow> {
    return await this.request<N8nApiWorkflow>("GET", `/workflows/${id}`);
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(
    workflow: N8nWorkflow | ReturnType<N8nWorkflow["buildForApi"]>
  ): Promise<N8nApiWorkflow> {
    const payload =
      workflow instanceof N8nWorkflow ? workflow.buildForApi() : workflow;
    return await this.request<N8nApiWorkflow>("POST", "/workflows", payload);
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(
    id: string,
    workflow: N8nWorkflow | ReturnType<N8nWorkflow["buildForApi"]>
  ): Promise<N8nApiWorkflow> {
    const payload =
      workflow instanceof N8nWorkflow ? workflow.buildForApi() : workflow;
    return await this.request<N8nApiWorkflow>(
      "PUT",
      `/workflows/${id}`,
      payload
    );
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(id: string): Promise<void> {
    await this.request<N8nApiWorkflow>("DELETE", `/workflows/${id}`);
  }

  /**
   * Activate a workflow
   */
  async activateWorkflow(id: string): Promise<N8nApiWorkflow> {
    return await this.request<N8nApiWorkflow>(
      "POST",
      `/workflows/${id}/activate`
    );
  }

  /**
   * Deactivate a workflow
   */
  async deactivateWorkflow(id: string): Promise<N8nApiWorkflow> {
    return await this.request<N8nApiWorkflow>(
      "POST",
      `/workflows/${id}/deactivate`
    );
  }

  /**
   * Find workflow by name
   */
  async findByName(name: string): Promise<N8nApiWorkflow | undefined> {
    const workflows = await this.listWorkflows();
    return workflows.find((w) => w.name === name);
  }

  /**
   * Create or update workflow by name
   */
  async upsertWorkflow(
    workflow: N8nWorkflow
  ): Promise<{ workflow: N8nApiWorkflow; created: boolean }> {
    const payload = workflow.buildForApi();
    const existing = await this.findByName(payload.name);

    if (existing) {
      const updated = await this.updateWorkflow(existing.id, payload);
      return { workflow: updated, created: false };
    }

    const created = await this.createWorkflow(payload);
    return { workflow: created, created: true };
  }

  // ============================================================================
  // Executions
  // ============================================================================

  /**
   * List executions with optional filters
   */
  async listExecutions(
    options: N8nExecutionListOptions = {}
  ): Promise<N8nExecution[]> {
    const params = new URLSearchParams();
    if (options.workflowId) {
      params.set("workflowId", options.workflowId);
    }
    if (options.status) {
      params.set("status", options.status);
    }
    if (options.limit) {
      params.set("limit", String(options.limit));
    }
    if (options.includeData) {
      params.set("includeData", "true");
    }

    const query = params.toString();
    const data = await this.request<{ data: N8nExecution[] }>(
      "GET",
      `/executions${query ? `?${query}` : ""}`
    );
    return data.data;
  }

  /**
   * Get a single execution by ID
   */
  async getExecution(id: string, includeData = true): Promise<N8nExecution> {
    return await this.request<N8nExecution>(
      "GET",
      `/executions/${id}${includeData ? "?includeData=true" : ""}`
    );
  }

  /**
   * Get the latest execution for a workflow
   */
  async getLatestExecution(
    workflowId: string,
    includeData = true
  ): Promise<N8nExecution | null> {
    const executions = await this.listExecutions({
      workflowId,
      limit: 1,
      includeData,
    });
    return executions[0] ?? null;
  }

  /**
   * Get node outputs from an execution
   */
  getNodeOutputs(execution: N8nExecution): Record<string, N8nNodeOutput[]> {
    if (!execution.data?.resultData?.runData) {
      return {};
    }

    const outputs: Record<string, N8nNodeOutput[]> = {};
    for (const [nodeName, runs] of Object.entries(
      execution.data.resultData.runData
    )) {
      const nodeOutput = runs[0]?.data?.main?.[0];
      if (nodeOutput) {
        outputs[nodeName] = nodeOutput;
      }
    }
    return outputs;
  }

  /**
   * Trigger a webhook-based workflow and get the result
   */
  async triggerWebhook<T = unknown>(
    path: string,
    data: Record<string, unknown> = {},
    method: "GET" | "POST" = "POST"
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/webhook/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(data) : undefined,
    });

    if (!res.ok) {
      throw new Error(`Webhook error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
