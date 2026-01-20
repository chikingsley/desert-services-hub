/**
 * Notion API Client
 *
 * Generic Notion API wrapper for database and page operations.
 *
 * Features:
 * - Query databases with filters and pagination
 * - Create and update pages
 * - File uploads
 * - Rate limiting (350ms between requests)
 */
import type {
  CreatePageOptions,
  FileUploadResult,
  NotionDatabase,
  NotionPage,
  NotionQueryResult,
  QueryDatabaseOptions,
  UpdatePageOptions,
} from "./types";

const NOTION_VERSION = "2022-06-28";
const RATE_LIMIT_DELAY = 350; // ms between requests

function getApiKey(): string {
  const key = process.env.NOTION_API_KEY;
  if (!key) {
    throw new Error("NOTION_API_KEY environment variable is required");
  }
  return key;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Generic Notion API request
 */
export async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as T & { message?: string };
  if (!res.ok) {
    throw new Error(
      `Notion API ${method} ${path} failed: ${res.status} ${data?.message ?? "unknown"}`
    );
  }
  return data;
}

/**
 * Sleep helper for rate limiting
 */
export function sleep(ms: number = RATE_LIMIT_DELAY): Promise<void> {
  return Bun.sleep(ms);
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Get database schema
 */
export async function getDatabase(databaseId: string): Promise<NotionDatabase> {
  const data = await request<{
    id: string;
    title: Array<{ plain_text: string }>;
    properties: Record<string, { name: string; type: string }>;
  }>("GET", `/databases/${databaseId}`);

  return {
    id: data.id,
    title: data.title[0]?.plain_text ?? "",
    properties: data.properties,
  };
}

/**
 * Query a database with optional filters and pagination
 */
export async function queryDatabase(
  options: QueryDatabaseOptions
): Promise<NotionQueryResult> {
  const body: Record<string, unknown> = {
    page_size: options.pageSize ?? 100,
  };

  if (options.filter) {
    body.filter = options.filter;
  }
  if (options.sorts) {
    body.sorts = options.sorts;
  }
  if (options.startCursor) {
    body.start_cursor = options.startCursor;
  }

  return await request<NotionQueryResult>(
    "POST",
    `/databases/${options.databaseId}/query`,
    body
  );
}

/**
 * Query all pages from a database (handles pagination)
 */
export async function queryAllPages(
  options: Omit<QueryDatabaseOptions, "startCursor" | "pageSize">
): Promise<NotionPage[]> {
  const allPages: NotionPage[] = [];
  let startCursor: string | undefined;

  while (true) {
    const result = await queryDatabase({
      ...options,
      pageSize: 100,
      startCursor,
    });

    allPages.push(...result.results);

    if (!result.has_more) {
      break;
    }
    startCursor = result.next_cursor;
    await sleep();
  }

  return allPages;
}

/**
 * Update database schema (add properties)
 */
export async function updateDatabaseSchema(
  databaseId: string,
  properties: Record<string, unknown>
): Promise<void> {
  await request("PATCH", `/databases/${databaseId}`, { properties });
}

// ============================================================================
// Page Operations
// ============================================================================

/**
 * Get a page by ID
 */
export async function getPage(pageId: string): Promise<NotionPage | null> {
  try {
    return await request<NotionPage>("GET", `/pages/${pageId}`);
  } catch {
    return null;
  }
}

/**
 * Create a new page in a database
 */
export async function createPage(options: CreatePageOptions): Promise<string> {
  const body: Record<string, unknown> = {
    parent: { database_id: options.databaseId },
    properties: options.properties,
  };

  if (options.icon) {
    body.icon = options.icon;
  }

  const data = await request<{ id: string }>("POST", "/pages", body);
  return data.id;
}

/**
 * Update an existing page
 */
export async function updatePage(options: UpdatePageOptions): Promise<void> {
  const body: Record<string, unknown> = {};

  if (options.properties) {
    body.properties = options.properties;
  }
  if (options.icon) {
    body.icon = options.icon;
  }
  if (options.archived !== undefined) {
    body.archived = options.archived;
  }

  await request("PATCH", `/pages/${options.pageId}`, body);
}

/**
 * Archive (soft delete) a page
 */
export async function archivePage(pageId: string): Promise<void> {
  await updatePage({ pageId, archived: true });
}

/**
 * Update page icon
 */
export async function updatePageIcon(
  pageId: string,
  iconUrl: string
): Promise<void> {
  await updatePage({
    pageId,
    icon: { type: "external", external: { url: iconUrl } },
  });
}

// ============================================================================
// Search & Find
// ============================================================================

/**
 * Find page by title property equals value
 */
export async function findPageByTitle(options: {
  databaseId: string;
  property: string;
  value: string;
}): Promise<string | null> {
  const result = await queryDatabase({
    databaseId: options.databaseId,
    filter: {
      property: options.property,
      title: { equals: options.value },
    },
    pageSize: 1,
  });

  return result.results[0]?.id ?? null;
}

/**
 * Find page by title property contains value (fuzzy match)
 */
export async function findPagesByTitleContains(options: {
  databaseId: string;
  property: string;
  value: string;
}): Promise<Array<{ id: string; title: string }>> {
  const result = await queryDatabase({
    databaseId: options.databaseId,
    filter: {
      property: options.property,
      title: { contains: options.value },
    },
    pageSize: 10,
  });

  return result.results.map((page) => {
    const prop = page.properties?.[options.property] as
      | { title?: Array<{ plain_text: string }> }
      | undefined;
    return {
      id: page.id,
      title: prop?.title?.[0]?.plain_text ?? "Untitled",
    };
  });
}

/**
 * Find page by rich text property equals value
 */
export async function findPageByRichText(options: {
  databaseId: string;
  property: string;
  value: string;
}): Promise<string | null> {
  const result = await queryDatabase({
    databaseId: options.databaseId,
    filter: {
      property: options.property,
      rich_text: { equals: options.value },
    },
    pageSize: 1,
  });

  return result.results[0]?.id ?? null;
}

/**
 * Find page by email property equals value
 */
export async function findPageByEmail(options: {
  databaseId: string;
  property: string;
  value: string;
}): Promise<string | null> {
  const result = await queryDatabase({
    databaseId: options.databaseId,
    filter: {
      property: options.property,
      email: { equals: options.value },
    },
    pageSize: 1,
  });

  return result.results[0]?.id ?? null;
}

// ============================================================================
// Find or Create (Dedupe Helpers)
// ============================================================================

export type FindOrCreateResult = {
  id: string;
  created: boolean;
};

/**
 * Find an existing page by title or create a new one.
 * Use this to prevent duplicate entries.
 *
 * @example
 * const account = await findOrCreateByTitle({
 *   databaseId: ACCOUNTS_DB_ID,
 *   titleProperty: "Name",
 *   titleValue: "FORM Arizona LLC",
 *   properties: {
 *     Name: title("FORM Arizona LLC"),
 *     Address: richText("123 Main St"),
 *   },
 * });
 * // account.created = false if it already existed
 */
export async function findOrCreateByTitle(options: {
  databaseId: string;
  titleProperty: string;
  titleValue: string;
  properties: Record<string, unknown>;
  icon?: { type: "external"; external: { url: string } };
}): Promise<FindOrCreateResult> {
  // Check for existing
  const existingId = await findPageByTitle({
    databaseId: options.databaseId,
    property: options.titleProperty,
    value: options.titleValue,
  });

  if (existingId) {
    return { id: existingId, created: false };
  }

  // Create new
  const newId = await createPage({
    databaseId: options.databaseId,
    properties: options.properties,
    icon: options.icon,
  });

  return { id: newId, created: true };
}

/**
 * Find an existing page by email or create a new one.
 * Useful for contacts where email is the unique identifier.
 *
 * @example
 * const contact = await findOrCreateByEmail({
 *   databaseId: CONTACTS_DB_ID,
 *   emailProperty: "Email",
 *   emailValue: "john@example.com",
 *   properties: {
 *     Name: title("John Doe"),
 *     Email: email("john@example.com"),
 *   },
 * });
 */
export async function findOrCreateByEmail(options: {
  databaseId: string;
  emailProperty: string;
  emailValue: string;
  properties: Record<string, unknown>;
  icon?: { type: "external"; external: { url: string } };
}): Promise<FindOrCreateResult> {
  // Check for existing
  const existingId = await findPageByEmail({
    databaseId: options.databaseId,
    property: options.emailProperty,
    value: options.emailValue,
  });

  if (existingId) {
    return { id: existingId, created: false };
  }

  // Create new
  const newId = await createPage({
    databaseId: options.databaseId,
    properties: options.properties,
    icon: options.icon,
  });

  return { id: newId, created: true };
}

/**
 * Check if similar records exist before creating.
 * Returns potential duplicates for review.
 * Use this when you want to warn about possible dupes rather than auto-deduping.
 *
 * @example
 * const dupes = await checkForDuplicates({
 *   databaseId: ACCOUNTS_DB_ID,
 *   titleProperty: "Name",
 *   searchTerms: ["Weis", "Builders"],
 * });
 * if (dupes.length > 0) {
 *   console.log("Potential duplicates found:", dupes);
 * }
 */
export async function checkForDuplicates(options: {
  databaseId: string;
  titleProperty: string;
  searchTerms: string[];
}): Promise<Array<{ id: string; title: string }>> {
  const allMatches: Array<{ id: string; title: string }> = [];

  for (const term of options.searchTerms) {
    const matches = await findPagesByTitleContains({
      databaseId: options.databaseId,
      property: options.titleProperty,
      value: term,
    });
    allMatches.push(...matches);
  }

  // Dedupe results by id using Map for O(1) lookups
  const uniqueById = new Map(allMatches.map((m) => [m.id, m]));
  return [...uniqueById.values()];
}

// ============================================================================
// File Uploads
// ============================================================================

/**
 * Create a file upload session
 */
export async function createFileUpload(
  filename: string,
  contentType: string
): Promise<FileUploadResult> {
  return await request<FileUploadResult>("POST", "/file_uploads", {
    filename,
    content_type: contentType,
    mode: "single_part",
  });
}

/**
 * Upload file to the upload URL
 */
export async function sendFileUpload(
  uploadUrl: string,
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<void> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(fileBuffer)], { type: contentType }),
    filename
  );

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`File upload failed: ${res.status} ${text}`);
  }
}

