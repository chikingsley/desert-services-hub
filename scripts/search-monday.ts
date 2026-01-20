import { BOARD_IDS } from "../services/monday/types";
import {
  findByName,
  getItem,
  getSyncStatus,
  listBoards,
  search,
} from "../lib/monday-search";

/**
 * Monday.com Local Search CLI
 *
 * Usage:
 *   bun scripts/search-monday.ts <query>              # Full-text search
 *   bun scripts/search-monday.ts --id <itemId>        # Get item by ID
 *   bun scripts/search-monday.ts --name <name>        # Find by name
 *   bun scripts/search-monday.ts --board <BOARD>      # Filter by board
 *   bun scripts/search-monday.ts --list               # List all boards
 *   bun scripts/search-monday.ts --status             # Show sync status
 */

function formatResult(
  result: ReturnType<typeof search>[number],
  verbose: boolean
): string {
  const lines = [
    `[${result.id}] ${result.name}`,
    `  Board: ${result.boardTitle} | Group: ${result.groupTitle}`,
    `  URL: ${result.url}`,
  ];

  if (verbose) {
    const cols = result.columnValues;
    const importantCols = Object.entries(cols)
      .filter(([_, v]) => v && v.trim().length > 0)
      .slice(0, 5);
    if (importantCols.length > 0) {
      lines.push(
        `  Columns: ${importantCols.map(([k, v]) => `${k}="${v}"`).join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stdout.write(`
Monday.com Local Search

Usage:
  bun scripts/search-monday.ts <query>              # Full-text search
  bun scripts/search-monday.ts --id <itemId>        # Get item by ID
  bun scripts/search-monday.ts --name <name>        # Find by name
  bun scripts/search-monday.ts --board <BOARD>      # Filter by board
  bun scripts/search-monday.ts --list               # List all boards
  bun scripts/search-monday.ts --status             # Show sync status

Examples:
  bun scripts/search-monday.ts "Phoenix Storage"
  bun scripts/search-monday.ts --board ESTIMATING "Weis"
  bun scripts/search-monday.ts --id 1234567890
`);
    return;
  }

  // Parse args
  let boardId: string | undefined;
  let itemId: string | undefined;
  let nameSearch: string | undefined;
  let showList = false;
  let showStatus = false;
  let verbose = false;
  let limit = 25;
  const queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--board" || arg === "-b") {
      const boardName = args[++i]?.toUpperCase();
      if (boardName && boardName in BOARD_IDS) {
        boardId = BOARD_IDS[boardName as keyof typeof BOARD_IDS];
      }
    } else if (arg === "--id") {
      itemId = args[++i];
    } else if (arg === "--name") {
      nameSearch = args[++i];
    } else if (arg === "--list" || arg === "-l") {
      showList = true;
    } else if (arg === "--status" || arg === "-s") {
      showStatus = true;
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--limit") {
      limit = Number.parseInt(args[++i], 10) || 25;
    } else if (arg.startsWith("--")) {
      // Skip unknown flags
    } else {
      queryParts.push(arg);
    }
  }

  const startTime = performance.now();

  // Handle special commands
  if (showStatus) {
    const status = getSyncStatus();
    process.stdout.write(`
Sync Status:
  Total items: ${status.totalItems}
  Boards: ${status.boards}
  Oldest sync: ${status.oldestSync || "N/A"}
  Newest sync: ${status.newestSync || "N/A"}
`);
    return;
  }

  if (showList) {
    const boards = listBoards();
    process.stdout.write("\nSynced Boards:\n");
    for (const board of boards) {
      process.stdout.write(
        `  ${board.boardTitle.padEnd(25)} ${String(board.itemCount).padStart(6)} items  (synced: ${board.syncedAt})\n`
      );
    }
    process.stdout.write(
      `\nTotal: ${boards.reduce((sum, b) => sum + b.itemCount, 0)} items\n`
    );
    return;
  }

  if (itemId) {
    const result = getItem(itemId);
    if (result) {
      process.stdout.write(`\n${formatResult(result, true)}\n`);
    } else {
      process.stdout.write(`Item not found: ${itemId}\n`);
    }
    return;
  }

  if (nameSearch) {
    const results = findByName(nameSearch, { boardId, limit });
    const elapsed = (performance.now() - startTime).toFixed(2);
    process.stdout.write(
      `\nFound ${results.length} items matching "${nameSearch}" (${elapsed}ms)\n\n`
    );
    for (const result of results) {
      process.stdout.write(`${formatResult(result, verbose)}\n\n`);
    }
    return;
  }

  // Full-text search
  const query = queryParts.join(" ");
  if (query.length === 0) {
    process.stdout.write("Error: No search query provided\n");
    process.exit(1);
  }

  const results = search(query, { boardId, limit });
  const elapsed = (performance.now() - startTime).toFixed(2);

  process.stdout.write(
    `\nFound ${results.length} results for "${query}" (${elapsed}ms)\n\n`
  );

  for (const result of results) {
    process.stdout.write(`${formatResult(result, verbose)}\n\n`);
  }
}

main();
