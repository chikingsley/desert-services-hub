#!/usr/bin/env bun

/**
 * Monday.com CLI
 *
 * Usage:
 *   bun services/monday/cli.ts <command> [args] [options]
 *
 * Commands:
 *   boards                     List available board IDs
 *   columns <board>            Show board schema (columns)
 *   get <itemId>               Get a single item by ID
 *   items <board> [filters]    Get all items from a board
 *   search <board> <term>      Fuzzy search items by name
 *   create <board> [options]   Create a new item
 *   update <itemId> [options]  Update an item's columns
 *
 * Filter options for 'items':
 *   --contains <col>=<value>   Column contains value
 *   --empty <col>              Column is empty
 *   --not-empty <col>          Column is not empty
 *   --group <groupId>          Filter by group ID
 *   --limit <n>                Limit number of results
 *
 * Create options:
 *   --name <name>              Item name (required)
 *   --group <groupId>          Group to create in
 *   --col <key>=<value>        Set column value (can repeat)
 *
 * Update options:
 *   --board <board>            Board ID (required)
 *   --col <key>=<value>        Set column value (can repeat)
 *
 * Examples:
 *   bun services/monday/cli.ts boards
 *   bun services/monday/cli.ts columns ESTIMATING
 *   bun services/monday/cli.ts get 12345
 *   bun services/monday/cli.ts items LEADS --limit 10
 *   bun services/monday/cli.ts items ESTIMATING --contains status=Done
 *   bun services/monday/cli.ts search ESTIMATING "Phoenix"
 *   bun services/monday/cli.ts create LEADS --name "New Lead" --col status=New
 *   bun services/monday/cli.ts update 12345 --board LEADS --col status=Done
 */

import {
  createItem,
  findBestMatches,
  getBoard,
  getBoardColumns,
  getItem,
  getItems,
  renameItem,
  searchItems,
  updateItem,
} from "./client";
import type { MondayItem } from "./types";
import { BOARD_COLUMNS, BOARD_IDS, getColumnId } from "./types";

// ============================================================================
// Argument Parsing
// ============================================================================

/**
 * Parsed command-line arguments structure.
 */
interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | string[] | boolean>;
}

/**
 * Internal type for flags storage during parsing.
 */
type FlagsRecord = Record<string, string | string[] | boolean>;

/**
 * Adds a value to a repeatable flag (like --col which can be specified multiple times).
 * Converts single values to arrays when a flag is repeated.
 *
 * @param flags - The flags object to modify
 * @param key - The flag name
 * @param value - The value to add
 *
 * @example
 * const flags = {};
 * addRepeatableFlag(flags, "col", "status=Done");
 * addRepeatableFlag(flags, "col", "priority=High");
 * // flags.col is now ["status=Done", "priority=High"]
 */
function addRepeatableFlag(
  flags: FlagsRecord,
  key: string,
  value: string
): void {
  const existing = flags[key];
  if (Array.isArray(existing)) {
    existing.push(value);
  } else if (typeof existing === "string") {
    flags[key] = [existing, value];
  } else {
    flags[key] = [value];
  }
}

/**
 * Parses a single flag from the argument array.
 * Handles both boolean flags (--fuzzy) and value flags (--limit 10).
 *
 * @param args - The full arguments array
 * @param index - Current position in the array
 * @param flags - The flags object to populate
 * @returns The new index position after parsing the flag
 */
function parseFlag(args: string[], index: number, flags: FlagsRecord): number {
  const arg = args[index];
  if (!arg) {
    return index + 1;
  }
  const key = arg.slice(2);
  const nextArg = args[index + 1];
  const hasValue = nextArg && !nextArg.startsWith("--");

  if (hasValue) {
    if (key === "col") {
      addRepeatableFlag(flags, key, nextArg);
    } else {
      flags[key] = nextArg;
    }
    return index + 2;
  }

  flags[key] = true;
  return index + 1;
}

