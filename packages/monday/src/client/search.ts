/**
 * Search operations.
 */
import type { MondayItem } from "@monday/types/schema";
import { getItems } from "./items";
import { query } from "./query";

const DEFAULT_EXCLUDED_GROUPS = ["shell estimates"];

interface RawItem {
  column_values: { id: string; text: string }[];
  group: { id: string; title: string };
  id: string;
  name: string;
}

interface ColumnValueSearchResponse {
  items_page_by_column_values: {
    cursor: string | null;
    items: RawItem[];
  };
}

function buildItemUrl(boardId: string, itemId: string): string {
  return `https://monday.com/boards/${boardId}/pulses/${itemId}`;
}

function mapRawItemToMondayItem(item: RawItem, boardId: string): MondayItem {
  return {
    columns: Object.fromEntries(
      item.column_values.map((col) => [col.id, col.text])
    ),
    groupId: item.group.id,
    groupTitle: item.group.title,
    id: item.id,
    name: item.name,
    url: buildItemUrl(boardId, item.id),
  };
}

/**
 * Search items by a specific column value using Monday's native column search.
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
 * Search items by name (client-side text match).
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

  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchLower) &&
      !excludeGroups.some((excluded) =>
        item.groupTitle.toLowerCase().includes(excluded)
      )
  );
}

/**
 * Create an item.
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
 * Update item column values.
 */
export async function updateItem(options: {
  boardId: string;
  itemId: string;
  columnValues: Record<string, unknown>;
  createLabelsIfMissing?: boolean;
}): Promise<void> {
  const columnValuesJson = JSON.stringify(JSON.stringify(options.columnValues));
  const createLabels = options.createLabelsIfMissing ? "true" : "false";

  await query(`
    mutation {
      change_multiple_column_values(
        board_id: ${options.boardId}
        item_id: ${options.itemId}
        column_values: ${columnValuesJson}
        create_labels_if_missing: ${createLabels}
      ) {
        id
      }
    }
  `);
}

/**
 * Rename an item.
 */
export async function renameItem(options: {
  boardId: string;
  itemId: string;
  newName: string;
}): Promise<void> {
  const escapedName = options.newName.replaceAll('"', '\\"');

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
