import { query as mondayQuery } from "@monday/client/query";
import { updateItem } from "@monday/client/search";
import {
  BOARD_IDS,
  CONTACTS_COLUMNS,
  ESTIMATING_COLUMNS,
  ESTIMATING_SKIP_GROUPS,
} from "@monday/types/schema";

export interface MondayRelationBackfillResult {
  failed: number;
  resolved: number;
  scope: string;
  skipped: number;
  total: number;
  wouldResolve?: number;
}

export interface RunMondayRelationBackfillOptions {
  activeOnly?: boolean;
  dryRun?: boolean;
  itemIds?: string[];
  limit?: number;
  scope?: "all" | "estimating-account" | "estimating-contacts";
}

interface BoardItem {
  columns: Record<string, string[]>;
  groupTitle: string;
  id: string;
  name: string;
}

interface BackfillChain {
  boardId: string;
  directColumnId: string;
  resolve: (items: BoardItem[]) => Promise<Map<string, string[]>>;
  scope: "estimating-account" | "estimating-contacts";
  skipGroups: readonly string[];
}

interface BackfillOptions {
  activeOnly: boolean;
  dryRun: boolean;
  itemIds?: string[];
  limit?: number;
}

interface ItemsPage {
  cursor: string | null;
  items: {
    id: string;
    name: string;
    group: { title: string };
    column_values: {
      id: string;
      linked_item_ids?: string[];
    }[];
  }[];
}

const FETCH_PAGE_SIZE = 500;
const CONTACT_BATCH_SIZE = 50;
const LEGACY_CONTACTS_COLUMN_ID = ESTIMATING_COLUMNS.CONTACTS.id;
const DIRECT_CONTACTS_COLUMN_ID = ESTIMATING_COLUMNS.CONTACTS_DIRECT.id;

function getEstimateContactIds(item: BoardItem): string[] {
  const ids = new Set<string>();
  for (const contactId of item.columns[DIRECT_CONTACTS_COLUMN_ID] ?? []) {
    ids.add(contactId);
  }
  for (const contactId of item.columns[LEGACY_CONTACTS_COLUMN_ID] ?? []) {
    ids.add(contactId);
  }
  return [...ids];
}

async function fetchBoardItems(
  boardId: string,
  columnIds: string[]
): Promise<BoardItem[]> {
  const results: BoardItem[] = [];
  let cursor: string | null = null;
  const columnIdsLiteral = columnIds.map((id) => `"${id}"`).join(", ");

  const itemFields = `
    id
    name
    group { title }
    column_values(ids: [${columnIdsLiteral}]) {
      id
      ... on BoardRelationValue {
        linked_item_ids
      }
    }
  `;

  // First page: nested in boards
  const firstData: {
    boards: { items_page: ItemsPage }[];
  } = await mondayQuery(`
    query {
      boards(ids: ${boardId}) {
        items_page(limit: ${FETCH_PAGE_SIZE}) {
          cursor
          items { ${itemFields} }
        }
      }
    }
  `);

  const firstPage = firstData.boards[0]?.items_page;
  if (firstPage) {
    for (const item of firstPage.items) {
      const columns: Record<string, string[]> = {};
      for (const col of item.column_values) {
        columns[col.id] = col.linked_item_ids ?? [];
      }
      results.push({
        id: item.id,
        name: item.name,
        groupTitle: item.group.title,
        columns,
      });
    }
    cursor = firstPage.cursor;
  }

  // Subsequent pages: next_items_page at root level
  while (cursor) {
    const nextData: {
      next_items_page: ItemsPage;
    } = await mondayQuery(`
      query {
        next_items_page(limit: ${FETCH_PAGE_SIZE}, cursor: ${JSON.stringify(cursor)}) {
          cursor
          items { ${itemFields} }
        }
      }
    `);

    const page = nextData.next_items_page;
    if (!page) {
      break;
    }

    for (const item of page.items) {
      const columns: Record<string, string[]> = {};
      for (const col of item.column_values) {
        columns[col.id] = col.linked_item_ids ?? [];
      }
      results.push({
        id: item.id,
        name: item.name,
        groupTitle: item.group.title,
        columns,
      });
    }

    cursor = page.cursor;
  }

  return results;
}

async function fetchContactContractorMap(
  contactIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (contactIds.length === 0) {
    return result;
  }

  const contractorColumnId = CONTACTS_COLUMNS.CONTRACTOR.id;

  for (let i = 0; i < contactIds.length; i += CONTACT_BATCH_SIZE) {
    const batch = contactIds.slice(i, i + CONTACT_BATCH_SIZE);
    const idsLiteral = batch.join(",");

    const data = await mondayQuery<{
      items: {
        id: string;
        column_values: {
          id: string;
          linked_item_ids?: string[];
        }[];
      }[];
    }>(`
      query {
        items(ids: [${idsLiteral}]) {
          id
          column_values(ids: ["${contractorColumnId}"]) {
            id
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    `);

    for (const item of data.items) {
      const linkedIds = item.column_values[0]?.linked_item_ids ?? [];
      if (linkedIds.length > 0) {
        result.set(item.id, linkedIds);
      }
    }
  }

  return result;
}