/**
 * Parses command-line arguments into a structured format.
 * Supports commands, positional arguments, and flags with values.
 *
 * @param args - Array of command-line arguments (typically process.argv.slice(2))
 * @returns Parsed arguments with command, positional args, and flags
 *
 * @example
 * parseArgs(["search", "ESTIMATING", "Phoenix", "--limit", "10"]);
 * // Returns: { command: "search", positional: ["ESTIMATING", "Phoenix"], flags: { limit: "10" } }
 *
 * @example
 * parseArgs(["create", "LEADS", "--name", "Test", "--col", "status=New"]);
 * // Returns: { command: "create", positional: ["LEADS"], flags: { name: "Test", col: ["status=New"] } }
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0] ?? "",
    positional: [],
    flags: {},
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      i = parseFlag(args, i, result.flags);
    } else {
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
}

// ============================================================================
// Board ID Resolution
// ============================================================================

/**
 * Valid board names that can be used instead of numeric IDs.
 */
type BoardName = keyof typeof BOARD_IDS;

/**
 * Boards that have column alias definitions.
 */
type ColumnBoardName = keyof typeof BOARD_COLUMNS;

/**
 * Resolves a board reference to its numeric ID.
 * Accepts either a board name (e.g., "ESTIMATING") or a raw board ID.
 * Board names are case-insensitive.
 *
 * @param boardRef - A board name or numeric board ID
 * @returns The numeric board ID
 *
 * @example
 * resolveBoardId("ESTIMATING");     // "7943937851"
 * resolveBoardId("estimating");     // "7943937851"
 * resolveBoardId("7943937851");     // "7943937851"
 */
export function resolveBoardId(boardRef: string): string {
  // If it's a board name, look it up
  const upperRef = boardRef.toUpperCase() as BoardName;
  if (upperRef in BOARD_IDS) {
    return BOARD_IDS[upperRef];
  }

  // Otherwise treat it as a raw board ID
  return boardRef;
}

/**
 * Converts a board reference to its canonical board name.
 * Returns null if the reference is not a known board name.
 *
 * @param boardRef - A board name or ID to look up
 * @returns The canonical board name or null if not found
 *
 * @example
 * resolveBoardName("estimating");   // "ESTIMATING"
 * resolveBoardName("LEADS");        // "LEADS"
 * resolveBoardName("7943937851");   // null (IDs don't resolve to names)
 */
export function resolveBoardName(boardRef: string): BoardName | null {
  const upperRef = boardRef.toUpperCase() as BoardName;
  if (upperRef in BOARD_IDS) {
    return upperRef;
  }
  return null;
}

/**
 * Resolves a column reference to its Monday.com column ID.
 * Supports friendly column names (e.g., "CONTRACTOR") for boards that have
 * column definitions in types.ts. Falls back to the raw value if not found.
 *
 * @param boardRef - The board name or ID (used to look up column definitions)
 * @param columnRef - A column name alias or raw column ID
 * @returns The Monday.com column ID
 *
 * @example
 * resolveColumnId("ESTIMATING", "CONTRACTOR");    // "deal_account"
 * resolveColumnId("ESTIMATING", "PLANS");         // "file_mkseqmab"
 * resolveColumnId("ESTIMATING", "deal_account");  // "deal_account" (pass-through)
 * resolveColumnId("LEADS", "status");             // "status" (no aliases defined)
 */
export function resolveColumnId(boardRef: string, columnRef: string): string {
  const boardName = resolveBoardName(boardRef);
  if (boardName && boardName in BOARD_COLUMNS) {
    const resolved = getColumnId(boardName as ColumnBoardName, columnRef);
    if (resolved) {
      return resolved;
    }
  }
  // Return as-is if not found (might be raw column ID)
  return columnRef;
}

// ============================================================================
// Filter Logic
// ============================================================================

/**
 * Filter definition for filtering Monday.com items.
 * Supports filtering by column value, empty/non-empty columns, and group membership.
 */
export interface ItemFilter {
  type: "contains" | "empty" | "not-empty" | "group";
  column?: string;
  value?: string;
}

