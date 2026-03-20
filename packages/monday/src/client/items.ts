/**
 * Item-level fetchers.
 *
 * Pagination follows Monday's recommended pattern:
 *   - First page:  boards { items_page(limit, query_params) }
 *   - Next pages:  next_items_page(cursor, limit) at root level
 *
 * This avoids the complexity cost of re-nesting items_page inside boards
 * on every page. See: https://developer.monday.com/api-reference/docs/items-page
 */
import type { MondayItem } from "@monday/types/schema";
import { query } from "./query";

const DEFAULT_MAX_ITEMS = 10_000;
const PAGE_SIZE = 500;

interface RawColumnValue {
  id: string;
  text: string;
}

interface RawItem {
  column_values: RawColumnValue[];
  group: { id: string; title: string };
  id: string;
  name: string;
}

interface ItemsPageResponse {
  boards: {
    items_page: {
      cursor: string | null;
      items: RawItem[];
    };
  }[];
}

interface NextItemsPageResponse {
  next_items_page: {
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

const ITEM_FIELDS = `
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
`;

/**
 * Get items from a board (auto-paginates to fetch all items).
 */
export async function getItems(
  boardId: string,
  options: { maxItems?: number } = {}
): Promise<MondayItem[]> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const allItems: MondayItem[] = [];

  // First page: nested in boards
  const firstResult = await query<ItemsPageResponse>(`
    query {
      boards(ids: ${boardId}) {
        items_page(limit: ${PAGE_SIZE}) {
          cursor
          items { ${ITEM_FIELDS} }
        }
      }
    }
  `);

  const firstPage = firstResult.boards[0]?.items_page;
  for (const item of firstPage?.items ?? []) {
    allItems.push(mapRawItemToMondayItem(item, boardId));
  }

  let cursor = firstPage?.cursor ?? null;

  // Subsequent pages: next_items_page at root level (lower complexity cost)
  while (cursor && allItems.length < maxItems) {
    const nextResult = await query<NextItemsPageResponse>(`
      query {
        next_items_page(limit: ${PAGE_SIZE}, cursor: "${cursor}") {
          cursor
          items { ${ITEM_FIELDS} }
        }
      }
    `);

    const page = nextResult.next_items_page;
    for (const item of page?.items ?? []) {
      allItems.push(mapRawItemToMondayItem(item, boardId));
    }

    cursor = page?.cursor ?? null;
  }

  return allItems;
}

interface SingleItemResponse {
  items: (RawItem & {
    board: { id: string };
  })[];
}

/**
 * Get a single item by ID.
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
    columns: Object.fromEntries(
      item.column_values.map((col) => [col.id, col.text])
    ),
    groupId: item.group.id,
    groupTitle: item.group.title,
    id: item.id,
    name: item.name,
    url: buildItemUrl(item.board.id, item.id),
  };
}

/**
 * Get item names by IDs (for batch lookups).
 */
export async function getItemNames(
  itemIds: string[]
): Promise<Map<string, string>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const BATCH_SIZE = 50;
  const nameMap = new Map<string, string>();

  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    const idsStr = batch.join(",");

    const result = await query<{
      items: { id: string; name: string }[];
    }>(`
      query {
        items(ids: [${idsStr}]) {
          id
          name
        }
      }
    `);

    for (const item of result.items) {
      nameMap.set(item.id, item.name);
    }
  }

  return nameMap;
}
