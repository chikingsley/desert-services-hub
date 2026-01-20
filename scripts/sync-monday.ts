import { BOARD_IDS } from "../services/monday/types";
import { db } from "../lib/db";

/**
 * Monday.com Sync Script
 *
 * Syncs Monday.com boards to local SQLite for instant queries.
 * Usage: bun scripts/sync-monday.ts [--boards=all|crm|wm] [--board=BOARD_NAME]
 *
 * Options:
 *   --boards=all   Sync all boards (CRM + Work Management)
 *   --boards=crm   Sync CRM boards only (Estimating, Leads, Contractors, Contacts)
 *   --boards=wm    Sync Work Management boards only (Open Bids, Bids Sent, etc.)
 *   --board=NAME   Sync a specific board by name (e.g., --board=ESTIMATING)
 */

// Board groups for selective sync
const BOARD_GROUPS = {
  crm: [
    BOARD_IDS.ESTIMATING,
    BOARD_IDS.LEADS,
    BOARD_IDS.CONTRACTORS,
    BOARD_IDS.CONTACTS,
    BOARD_IDS.PROJECTS,
    BOARD_IDS.INSPECTION_REPORTS,
  ],
  wm: [
    BOARD_IDS.OPEN_BIDS,
    BOARD_IDS.BIDS_SENT,
    BOARD_IDS.CHECKLIST,
    BOARD_IDS.DUST_PERMITS_WM,
    BOARD_IDS.SIGNAGE,
    BOARD_IDS.SWPPP_MASTER,
    BOARD_IDS.INSPECTIONS_WM,
  ],
  all: [
    // CRM
    BOARD_IDS.ESTIMATING,
    BOARD_IDS.LEADS,
    BOARD_IDS.CONTRACTORS,
    BOARD_IDS.CONTACTS,
    BOARD_IDS.PROJECTS,
    BOARD_IDS.INSPECTION_REPORTS,
    // Work Management
    BOARD_IDS.OPEN_BIDS,
    BOARD_IDS.BIDS_SENT,
    BOARD_IDS.CHECKLIST,
    BOARD_IDS.DUST_PERMITS_WM,
    BOARD_IDS.SIGNAGE,
    BOARD_IDS.SWPPP_MASTER,
    BOARD_IDS.INSPECTIONS_WM,
    // Other
    BOARD_IDS.INCOMING_CALLS,
    BOARD_IDS.FIELD_OPPORTUNITIES,
  ],
} as const;

// Garbage filters
const GARBAGE_NAME_PATTERNS = [
  "COPY",
  "DUPLICATE",
  "TEMPLATE",
  "TEST",
  "_DELETE",
];
const EXCLUDED_GROUPS = [
  "HISTORIC",
  "ARCHIVE",
  "COMPLETED",
  "HISTORIC DATA",
  "SHELL ESTIMATES",
];

// High-value column patterns for FTS indexing
const HIGH_VALUE_PATTERNS = [
  "text",
  "numbers",
  "deal_",
  "estimate",
  "name",
  "email",
  "phone",
  "address",
  "location",
];

async function queryMonday(graphqlQuery: string) {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.MONDAY_API_KEY as string,
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query: graphqlQuery }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

type BoardMetadata = {
  name: string;
  columns: Array<{ id: string; title: string; type: string }>;
  groups: Array<{ id: string; title: string }>;
};

async function fetchBoardMetadata(boardId: string): Promise<BoardMetadata> {
  const result = await queryMonday(`
    query {
      boards(ids: ${boardId}) {
        name
        columns {
          id
          title
          type
        }
        groups {
          id
          title
        }
      }
    }
  `);
  const board = result.boards[0];
  return {
    name: board?.name || "Unknown Board",
    columns: board?.columns || [],
    groups: board?.groups || [],
  };
}

type MondayItem = {
  id: string;
  name: string;
  group: { id: string; title: string };
  created_at: string;
  updated_at: string;
  column_values: Array<{
    id: string;
    text: string;
    value: string;
    display_value?: string;
  }>;
};

