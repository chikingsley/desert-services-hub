/**
 * Monday.com API Client
 *
 * GraphQL-based client for Monday.com operations.
 */
import type {
  GraphQLResponse,
  MondayBoard,
  MondayColumn,
  MondayItem,
} from "./types";

const API_URL = "https://api.monday.com/v2";
const WORD_SPLIT_REGEX = /\s+/;
const DEFAULT_MAX_ITEMS = 10_000;
const PAGE_SIZE = 500;
const MIN_WORD_LENGTH = 3;
const MIN_SIMILARITY_THRESHOLD = 0.3;

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) {
    throw new Error("MONDAY_API_KEY environment variable is required");
  }
  return key;
}

/**
 * Execute a GraphQL query against Monday.com API
 */
export async function query<T>(graphqlQuery: string): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiKey(),
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query: graphqlQuery }),
  });

  const result = (await response.json()) as GraphQLResponse<T>;
  const firstError = result.errors?.[0];

  if (firstError) {
    throw new Error(`Monday API error: ${firstError.message}`);
  }

  if (!result.data) {
    throw new Error("Monday API returned no data");
  }

  return result.data;
}

// ============================================================================
// Board Operations
// ============================================================================

/**
 * Get board information
 */
export async function getBoard(boardId: string): Promise<MondayBoard | null> {
  const result = await query<{
    boards: Array<{
      id: string;
      name: string;
      groups: Array<{ id: string; title: string }>;
    }>;
  }>(`
    query {
      boards(ids: ${boardId}) {
        id
        name
        groups {
          id
          title
        }
      }
    }
  `);

  return result.boards[0] ?? null;
}

/**
 * Get board columns schema
 */
export async function getBoardColumns(
  boardId: string
): Promise<MondayColumn[]> {
  const result = await query<{
    boards: Array<{
      columns: Array<{ id: string; title: string; type: string }>;
    }>;
  }>(`
    query {
      boards(ids: ${boardId}) {
        columns {
          id
          title
          type
        }
      }
    }
  `);

  return result.boards[0]?.columns ?? [];
}

// ============================================================================
// Item Operations
// ============================================================================

interface RawColumnValue {
  id: string;
  text: string;
}

interface RawItem {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: RawColumnValue[];
}

interface ItemsPageResponse {
  boards: Array<{
    items_page: {
      cursor: string | null;
      items: RawItem[];
    };
  }>;
}

function buildItemUrl(boardId: string, itemId: string): string {
  return `https://monday.com/boards/${boardId}/pulses/${itemId}`;
}

function mapRawItemToMondayItem(item: RawItem, boardId: string): MondayItem {
  return {
    id: item.id,
    name: item.name,
    groupId: item.group.id,
    groupTitle: item.group.title,
    url: buildItemUrl(boardId, item.id),
    columns: Object.fromEntries(
      item.column_values.map((col) => [col.id, col.text])
    ),
  };
}

/**
 * Get items from a board (auto-paginates to fetch ALL items)
 *
 * Note: For large boards (1000+ items), this may take a few seconds.
 * Use options.maxItems to limit if you only need a sample.
 */
export async function getItems(
  boardId: string,
  options: { maxItems?: number } = {}
): Promise<MondayItem[]> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const allItems: MondayItem[] = [];
  let cursor: string | null = null;

  do {
    const cursorParam: string = cursor ? `, cursor: "${cursor}"` : "";

    const result: ItemsPageResponse = await query<ItemsPageResponse>(`
      query {
        boards(ids: ${boardId}) {
          items_page(limit: ${PAGE_SIZE}${cursorParam}) {
            cursor
            items {
              id
              name
              group {
                id
                title
              }
              column_values {
                id
                text
              }
            }
          }
        }
      }
    `);

    const itemsPage:
      | ItemsPageResponse["boards"][number]["items_page"]
      | undefined = result.boards[0]?.items_page;
    const items = itemsPage?.items ?? [];

    for (const item of items) {
      allItems.push(mapRawItemToMondayItem(item, boardId));
    }

    cursor = itemsPage?.cursor ?? null;
  } while (cursor && allItems.length < maxItems);

  return allItems;
}

interface SingleItemResponse {
  items: Array<
    RawItem & {
      board: { id: string };
    }
  >;
}

/**
 * Get a single item by ID
 */
