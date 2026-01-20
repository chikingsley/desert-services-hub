import { db } from "./db";

/**
 * Local Monday.com Search Library
 *
 * Provides instant full-text search over synced Monday.com data.
 * Queries run against SQLite FTS5 in ~1-5ms.
 */

const WHITESPACE_REGEX = /\s+/;

export interface SearchResult {
  id: string;
  name: string;
  boardId: string;
  boardTitle: string;
  groupId: string;
  groupTitle: string;
  columnValues: Record<string, string>;
  url: string;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
  rank?: number;
}

export interface BoardMeta {
  boardId: string;
  boardName: string;
  columns: Array<{ id: string; title: string; type: string }>;
  groups: Array<{ id: string; title: string }>;
  syncedAt: string;
}

interface CacheRow {
  id: string;
  board_id: string;
  board_title: string;
  name: string;
  group_id: string;
  group_title: string;
  column_values: string;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

type FtsRow = CacheRow & { rank: number };

function buildItemUrl(boardId: string, itemId: string): string {
  return `https://monday.com/boards/${boardId}/pulses/${itemId}`;
}

function mapRowToResult(row: CacheRow | FtsRow): SearchResult {
  return {
    id: row.id,
    name: row.name,
    boardId: row.board_id,
    boardTitle: row.board_title,
    groupId: row.group_id,
    groupTitle: row.group_title,
    columnValues: JSON.parse(row.column_values),
    url: buildItemUrl(row.board_id, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
    rank: "rank" in row ? row.rank : undefined,
  };
}

/**
 * Full-text search across all synced Monday.com items
 * Uses FTS5 for fast prefix/phrase matching
 */
export function search(
  query: string,
  options: {
    boardId?: string;
    limit?: number;
  } = {}
): SearchResult[] {
  const { boardId, limit = 25 } = options;

  // Escape special FTS characters and add prefix matching
  const ftsQuery = query
    .replace(/['"]/g, "")
    .split(WHITESPACE_REGEX)
    .filter((w) => w.length > 0)
    .map((word) => `"${word}"*`)
    .join(" ");

  if (ftsQuery.length === 0) {
    return [];
  }

  const boardFilter = boardId ? "AND c.board_id = ?" : "";
  const params = boardId ? [ftsQuery, boardId, limit] : [ftsQuery, limit];

  const rows = db
    .prepare(
      `
    SELECT c.*, fts.rank
    FROM monday_search_vectors fts
    JOIN monday_cache c ON c.id = fts.item_id
    WHERE monday_search_vectors MATCH ?
    ${boardFilter}
    ORDER BY fts.rank
    LIMIT ?
  `
    )
    .all(...params) as FtsRow[];

  return rows.map(mapRowToResult);
}

/**
 * Get item by ID from cache (instant)
 */
export function getItem(itemId: string): SearchResult | null {
  const row = db
    .prepare(
      `
    SELECT * FROM monday_cache WHERE id = ?
  `
    )
    .get(itemId) as CacheRow | undefined;

  return row ? mapRowToResult(row) : null;
}

/**
 * Get items by name (exact or contains match)
 */
export function findByName(
  name: string,
  options: {
    boardId?: string;
    exact?: boolean;
    limit?: number;
  } = {}
): SearchResult[] {
  const { boardId, exact = false, limit = 25 } = options;

  const nameMatch = exact ? "name = ?" : "name LIKE ?";
  const nameParam = exact ? name : `%${name}%`;
  const boardFilter = boardId ? "AND board_id = ?" : "";
  const params = boardId ? [nameParam, boardId, limit] : [nameParam, limit];

  const rows = db
    .prepare(
      `
    SELECT * FROM monday_cache
    WHERE ${nameMatch}
    ${boardFilter}
    ORDER BY updated_at DESC
    LIMIT ?
  `
    )
    .all(...params) as CacheRow[];

  return rows.map(mapRowToResult);
}

/**
 * Get all items from a board (from cache)
 */
export function getBoardItems(
  boardId: string,
  options: {
    groupId?: string;
    limit?: number;
  } = {}
): SearchResult[] {
  const { groupId, limit = 1000 } = options;

  const groupFilter = groupId ? "AND group_id = ?" : "";
  const params = groupId ? [boardId, groupId, limit] : [boardId, limit];

  const rows = db
    .prepare(
      `
    SELECT * FROM monday_cache
    WHERE board_id = ?
    ${groupFilter}
    ORDER BY updated_at DESC
    LIMIT ?
  `
    )
    .all(...params) as CacheRow[];

  return rows.map(mapRowToResult);
}

/**
 * Get board metadata (columns, groups)
 */
export function getBoardMeta(boardId: string): BoardMeta | null {
  const row = db
    .prepare(
      `
    SELECT * FROM monday_board_meta WHERE board_id = ?
  `
    )
    .get(boardId) as
    | {
        board_id: string;
        board_name: string;
        columns: string;
        groups: string;
        synced_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    boardId: row.board_id,
    boardName: row.board_name,
    columns: JSON.parse(row.columns),
    groups: JSON.parse(row.groups),
    syncedAt: row.synced_at,
  };
}

/**
 * List all synced boards with item counts
 */
export function listBoards(): Array<{
  boardId: string;
  boardTitle: string;
  itemCount: number;
  syncedAt: string;
}> {
  const rows = db
    .prepare(
      `
    SELECT
      board_id,
      board_title,
      COUNT(*) as item_count,
      MAX(synced_at) as synced_at
    FROM monday_cache
    GROUP BY board_id
    ORDER BY item_count DESC
  `
    )
    .all() as Array<{
    board_id: string;
    board_title: string;
    item_count: number;
    synced_at: string;
  }>;

  return rows.map((row) => ({
    boardId: row.board_id,
    boardTitle: row.board_title,
    itemCount: row.item_count,
    syncedAt: row.synced_at,
  }));
}

/**
 * Get sync status
 */
export function getSyncStatus(): {
  totalItems: number;
  boards: number;
  oldestSync: string | null;
  newestSync: string | null;
} {
  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total_items,
      COUNT(DISTINCT board_id) as boards,
      MIN(synced_at) as oldest_sync,
      MAX(synced_at) as newest_sync
    FROM monday_cache
  `
    )
    .get() as {
    total_items: number;
    boards: number;
    oldest_sync: string | null;
    newest_sync: string | null;
  };

  return {
    totalItems: stats.total_items,
    boards: stats.boards,
    oldestSync: stats.oldest_sync,
    newestSync: stats.newest_sync,
  };
}
