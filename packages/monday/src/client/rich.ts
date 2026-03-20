/**
 * Rich item fetches that include relation and mirror column data.
 *
 * Uses next_items_page for pagination (same pattern as items.ts).
 */
import type { MondayItem } from "@monday/types/schema";
import { query } from "./query";

export interface MondayColumnValue {
  displayValue?: string;
  id: string;
  linkedItemIds?: string[];
  text: string | null;
  type: string;
  value: string | null;
}

export type MondayItemRich = Omit<MondayItem, "columns"> & {
  columns: Record<string, string | null>;
  columnValues: MondayColumnValue[];
};

interface RawRichColumnValue {
  display_value?: string;
  id: string;
  linked_item_ids?: string[];
  text: string | null;
  type: string;
  value: string | null;
}

interface RawRichItem {
  column_values: RawRichColumnValue[];
  group: { id: string; title: string };
  id: string;
  name: string;
}

interface ItemsPageRichResponse {
  boards: {
    items_page: {
      cursor: string | null;
      items: RawRichItem[];
    };
  }[];
}

interface NextItemsPageRichResponse {
  next_items_page: {
    cursor: string | null;
    items: RawRichItem[];
  };
}

const DEFAULT_MAX_ITEMS = 10_000;
const PAGE_SIZE = 500;
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

const RICH_ITEM_FIELDS = `
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
`;

/**
 * Get items with full column data including linked items and mirror values.
 */
export async function getItemsRich(
  boardId: string,
  options: { maxItems?: number } = {}
): Promise<MondayItemRich[]> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const allItems: MondayItemRich[] = [];

  // First page: nested in boards
  const firstResult = await query<ItemsPageRichResponse>(`
    query {
      boards(ids: ${boardId}) {
        items_page(limit: ${PAGE_SIZE}) {
          cursor
          items { ${RICH_ITEM_FIELDS} }
        }
      }
    }
  `);

  const firstPage = firstResult.boards[0]?.items_page;
  for (const item of firstPage?.items ?? []) {
    allItems.push(mapRawItemToMondayItemRich(item, boardId));
  }

  let cursor = firstPage?.cursor ?? null;

  // Subsequent pages: next_items_page at root level
  while (cursor && allItems.length < maxItems) {
    const nextResult = await query<NextItemsPageRichResponse>(`
      query {
        next_items_page(limit: ${PAGE_SIZE}, cursor: "${cursor}") {
          cursor
          items { ${RICH_ITEM_FIELDS} }
        }
      }
    `);

    const page = nextResult.next_items_page;
    for (const item of page?.items ?? []) {
      allItems.push(mapRawItemToMondayItemRich(item, boardId));
    }

    cursor = page?.cursor ?? null;
  }

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