export async function getItem(itemId: string): Promise<MondayItem | null> {
  const result = await query<SingleItemResponse>(`
    query {
      items(ids: [${itemId}]) {
        id
        name
        board { id }
        group {
          id
          title
        }
        column_values {
          id
          text
        }
      }
    }
  `);

  const item = result.items[0];
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    name: item.name,
    groupId: item.group.id,
    groupTitle: item.group.title,
    url: buildItemUrl(item.board.id, item.id),
    columns: Object.fromEntries(
      item.column_values.map((col) => [col.id, col.text])
    ),
  };
}

const DEFAULT_EXCLUDED_GROUPS = ["shell estimates"];

// ============================================================================
// Column Value Search (Fast)
// ============================================================================

interface ColumnValueSearchResponse {
  items_page_by_column_values: {
    cursor: string | null;
    items: RawItem[];
  };
}

/**
 * Search items by a specific column value using Monday's native column search.
 * Much faster than searchItems for large boards since it queries the API directly.
 *
 * @param boardId - Board ID to search
 * @param columnId - Column ID to search (e.g., "text_mkseybgg" for ESTIMATE_ID)
 * @param value - Value to search for (exact match)
 * @param options - Optional limit on results
 */
export async function searchByColumnValue(
  boardId: string,
  columnId: string,
  value: string,
  options: { limit?: number } = {}
): Promise<MondayItem[]> {
  const limit = options.limit ?? 50;

  const result = await query<ColumnValueSearchResponse>(`
    query {
      items_page_by_column_values(
        board_id: ${boardId}
        limit: ${limit}
        columns: [{ column_id: "${columnId}", column_values: ["${value}"] }]
      ) {
        cursor
        items {
          id
          name
          group {
            id
            title
          }
          column_values {
            id
            text
          }
        }
      }
    }
  `);

  const itemsPage = result.items_page_by_column_values;
  const items = itemsPage?.items ?? [];

  return items.map((item) => mapRawItemToMondayItem(item, boardId));
}

/**
 * Search items by name
 */
export async function searchItems(
  boardId: string,
  searchTerm: string,
  options: { excludeGroups?: string[] } = {}
): Promise<MondayItem[]> {
  const items = await getItems(boardId);
  const searchLower = searchTerm.toLowerCase();
  const excludeGroups = (options.excludeGroups ?? DEFAULT_EXCLUDED_GROUPS).map(
    (g) => g.toLowerCase()
  );

  const isGroupExcluded = (groupTitle: string): boolean =>
    excludeGroups.some((excluded) =>
      groupTitle.toLowerCase().includes(excluded)
    );

  const matchesSearch = (name: string): boolean =>
    name.toLowerCase().includes(searchLower);

  return items.filter(
    (item) => matchesSearch(item.name) && !isGroupExcluded(item.groupTitle)
  );
}

/**
 * Create a new item
 */
export async function createItem(options: {
  boardId: string;
  itemName: string;
  groupId?: string;
  columnValues?: Record<string, unknown>;
}): Promise<string> {
  const columnValuesJson = options.columnValues
    ? JSON.stringify(JSON.stringify(options.columnValues))
    : '"{}"';

  const groupPart = options.groupId ? `group_id: "${options.groupId}"` : "";

  const result = await query<{
    create_item: { id: string };
  }>(`
    mutation {
      create_item(
        board_id: ${options.boardId}
        item_name: "${options.itemName}"
        ${groupPart}
        column_values: ${columnValuesJson}
      ) {
        id
      }
    }
  `);

  return result.create_item.id;
}

/**
 * Update item column values
 */
export async function updateItem(options: {
  boardId: string;
  itemId: string;
  columnValues: Record<string, unknown>;
}): Promise<void> {
  const columnValuesJson = JSON.stringify(JSON.stringify(options.columnValues));

  await query(`
    mutation {
      change_multiple_column_values(
        board_id: ${options.boardId}
        item_id: ${options.itemId}
        column_values: ${columnValuesJson}
      ) {
        id
      }
    }
  `);
}

/**
 * Rename an item
 */
export async function renameItem(options: {
  boardId: string;
  itemId: string;
  newName: string;
}): Promise<void> {
  // Escape quotes in the name
  const escapedName = options.newName.replace(/"/g, '\\"');

  await query(`
    mutation {
      change_simple_column_value(
        board_id: ${options.boardId}
        item_id: ${options.itemId}
        column_id: "name"
        value: "${escapedName}"
      ) {
        id
      }
    }
  `);
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

const EXACT_MATCH_SCORE = 1;
const CONTAINS_MATCH_SCORE = 0.9;

function extractSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(WORD_SPLIT_REGEX)
    .filter((word) => word.length >= MIN_WORD_LENGTH);
}

function wordsMatch(wordA: string, wordB: string): boolean {
  return wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA);
}