// biome-ignore lint/suspicious/useAwait: interface requires Promise return for consistency with async resolvers
async function resolveContactsDirect(
  items: BoardItem[]
): Promise<Map<string, string[]>> {
  const resolved = new Map<string, string[]>();

  for (const item of items) {
    const contactIds = item.columns[LEGACY_CONTACTS_COLUMN_ID] ?? [];
    if (contactIds.length > 0) {
      resolved.set(item.id, contactIds);
    }
  }

  return resolved;
}

async function resolveContractorsDirect(
  items: BoardItem[]
): Promise<Map<string, string[]>> {
  const allContactIds = new Set<string>();
  for (const item of items) {
    for (const id of getEstimateContactIds(item)) {
      allContactIds.add(id);
    }
  }

  if (allContactIds.size === 0) {
    return new Map();
  }

  const contactToContractors = await fetchContactContractorMap([
    ...allContactIds,
  ]);

  const resolved = new Map<string, string[]>();
  for (const item of items) {
    const contractorIds = new Set<string>();
    for (const contactId of getEstimateContactIds(item)) {
      const contractors = contactToContractors.get(contactId);
      if (!contractors) {
        continue;
      }
      for (const contractorId of contractors) {
        contractorIds.add(contractorId);
      }
    }

    if (contractorIds.size > 0) {
      resolved.set(item.id, [...contractorIds]);
    }
  }

  return resolved;
}

const CHAINS: BackfillChain[] = [
  {
    scope: "estimating-contacts",
    boardId: BOARD_IDS.ESTIMATING,
    directColumnId: ESTIMATING_COLUMNS.CONTACTS_DIRECT.id,
    resolve: resolveContactsDirect,
    skipGroups: ESTIMATING_SKIP_GROUPS,
  },
  {
    scope: "estimating-account",
    boardId: BOARD_IDS.ESTIMATING,
    directColumnId: ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id,
    resolve: resolveContractorsDirect,
    skipGroups: ESTIMATING_SKIP_GROUPS,
  },
];

function applyFilters(
  items: BoardItem[],
  chain: BackfillChain,
  options: BackfillOptions
): { skipped: number; total: number; items: BoardItem[] } {
  const filteredById = options.itemIds?.length
    ? items.filter((item) => options.itemIds?.includes(item.id))
    : items;

  const total = filteredById.length;
  const itemsAfterGroupFilter = options.activeOnly
    ? filteredById.filter((item) => !chain.skipGroups.includes(item.groupTitle))
    : filteredById;
  const skipped = total - itemsAfterGroupFilter.length;

  return {
    items: itemsAfterGroupFilter,
    skipped,
    total,
  };
}

async function runChainBackfill(
  chain: BackfillChain,
  options: BackfillOptions
): Promise<MondayRelationBackfillResult> {
  const fetchedItems = await fetchBoardItems(chain.boardId, [
    chain.directColumnId,
    ESTIMATING_COLUMNS.CONTACTS.id,
    ESTIMATING_COLUMNS.CONTACTS_DIRECT.id,
  ]);
  const { items, total, skipped } = applyFilters(fetchedItems, chain, options);

  const candidates = items.filter(
    (item) => (item.columns[chain.directColumnId] ?? []).length === 0
  );
  const resolvedMap = await chain.resolve(candidates);
  const limitedEntries =
    options.limit && options.limit > 0
      ? [...resolvedMap.entries()].slice(0, options.limit)
      : [...resolvedMap.entries()];

  if (options.dryRun) {
    return {
      scope: chain.scope,
      total,
      skipped,
      resolved: 0,
      failed: 0,
      wouldResolve: limitedEntries.length,
    };
  }

  let resolved = 0;
  let failed = 0;

  for (const [itemId, linkedIds] of limitedEntries) {
    try {
      await updateItem({
        boardId: chain.boardId,
        itemId,
        columnValues: {
          [chain.directColumnId]: { item_ids: linkedIds.map(Number) },
        },
      });
      resolved += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    scope: chain.scope,
    total,
    skipped,
    resolved,
    failed,
  };
}

export async function runMondayRelationBackfill(
  options: RunMondayRelationBackfillOptions = {}
): Promise<{ results: MondayRelationBackfillResult[] }> {
  const {
    scope = "all",
    dryRun = false,
    itemIds,
    limit,
    activeOnly = true,
  } = options;

  const chains =
    scope === "all" ? CHAINS : CHAINS.filter((chain) => chain.scope === scope);

  if (chains.length === 0) {
    throw new Error(
      `Unknown backfill scope: ${scope}. Use one of: all, ${CHAINS.map((chain) => chain.scope).join(", ")}`
    );
  }

  const results: MondayRelationBackfillResult[] = [];
  for (const chain of chains) {
    results.push(
      await runChainBackfill(chain, {
        activeOnly,
        dryRun,
        itemIds,
        limit,
      })
    );
  }

  return { results };
}