/**
 * Parses CLI flags into filter definitions.
 * Supports column name aliases when boardRef is provided.
 *
 * @param flags - Parsed CLI flags object
 * @param boardRef - Optional board reference for resolving column aliases
 * @returns Array of filter definitions
 *
 * @example
 * // CLI: --contains CONTRACTOR=Acme
 * parseFilters({ contains: "CONTRACTOR=Acme" }, "ESTIMATING");
 * // Returns: [{ type: "contains", column: "deal_account", value: "Acme" }]
 *
 * @example
 * // CLI: --empty PLANS --group new_group
 * parseFilters({ empty: "PLANS", group: "new_group" }, "ESTIMATING");
 * // Returns: [{ type: "empty", column: "file_mkseqmab" }, { type: "group", value: "new_group" }]
 */
export function parseFilters(
  flags: Record<string, string | string[] | boolean>,
  boardRef?: string
): ItemFilter[] {
  const filters: ItemFilter[] = [];

  // --contains col=value (col can be friendly name like CONTRACTOR)
  const contains = flags.contains;
  if (typeof contains === "string") {
    const [col = "", ...rest] = contains.split("=");
    const resolvedCol = boardRef ? resolveColumnId(boardRef, col) : col;
    filters.push({
      type: "contains",
      column: resolvedCol,
      value: rest.join("="),
    });
  }

  // --empty col
  const empty = flags.empty;
  if (typeof empty === "string") {
    const resolvedCol = boardRef ? resolveColumnId(boardRef, empty) : empty;
    filters.push({ type: "empty", column: resolvedCol });
  }

  // --not-empty col
  const notEmpty = flags["not-empty"];
  if (typeof notEmpty === "string") {
    const resolvedCol = boardRef
      ? resolveColumnId(boardRef, notEmpty)
      : notEmpty;
    filters.push({ type: "not-empty", column: resolvedCol });
  }

  // --group groupId
  const group = flags.group;
  if (typeof group === "string") {
    filters.push({ type: "group", value: group });
  }

  return filters;
}

/**
 * Filters items where a column value contains the specified string (case-insensitive).
 */
function filterContains(
  items: MondayItem[],
  col: string,
  val: string
): MondayItem[] {
  const lowerVal = val.toLowerCase();
  return items.filter((item) => {
    const colValue = item.columns[col] ?? "";
    return colValue.toLowerCase().includes(lowerVal);
  });
}

/**
 * Filters items where a column value is empty or whitespace-only.
 */
function filterEmpty(items: MondayItem[], col: string): MondayItem[] {
  return items.filter((item) => {
    const colValue = item.columns[col] ?? "";
    return colValue.trim() === "";
  });
}

/**
 * Filters items where a column value is not empty.
 */
function filterNotEmpty(items: MondayItem[], col: string): MondayItem[] {
  return items.filter((item) => {
    const colValue = item.columns[col] ?? "";
    return colValue.trim() !== "";
  });
}

/**
 * Filters items by group ID or group title (case-insensitive partial match on title).
 */
function filterGroup(items: MondayItem[], groupId: string): MondayItem[] {
  const lowerGroupId = groupId.toLowerCase();
  return items.filter(
    (item) =>
      item.groupId.toLowerCase() === lowerGroupId ||
      item.groupTitle.toLowerCase().includes(lowerGroupId)
  );
}

/**
 * Applies a single filter to items based on filter type.
 */
function applySingleFilter(
  items: MondayItem[],
  filter: ItemFilter
): MondayItem[] {
  switch (filter.type) {
    case "contains":
      return filter.column && filter.value
        ? filterContains(items, filter.column, filter.value)
        : items;
    case "empty":
      return filter.column ? filterEmpty(items, filter.column) : items;
    case "not-empty":
      return filter.column ? filterNotEmpty(items, filter.column) : items;
    case "group":
      return filter.value ? filterGroup(items, filter.value) : items;
    default:
      return items;
  }
}

/**
 * Applies multiple filters to items (AND logic - all filters must match).
 *
 * @param items - Array of Monday items to filter
 * @param filters - Array of filter definitions to apply
 * @returns Filtered array of items matching all filters
 *
 * @example
 * const filters = [
 *   { type: "contains", column: "deal_account", value: "Acme" },
 *   { type: "group", value: "active_bids" }
 * ];
 * const filtered = applyFilters(items, filters);
 * // Returns items where contractor contains "Acme" AND group is "active_bids"
 */
