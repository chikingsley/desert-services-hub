/**
 * Item-level fetchers.
 */
import type { MondayItem } from "@monday/types/schema";
import { query } from "./query";

const DEFAULT_MAX_ITEMS = 10_000;
const PAGE_SIZE = 100; // NOT 500 - causes timeouts per SYNC-KNOWLEDGE.md

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
  boards: {
    items_page: {
      cursor: string | null;
      items: RawItem[];
    };
  }[];
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
 * Get items from a board (auto-paginates to fetch all items).
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