async function fetchBoardItems(boardId: string): Promise<MondayItem[]> {
  const allItems: MondayItem[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const cursorParam = cursor ? `, cursor: "${cursor}"` : "";
    const result = await queryMonday(`
      query {
        boards(ids: ${boardId}) {
          items_page(limit: 500${cursorParam}) {
            cursor
            items {
              id
              name
              group {
                id
                title
              }
              created_at
              updated_at
              column_values {
                id
                text
                value
                ... on BoardRelationValue {
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

    const page = result.boards[0].items_page;
    allItems.push(...page.items);
    cursor = page.cursor;
    pageCount++;

    // Progress indicator for large boards
    if (pageCount % 5 === 0) {
      process.stdout.write(`  ...fetched ${allItems.length} items\r`);
    }
  } while (cursor);

  return allItems;
}

function isGarbage(name: string, groupTitle: string): boolean {
  if (!name || name.trim().length === 0) return true;

  const upperName = name.toUpperCase();
  if (GARBAGE_NAME_PATTERNS.some((p) => upperName.includes(p))) return true;

  const upperGroup = groupTitle.toUpperCase();
  if (EXCLUDED_GROUPS.some((p) => upperGroup.includes(p))) return true;

  return false;
}

function isHighValueColumn(columnId: string): boolean {
  return HIGH_VALUE_PATTERNS.some((p) => columnId.includes(p));
}

// Ensure board metadata table exists
function ensureBoardMetaTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS monday_board_meta (
      board_id TEXT PRIMARY KEY,
      board_name TEXT NOT NULL,
      columns TEXT NOT NULL,
      groups TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function syncBoard(boardId: string) {
  const startTime = Date.now();

  // Fetch metadata and items in parallel
  const [metadata, items] = await Promise.all([
    fetchBoardMetadata(boardId),
    fetchBoardItems(boardId),
  ]);

  process.stdout.write(
    `Processing ${items.length} items from "${metadata.name}" (${boardId})...\n`
  );

  // Save board metadata
  const saveMeta = db.prepare(`
    INSERT OR REPLACE INTO monday_board_meta
    (board_id, board_name, columns, groups, synced_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  saveMeta.run(
    boardId,
    metadata.name,
    JSON.stringify(metadata.columns),
    JSON.stringify(metadata.groups)
  );

  // Prepare statements
  const insertCache = db.prepare(`
    INSERT OR REPLACE INTO monday_cache
    (id, board_id, board_title, name, group_id, group_title, column_values, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertFTS = db.prepare(`
    INSERT INTO monday_search_vectors (item_id, board_id, name, content)
    VALUES (?, ?, ?, ?)
  `);

  const clearFTS = db.prepare(`
    DELETE FROM monday_search_vectors WHERE board_id = ?
  `);

  let syncCount = 0;
  let filteredCount = 0;

  db.transaction(() => {
    clearFTS.run(boardId);

    for (const item of items) {
      if (isGarbage(item.name, item.group.title)) {
        filteredCount++;
        continue;
      }

      // Build column values and search content
      const columnValues: Record<string, string> = {};
      const searchTerms: string[] = [item.name, item.group.title];

      for (const cv of item.column_values) {
        const textValue = cv.text || cv.display_value || "";
        columnValues[cv.id] = textValue;

        // Include high-value columns in FTS
        if (textValue && isHighValueColumn(cv.id)) {
          searchTerms.push(textValue);
        }
      }

      insertCache.run(
        item.id,
        boardId,
        metadata.name,
        item.name,
        item.group.id,
        item.group.title,
        JSON.stringify(columnValues),
        item.created_at,
        item.updated_at
      );

      insertFTS.run(item.id, boardId, item.name, searchTerms.join(" "));
      syncCount++;
    }
  })();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write(
    `  Synced ${syncCount} items (filtered ${filteredCount}) in ${elapsed}s\n`
  );

  return { syncCount, filteredCount };
}

function parseArgs(): { boards: string[]; verbose: boolean } {
  const args = process.argv.slice(2);
  let boardGroup: keyof typeof BOARD_GROUPS = "all";
  let specificBoard: string | null = null;
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith("--boards=")) {
      const group = arg.split("=")[1] as keyof typeof BOARD_GROUPS;
      if (group in BOARD_GROUPS) {
        boardGroup = group;
      }
    } else if (arg.startsWith("--board=")) {
      specificBoard = arg.split("=")[1].toUpperCase();
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    }
  }

  // Specific board takes precedence
  if (specificBoard && specificBoard in BOARD_IDS) {
    return {
      boards: [BOARD_IDS[specificBoard as keyof typeof BOARD_IDS]],
      verbose,
    };
  }

  return { boards: [...BOARD_GROUPS[boardGroup]], verbose };
}

async function main() {
  if (!process.env.MONDAY_API_KEY) {
    process.stderr.write("Error: MONDAY_API_KEY not set\n");
    process.exit(1);
  }

  const { boards, verbose } = parseArgs();

  process.stdout.write(`\nMonday.com Sync - ${boards.length} boards\n\n`);

  // Ensure metadata table exists
  ensureBoardMetaTable();

  const startTime = Date.now();
  let totalSynced = 0;
  let totalFiltered = 0;

  for (const boardId of boards) {
    try {
      const { syncCount, filteredCount } = await syncBoard(boardId);
      totalSynced += syncCount;
      totalFiltered += filteredCount;
    } catch (error) {
      process.stderr.write(`  Failed to sync board ${boardId}: ${error}\n`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write(
    `\nSync complete: ${totalSynced} items in ${elapsed}s\n`
  );
  process.stdout.write(`(${totalFiltered} garbage items filtered)\n\n`);

  // Show stats
  if (verbose) {
    const stats = db
      .prepare(
        `
      SELECT board_title, COUNT(*) as count
      FROM monday_cache
      GROUP BY board_id
      ORDER BY count DESC
    `
      )
      .all();

    process.stdout.write("Board breakdown:\n");
    for (const row of stats as Array<{ board_title: string; count: number }>) {
      process.stdout.write(`  ${row.board_title}: ${row.count}\n`);
    }
  }
}

main();
