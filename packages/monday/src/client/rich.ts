/**
 * Rich item fetches that include relation and mirror column data.
 */
import type { MondayItem } from "@monday/types/schema";
import { query } from "./query";

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
  boards: {
    items_page: {
      cursor: string | null;
      items: RawRichItem[];
    };
  }[];
}

const DEFAULT_MAX_ITEMS = 10_000;
const PAGE_SIZE = 100; // NOT 500 - causes timeouts per SYNC-KNOWLEDGE.md
const RELATION_COLUMN_TYPES = new Set(["board_relation", "mirror"]);

function getColumnDisplayValue(col: RawRichColumnValue): string | null {
  const usesDisplayValue =
    RELATION_COLUMN_TYPES.has(col.type) && col.display_value;
  return usesDisplayValue ? (col.display_value ?? null) : col.text;
}

function buildItemUrl(boardId: string, itemId: string): string {
  return `https://monday.com/boards/${boardId}/pulses/${itemId}`;
}

function mapRawRichColumn(col: RawRichColumnValue): MondayColumnValue {
  return {
    displayValue: col.display_value,
    id: col.id,
    linkedItemIds: col.linked_item_ids,
    text: col.text,
    type: col.type,
    value: col.value,
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
    columnValues,
    columns,
    groupId: item.group.id,
    groupTitle: item.group.title,
    id: item.id,
    name: item.name,
    url: buildItemUrl(boardId, item.id),
  };
}

/**
 * Get items with full column data including linked items and mirror values.
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

interface SingleItemRaw extends RawRichItem {
  board: { id: string };
}

/**
 * Get a single item with full column data.
 */
export async function getItemRich(
  itemId: string
): Promise<MondayItemRich | null> {
  const result = await query<{
    items: SingleItemRaw[];
  }>(`
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
  `);

  const item = result.items[0];
  if (!item) {
    return null;
  }

  return mapRawItemToMondayItemRich(item, item.board.id);
}