export function applyFilters(
  items: MondayItem[],
  filters: ItemFilter[]
): MondayItem[] {
  let result = items;
  for (const filter of filters) {
    result = applySingleFilter(result, filter);
  }
  return result;
}

// ============================================================================
// Column Value Parsing
// ============================================================================

/**
 * Parses --col flags into a column values object for create/update operations.
 * Supports JSON values for complex column types (e.g., status, date).
 *
 * @param colFlags - The --col flag value(s) from CLI parsing
 * @returns Object mapping column IDs to values
 *
 * @example
 * parseColumnValues(["status=Done", "priority=High"]);
 * // Returns: { status: "Done", priority: "High" }
 *
 * @example
 * parseColumnValues(['data={"label":"In Progress"}']);
 * // Returns: { data: { label: "In Progress" } }
 *
 * @example
 * parseColumnValues("status=New");
 * // Returns: { status: "New" }
 */
export function parseColumnValues(
  colFlags: string | string[] | boolean | undefined
): Record<string, unknown> {
  if (!colFlags) {
    return {};
  }

  const cols = Array.isArray(colFlags) ? colFlags : [colFlags];
  const result: Record<string, unknown> = {};

  for (const col of cols) {
    if (typeof col !== "string") {
      continue;
    }
    const eqIndex = col.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = col.slice(0, eqIndex);
    const value = col.slice(eqIndex + 1);

    // Try to parse JSON for complex values, otherwise use string
    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Formats a Monday item for detailed output display.
 * Shows ID, name, group, URL, and all non-empty column values.
 *
 * @param item - The Monday item to format
 * @returns Multi-line formatted string
 */
function formatItem(item: MondayItem): string {
  const lines = [
    `ID: ${item.id}`,
    `Name: ${item.name}`,
    `Group: ${item.groupTitle} (${item.groupId})`,
    `URL: ${item.url}`,
    "Columns:",
  ];

  for (const [key, value] of Object.entries(item.columns)) {
    if (value) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats a Monday item for compact tab-separated output.
 * Shows only ID, name, and group title.
 *
 * @param item - The Monday item to format
 * @returns Tab-separated string: "ID\tName\tGroup"
 */
function formatItemCompact(item: MondayItem): string {
  return `${item.id}\t${item.name}\t${item.groupTitle}`;
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Lists all available board names and their IDs.
 *
 * @example
 * // CLI: bun services/monday/cli.ts boards
 * cmdBoards();
 */
function cmdBoards(): void {
  console.log("Available boards:\n");
  for (const [name, id] of Object.entries(BOARD_IDS)) {
    console.log(`  ${name.padEnd(20)} ${id}`);
  }
}

/**
 * Shows detailed board schema including columns, groups, and aliases.
 *
 * @param boardRef - Board name or ID to inspect
 * @returns Promise that resolves when output is displayed
 *
 * @example
 * // CLI: bun services/monday/cli.ts columns ESTIMATING
 * await cmdColumns("ESTIMATING");
 */
async function cmdColumns(boardRef: string): Promise<void> {
  const boardId = resolveBoardId(boardRef);
  const columns = await getBoardColumns(boardId);
  const board = await getBoard(boardId);

  console.log(`Board: ${board?.name ?? boardId}\n`);
  console.log("Columns:");
  for (const col of columns) {
    console.log(`  ${col.id.padEnd(25)} ${col.title.padEnd(30)} (${col.type})`);
  }

  if (board?.groups.length) {
    console.log("\nGroups:");
    for (const group of board.groups) {
      console.log(`  ${group.id.padEnd(25)} ${group.title}`);
    }
  }

  // Show column aliases if available
  const boardName = resolveBoardName(boardRef);
  if (boardName && boardName in BOARD_COLUMNS) {
    const aliases = BOARD_COLUMNS[boardName as ColumnBoardName];
    console.log("\nColumn Aliases (use these in --contains, --empty, etc.):");
    for (const [alias, def] of Object.entries(aliases)) {
      console.log(`  ${alias.padEnd(20)} → ${def.id.padEnd(25)} (${def.type})`);
    }
  }
}

/**
 * Shows available column aliases for a board in a compact format.
 * Only boards with defined column constants (ESTIMATING, CONTACTS) have aliases.
 *
 * @param boardRef - Board name to show aliases for
 *
 * @example
 * // CLI: bun services/monday/cli.ts cols ESTIMATING
 * cmdCols("ESTIMATING");
 */
function cmdCols(boardRef: string): void {
  const boardName = resolveBoardName(boardRef);
  if (!(boardName && boardName in BOARD_COLUMNS)) {
    console.log(`No column aliases defined for ${boardRef}`);
    console.log("Available boards with aliases: ESTIMATING, CONTACTS");
    return;
  }

  const aliases = BOARD_COLUMNS[boardName as ColumnBoardName];
  console.log(`Column aliases for ${boardName}:\n`);
  console.log("Alias                → Column ID                 Type");
  console.log("─".repeat(65));
  for (const [alias, def] of Object.entries(aliases)) {
    console.log(`${alias.padEnd(20)} → ${def.id.padEnd(25)} ${def.type}`);
  }
  console.log("\nUsage: --contains CONTRACTOR=Acme");
}

/**
 * Displays file column values for an item.
 * Only shows file-type columns that have values.
 *
 * @param item - The Monday item to display files for
 * @param boardRef - Board reference for looking up column aliases
 */
function displayFileColumns(item: MondayItem, boardRef: string): void {
  const boardName = resolveBoardName(boardRef);
  if (!(boardName && boardName in BOARD_COLUMNS)) {
    return;
  }

  const aliases = BOARD_COLUMNS[boardName as ColumnBoardName];
  for (const [alias, def] of Object.entries(aliases)) {
    if (def.type !== "file") {
      continue;
    }
    const fileValue = item.columns[def.id];
    if (fileValue) {
      console.log(`  ${alias}: ${fileValue}`);
    }
  }
}

/**
 * Displays a single found item with optional file column info.
 *
 * @param item - The Monday item to display
 * @param boardRef - Board reference for looking up column aliases
 * @param showFiles - Whether to show file column values
 */
function displayFoundItem(
  item: MondayItem,
  boardRef: string,
  showFiles: boolean
): void {
  console.log(`${item.id}\t${item.name}`);
  console.log(`  URL: ${item.url}`);
  if (showFiles) {
    displayFileColumns(item, boardRef);
  }
  console.log();
}

/**
 * Searches for items and displays results with optional file info.
 * Useful for finding items and getting their file attachment URLs.
 *
 * @param boardRef - Board name or ID to search
 * @param searchTerm - Text to search for in item names
 * @param flags - CLI flags (--files to show file columns, --limit for max results)
 * @returns Promise that resolves when output is displayed
 *
 * @example
 * // CLI: bun services/monday/cli.ts find ESTIMATING "Phoenix" --files --limit 10
 * await cmdFind("ESTIMATING", "Phoenix", { files: true, limit: "10" });
 */
async function cmdFind(
  boardRef: string,
  searchTerm: string,
  flags: Record<string, string | string[] | boolean>
): Promise<void> {
  const boardId = resolveBoardId(boardRef);
  const showFiles = flags.files === true;
  const limit =
    typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : 5;

  const items = await searchItems(boardId, searchTerm);
  const limitedItems = items.slice(0, limit);

  if (limitedItems.length === 0) {
    console.log(`No items found matching "${searchTerm}"`);
    return;
  }

  console.log(
    `Found ${items.length} items (showing ${limitedItems.length}):\n`
  );

  for (const item of limitedItems) {
    displayFoundItem(item, boardRef, showFiles);
  }
}

/**
 * Retrieves and displays a single item by ID.
 *
 * @param itemId - The Monday item ID to retrieve
 * @returns Promise that resolves when output is displayed
 *
 * @example
 * // CLI: bun services/monday/cli.ts get 12345
 * await cmdGet("12345");
 */
async function cmdGet(itemId: string): Promise<void> {
  const item = await getItem(itemId);
  if (!item) {
    console.error(`Item ${itemId} not found`);
    process.exit(1);
  }
  console.log(formatItem(item));
}

/**
 * Lists items from a board with optional filtering.
 * Supports --contains, --empty, --not-empty, --group, --limit, and --compact flags.
 *
 * @param boardRef - Board name or ID to list items from
 * @param flags - CLI flags for filtering and output format
 * @returns Promise that resolves when output is displayed
 *
 * @example
 * // CLI: bun services/monday/cli.ts items ESTIMATING --contains CONTRACTOR=Acme --limit 10
 * await cmdItems("ESTIMATING", { contains: "CONTRACTOR=Acme", limit: "10" });
 */
async function cmdItems(
  boardRef: string,
  flags: Record<string, string | string[] | boolean>
): Promise<void> {
  const boardId = resolveBoardId(boardRef);
  const filters = parseFilters(flags, boardRef);
  const limit =
    typeof flags.limit === "string"
      ? Number.parseInt(flags.limit, 10)
      : undefined;
  const compact = flags.compact === true;

  let items = await getItems(boardId, { maxItems: limit ?? 10_000 });
  items = applyFilters(items, filters);

  if (limit && items.length > limit) {
    items = items.slice(0, limit);
  }

  console.log(`Found ${items.length} items\n`);

  if (compact) {
    console.log("ID\tName\tGroup");
    for (const item of items) {
      console.log(formatItemCompact(item));
    }
  } else {
    for (const item of items) {
      console.log(formatItem(item));
      console.log("---");
    }
  }
}

/**
 * Searches for items by name using simple contains or fuzzy matching.
 *
 * @param boardRef - Board name or ID to search
 * @param term - Search term to match against item names
 * @param flags - CLI flags (--fuzzy for fuzzy matching with scores)
 * @returns Promise that resolves when output is displayed
 *
 * @example
 * // CLI: bun services/monday/cli.ts search ESTIMATING "Phoenix"
 * await cmdSearch("ESTIMATING", "Phoenix", {});
 *
 * @example
 * // CLI: bun services/monday/cli.ts search ESTIMATING "Pheonix" --fuzzy
 * await cmdSearch("ESTIMATING", "Pheonix", { fuzzy: true });
 */
async function cmdSearch(
  boardRef: string,
  term: string,
  flags: Record<string, string | string[] | boolean>
): Promise<void> {
  const boardId = resolveBoardId(boardRef);
  const fuzzy = flags.fuzzy === true;

  if (fuzzy) {
    // Use fuzzy matching with scores
    const matches = await findBestMatches(boardId, term);
    console.log(`Found ${matches.length} matches\n`);
    for (const match of matches) {
      console.log(
        `[${(match.score * 100).toFixed(0)}%] ${match.id}\t${match.name}`
      );
    }
  } else {
    // Use simple contains search
    const items = await searchItems(boardId, term);
    console.log(`Found ${items.length} items matching "${term}"\n`);
    for (const item of items) {
      console.log(`${item.id}\t${item.name}\t${item.groupTitle}`);
    }
  }
}

/**
 * Creates a new item on a board.
 *
 * @param boardRef - Board name or ID to create item on
 * @param flags - CLI flags (--name required, --group optional, --col for column values)
 * @returns Promise that resolves when item is created
 *
 * @example
 * // CLI: bun services/monday/cli.ts create LEADS --name "New Lead" --col status=New
 * await cmdCreate("LEADS", { name: "New Lead", col: ["status=New"] });
 */
async function cmdCreate(
  boardRef: string,
  flags: Record<string, string | string[] | boolean>
): Promise<void> {
  const boardId = resolveBoardId(boardRef);
  const name = flags.name;
  const groupId = typeof flags.group === "string" ? flags.group : undefined;
  const columnValues = parseColumnValues(flags.col);

  if (typeof name !== "string" || !name) {
    console.error("Error: --name is required");
    process.exit(1);
  }

  const itemId = await createItem({
    boardId,
    itemName: name,
    groupId,
    columnValues:
      Object.keys(columnValues).length > 0 ? columnValues : undefined,
  });

  console.log(`Created item: ${itemId}`);
  console.log(`URL: https://monday.com/boards/${boardId}/pulses/${itemId}`);
}

/**
 * Updates an item's column values.
 *
 * @param itemId - The Monday item ID to update
 * @param flags - CLI flags (--board required, --col for column values)
 * @returns Promise that resolves when item is updated
 *
 * @example
 * // CLI: bun services/monday/cli.ts update 12345 --board LEADS --col status=Done
 * await cmdUpdate("12345", { board: "LEADS", col: ["status=Done"] });
 */
async function cmdUpdate(
  itemId: string,
  flags: Record<string, string | string[] | boolean>
): Promise<void> {
  const boardRef = flags.board;
  if (typeof boardRef !== "string" || !boardRef) {
    console.error("Error: --board is required");
    process.exit(1);
  }

  const boardId = resolveBoardId(boardRef);
  const columnValues = parseColumnValues(flags.col);

  if (Object.keys(columnValues).length === 0) {
    console.error("Error: at least one --col is required");
    process.exit(1);
  }

  await updateItem({
    boardId,
    itemId,
    columnValues,
  });

  console.log(`Updated item: ${itemId}`);
}

/**
 * Renames an item.
 *
 * @param itemId - The Monday item ID to rename
 * @param flags - CLI flags (--board required, --name for new name)
 * @returns Promise that resolves when item is renamed
 *
 * @example
 * // CLI: bun services/monday/cli.ts rename 12345 --board LEADS --name "New Name"
 * await cmdRename("12345", { board: "LEADS", name: "New Name" });
 */
async function cmdRename(
  itemId: string,
  flags: Record<string, string | string[] | boolean>
): Promise<void> {
  const boardRef = flags.board;
  if (typeof boardRef !== "string" || !boardRef) {
    console.error("Error: --board is required");
    process.exit(1);
  }

  const newName = flags.name;
  if (typeof newName !== "string" || !newName) {
    console.error("Error: --name is required");
    process.exit(1);
  }

  const boardId = resolveBoardId(boardRef);

  await renameItem({
    boardId,
    itemId,
    newName,
  });

  console.log(`Renamed item ${itemId} to "${newName}"`);
}

function showHelp(): void {
  console.log(`Monday.com CLI

Usage:
  bun services/monday/cli.ts <command> [args] [options]

Commands:
  boards                     List available board IDs
  columns <board>            Show board schema (columns + aliases)
  cols <board>               Show column aliases for a board
  get <itemId>               Get a single item by ID
  items <board> [filters]    Get all items from a board
  search <board> <term>      Search items by name (contains)
  find <board> <term>        Find items with file info (use --files)
  create <board> [options]   Create a new item
  update <itemId> [options]  Update an item's columns
  rename <itemId> [options]  Rename an item

Column aliases (ESTIMATING, CONTACTS boards):
  Use friendly names like CONTRACTOR, ESTIMATE_ID, PLANS instead of
  raw column IDs. Run 'cols ESTIMATING' to see all aliases.

Filter options for 'items':
  --contains <col>=<value>   Column contains value (col can be alias)
  --empty <col>              Column is empty
  --not-empty <col>          Column is not empty
  --group <groupId>          Filter by group ID or name
  --limit <n>                Limit number of results
  --compact                  Show compact output (ID, name, group only)

Search options:
  --fuzzy                    Use fuzzy matching with scores

Find options:
  --files                    Show file column values
  --limit <n>                Limit results (default: 5)

Create options:
  --name <name>              Item name (required)
  --group <groupId>          Group to create in
  --col <key>=<value>        Set column value (can repeat)

Update options:
  --board <board>            Board ID or name (required)
  --col <key>=<value>        Set column value (can repeat)

Rename options:
  --board <board>            Board ID or name (required)
  --name <name>              New name for the item (required)

Examples:
  bun services/monday/cli.ts boards
  bun services/monday/cli.ts columns ESTIMATING
  bun services/monday/cli.ts cols ESTIMATING
  bun services/monday/cli.ts get 12345
  bun services/monday/cli.ts items LEADS --limit 10 --compact
  bun services/monday/cli.ts items ESTIMATING --contains CONTRACTOR=Acme
  bun services/monday/cli.ts items ESTIMATING --not-empty PLANS
  bun services/monday/cli.ts search ESTIMATING "Phoenix"
  bun services/monday/cli.ts find ESTIMATING "Phoenix" --files
  bun services/monday/cli.ts create LEADS --name "New Lead" --col status=New
  bun services/monday/cli.ts update 12345 --board LEADS --col status=Done
  bun services/monday/cli.ts rename 12345 --board LEADS --name "New Name"
`);
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Validates a required argument exists and returns it.
 * Exits with error message if the argument is missing.
 *
 * @param value - The argument value to check
 * @param errorMsg - Error message to display if missing
 * @returns The validated argument value
 */
function requireArg(value: string | undefined, errorMsg: string): string {
  if (!value) {
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
  return value;
}

/** Handler for 'boards' command */
async function handleBoards(): Promise<void> {
  await Promise.resolve();
  cmdBoards();
}

/** Handler for 'columns' command */
async function handleColumns(parsed: ParsedArgs): Promise<void> {
  const board = requireArg(parsed.positional[0], "board ID or name required");
  await cmdColumns(board);
}

/** Handler for 'get' command */
async function handleGet(parsed: ParsedArgs): Promise<void> {
  const itemId = requireArg(parsed.positional[0], "item ID required");
  await cmdGet(itemId);
}

/** Handler for 'items' command */
async function handleItems(parsed: ParsedArgs): Promise<void> {
  const board = requireArg(parsed.positional[0], "board ID or name required");
  await cmdItems(board, parsed.flags);
}

/** Handler for 'search' command */
async function handleSearch(parsed: ParsedArgs): Promise<void> {
  const board = requireArg(parsed.positional[0], "board required");
  const term = requireArg(parsed.positional[1], "search term required");
  await cmdSearch(board, term, parsed.flags);
}

/** Handler for 'create' command */
async function handleCreate(parsed: ParsedArgs): Promise<void> {
  const board = requireArg(parsed.positional[0], "board ID or name required");
  await cmdCreate(board, parsed.flags);
}

/** Handler for 'update' command */
async function handleUpdate(parsed: ParsedArgs): Promise<void> {
  const itemId = requireArg(parsed.positional[0], "item ID required");
  await cmdUpdate(itemId, parsed.flags);
}

/** Handler for 'cols' command */
async function handleCols(parsed: ParsedArgs): Promise<void> {
  const board = requireArg(parsed.positional[0], "board name required");
  await Promise.resolve();
  cmdCols(board);
}

/** Handler for 'find' command */
async function handleFind(parsed: ParsedArgs): Promise<void> {
  const board = requireArg(parsed.positional[0], "board required");
  const term = requireArg(parsed.positional[1], "search term required");
  await cmdFind(board, term, parsed.flags);
}

/** Handler for 'rename' command */
async function handleRename(parsed: ParsedArgs): Promise<void> {
  const itemId = requireArg(parsed.positional[0], "item ID required");
  await cmdRename(itemId, parsed.flags);
}

/**
 * Map of command names to their handler functions.
 */
const COMMAND_HANDLERS: Record<string, (parsed: ParsedArgs) => Promise<void>> =
  {
    boards: handleBoards,
    columns: handleColumns,
    cols: handleCols,
    get: handleGet,
    items: handleItems,
    search: handleSearch,
    find: handleFind,
    create: handleCreate,
    update: handleUpdate,
    rename: handleRename,
  };

// ============================================================================
// Main
// ============================================================================

/**
 * Main entry point for the Monday.com CLI.
 * Parses command-line arguments and dispatches to the appropriate handler.
 * Displays help if no command is provided or --help/-h is passed.
 *
 * @returns Promise that resolves when command execution completes
 *
 * @example
 * // Run from command line:
 * // bun services/monday/cli.ts boards
 * // bun services/monday/cli.ts search ESTIMATING "Phoenix"
 * // bun services/monday/cli.ts items ESTIMATING --contains CONTRACTOR=Acme
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
    return;
  }

  const parsed = parseArgs(args);
  const handler = COMMAND_HANDLERS[parsed.command];

  if (!handler) {
    console.error(`Unknown command: ${parsed.command}`);
    showHelp();
    process.exit(1);
  }

  try {
    await handler(parsed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