/**
 * Calculate similarity between two strings (0-1)
 */
export function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) {
    return EXACT_MATCH_SCORE;
  }

  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return CONTAINS_MATCH_SCORE;
  }

  const wordsA = extractSignificantWords(a);
  const wordsB = extractSignificantWords(b);

  if (wordsA.length === 0 || wordsB.length === 0) {
    return 0;
  }

  let matchingWords = 0;
  for (const wordA of wordsA) {
    const hasMatch = wordsB.some((wordB) => wordsMatch(wordA, wordB));
    if (hasMatch) {
      matchingWords += 1;
    }
  }

  return matchingWords / Math.max(wordsA.length, wordsB.length);
}

export type ScoredItem = MondayItem & { score: number };

/**
 * Find best matching items by name
 */
export async function findBestMatches(
  boardId: string,
  name: string,
  limit = 5
): Promise<ScoredItem[]> {
  const items = await getItems(boardId);

  return items
    .map((item) => ({ ...item, score: calculateSimilarity(name, item.name) }))
    .filter((item) => item.score > MIN_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================================
// Rich Column Data (with linked items and mirrors)
// ============================================================================

export interface MondayColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
  linkedItemIds?: string[];
  displayValue?: string;
}

export type MondayItemRich = Omit<MondayItem, "columns"> & {
  columns: Record<string, string | null>;
  columnValues: MondayColumnValue[];
};

interface RawRichColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
  linked_item_ids?: string[];
  display_value?: string;
}

interface RawRichItem {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: RawRichColumnValue[];
}

interface ItemsPageRichResponse {
  boards: Array<{
    items_page: {
      cursor: string | null;
      items: RawRichItem[];
    };
  }>;
}

const RELATION_COLUMN_TYPES = ["board_relation", "mirror"];

function getColumnDisplayValue(col: RawRichColumnValue): string | null {
  const usesDisplayValue =
    RELATION_COLUMN_TYPES.includes(col.type) && col.display_value;
  return usesDisplayValue ? (col.display_value ?? null) : col.text;
}

function mapRawRichColumn(col: RawRichColumnValue): MondayColumnValue {
  return {
    id: col.id,
    type: col.type,
    text: col.text,
    value: col.value,
    linkedItemIds: col.linked_item_ids,
    displayValue: col.display_value,
  };
}

function mapRawItemToMondayItemRich(
  item: RawRichItem,
  boardId: string
): MondayItemRich {
  const columns: Record<string, string | null> = {};
  const columnValues: MondayColumnValue[] = [];

  for (const col of item.column_values) {
    columns[col.id] = getColumnDisplayValue(col);
    columnValues.push(mapRawRichColumn(col));
  }

  return {
    id: item.id,
    name: item.name,
    groupId: item.group.id,
    groupTitle: item.group.title,
    url: buildItemUrl(boardId, item.id),
    columns,
    columnValues,
  };
}

/**
 * Get items with full column data including linked items and mirror values.
 * Use this when you need board_relation or mirror column data.
 */
export async function getItemsRich(
  boardId: string,
  options: { maxItems?: number } = {}
): Promise<MondayItemRich[]> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const allItems: MondayItemRich[] = [];
  let cursor: string | null = null;

  do {
    const cursorParam: string = cursor ? `, cursor: "${cursor}"` : "";

    const result: ItemsPageRichResponse = await query<ItemsPageRichResponse>(`
      query {
        boards(ids: ${boardId}) {
          items_page(limit: ${PAGE_SIZE}${cursorParam}) {
            cursor
            items {
              id
              name
              group {
                id
                title
              }
              column_values {
                id
                type
                text
                value
                ... on BoardRelationValue {
                  linked_item_ids
                  display_value
                }
                ... on MirrorValue {
                  display_value
                }
              }
            }
          }
        }
      }
    `);

    const itemsPage:
      | ItemsPageRichResponse["boards"][number]["items_page"]
      | undefined = result.boards[0]?.items_page;
    const items = itemsPage?.items ?? [];

    for (const item of items) {
      allItems.push(mapRawItemToMondayItemRich(item, boardId));
    }

    cursor = itemsPage?.cursor ?? null;
  } while (cursor && allItems.length < maxItems);

  return allItems;
}
