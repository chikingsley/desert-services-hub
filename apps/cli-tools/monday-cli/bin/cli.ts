#!/usr/bin/env bun
/**
 * Desert Monday CLI
 *
 * Command-line interface for Monday.com operations.
 *
 * Usage:
 *   bun apps/cli-tools/monday-cli/bin/cli.ts <command> [options]
 */
import {
  getItem,
  getItemRich,
  getBoard,
  getBoardColumns,
  searchItems,
  searchByColumnValue,
  updateItem,
} from "@monday/client";

const BOARDS: Record<string, string> = {
  estimating: "7943937851",
  leads: "7943937841",
  projects: "8692330900",
  contacts: "8230498498",
  contractors: "7943937811",
};

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
Desert Monday CLI

Usage: bun apps/cli-tools/monday-cli/bin/cli.ts <command> [options]

Commands:
  get <itemId>                    Get item by ID (rich: linked items, mirrors)
  search <board> <query>          Search items by name on a board
  search-col <board> <colId> <value>  Search by column value
  boards                          List known boards
  columns <board>                 List columns for a board
  groups <board>                  List groups for a board
  update <board> <itemId> <json>  Update item column values

Boards: ${Object.keys(BOARDS).join(", ")}

Examples:
  bun apps/cli-tools/monday-cli/bin/cli.ts get 9758584422
  bun apps/cli-tools/monday-cli/bin/cli.ts search leads "Revolve"
  bun apps/cli-tools/monday-cli/bin/cli.ts columns leads
  bun apps/cli-tools/monday-cli/bin/cli.ts groups estimating
  bun apps/cli-tools/monday-cli/bin/cli.ts update leads 12345 '{"color_mm068kjz":{"label":"Lost"}}'
`);
}

function resolveBoardId(nameOrId: string): string {
  return BOARDS[nameOrId.toLowerCase()] ?? nameOrId;
}

function formatItem(item: { id: string; name: string; groupTitle?: string; columns?: Record<string, string | null>; columnValues?: Array<{ id: string; type: string; text: string | null; value: string | null; linkedItemIds?: string[]; displayValue?: string }> }) {
  console.log(`\n${item.name} (${item.id})`);
  if (item.groupTitle) console.log(`  Group: ${item.groupTitle}`);
  if (item.columnValues) {
    for (const col of item.columnValues) {
      const display = col.displayValue || col.text || col.value;
      if (!display) continue;
      const linked = col.linkedItemIds?.length ? ` [linked: ${col.linkedItemIds.join(", ")}]` : "";
      console.log(`  ${col.id} (${col.type}): ${display}${linked}`);
    }
  } else if (item.columns) {
    for (const [colId, val] of Object.entries(item.columns)) {
      if (!val) continue;
      console.log(`  ${colId}: ${val}`);
    }
  }
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  switch (command) {
    case "get": {
      const itemId = args[1];
      if (!itemId) {
        console.error("Usage: get <itemId>");
        process.exit(1);
      }
      const item = await getItemRich(itemId);
      if (!item) {
        console.error(`Item ${itemId} not found`);
        process.exit(1);
      }
      formatItem(item);
      break;
    }

    case "search": {
      const boardName = args[1];
      const query = args[2];
      if (!boardName || !query) {
        console.error("Usage: search <board> <query>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const items = await searchItems(boardId, query);
      console.log(`Found ${items.length} results:`);
      for (const item of items) {
        console.log(`  ${item.id}: ${item.name} (${item.groupTitle})`);
      }
      break;
    }

    case "search-col": {
      const boardName = args[1];
      const colId = args[2];
      const value = args[3];
      if (!boardName || !colId || !value) {
        console.error("Usage: search-col <board> <colId> <value>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const items = await searchByColumnValue(boardId, colId, value);
      console.log(`Found ${items.length} results:`);
      for (const item of items) {
        formatItem(item);
      }
      break;
    }

    case "boards": {
      console.log("Known boards:");
      for (const [name, id] of Object.entries(BOARDS)) {
        console.log(`  ${name}: ${id}`);
      }
      break;
    }

    case "columns": {
      const boardName = args[1];
      if (!boardName) {
        console.error("Usage: columns <board>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const columns = await getBoardColumns(boardId);
      for (const col of columns) {
        console.log(`  ${col.id} (${col.type}): ${col.title}`);
      }
      break;
    }

    case "groups": {
      const boardName = args[1];
      if (!boardName) {
        console.error("Usage: groups <board>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const board = await getBoard(boardId);
      if (!board) {
        console.error(`Board ${boardId} not found`);
        process.exit(1);
      }
      console.log(`${board.name} groups:`);
      for (const g of board.groups) {
        console.log(`  ${g.id}: ${g.title}`);
      }
      break;
    }

    case "update": {
      const boardName = args[1];
      const itemId = args[2];
      const jsonStr = args[3];
      if (!boardName || !itemId || !jsonStr) {
        console.error("Usage: update <board> <itemId> '<json>'");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const columnValues = JSON.parse(jsonStr);
      await updateItem({ boardId, itemId, columnValues, createLabelsIfMissing: true });
      console.log(`Updated item ${itemId}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