/**
 * Upload a file to Notion
 */
export async function uploadFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = filePath.split("/").pop() || "file";
  const contentType = file.type || "application/octet-stream";

  const upload = await createFileUpload(filename, contentType);
  await sendFileUpload(upload.upload_url, buffer, filename, contentType);

  return upload.id;
}

/**
 * Append a file block to a page
 */
export async function appendFileBlockToPage(
  pageId: string,
  fileUploadId: string,
  caption?: string
): Promise<void> {
  await request("PATCH", `/blocks/${pageId}/children`, {
    children: [
      {
        type: "file",
        file: {
          type: "file_upload",
          file_upload: { id: fileUploadId },
          caption: caption
            ? [{ type: "text", text: { content: caption } }]
            : [],
        },
      },
    ],
  });
}

// ============================================================================
// Property Helpers
// ============================================================================

/**
 * Build title property value
 */
export function title(text: string): {
  title: Array<{ text: { content: string } }>;
} {
  return { title: [{ text: { content: text } }] };
}

/**
 * Build rich text property value
 */
export function richText(text: string): {
  rich_text: Array<{ text: { content: string } }>;
} {
  return { rich_text: [{ text: { content: text } }] };
}

/**
 * Build URL property value
 */
export function url(value: string): { url: string } {
  return { url: value };
}

/**
 * Build email property value
 */
export function email(value: string): { email: string } {
  return { email: value };
}

/**
 * Build phone property value
 */
export function phone(value: string): { phone_number: string } {
  return { phone_number: value };
}

/**
 * Build relation property value
 */
export function relation(pageIds: string[]): {
  relation: Array<{ id: string }>;
} {
  return { relation: pageIds.map((id) => ({ id })) };
}

/**
 * Build multi-select property value
 */
export function multiSelect(names: string[]): {
  multi_select: Array<{ name: string }>;
} {
  return { multi_select: names.map((name) => ({ name })) };
}

/**
 * Build select property value
 */
export function select(name: string): { select: { name: string } } {
  return { select: { name } };
}

/**
 * Build number property value
 */
export function number(value: number): { number: number } {
  return { number: value };
}

/**
 * Build checkbox property value
 */
export function checkbox(value: boolean): { checkbox: boolean } {
  return { checkbox: value };
}

/**
 * Build date property value
 */
export function date(
  start: string,
  end?: string
): { date: { start: string; end?: string } } {
  const dateValue: { start: string; end?: string } = { start };
  if (end !== undefined) {
    dateValue.end = end;
  }
  return { date: dateValue };
}
