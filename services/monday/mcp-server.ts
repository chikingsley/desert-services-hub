#!/usr/bin/env bun
/**
 * Desert MondayCRM MCP Server
 *
 * A Model Context Protocol (MCP) server that exposes MondayCRM operations
 * as tools for Claude Code. This enables AI-assisted project management,
 * item tracking, and board operations.
 *
 * ## Authentication
 *
 * Uses a single API key (MONDAY_API_KEY environment variable) for all operations.
 * No dual auth needed - all operations use the same credentials.
 *
 * ## Available Tool Categories
 *
 * - **Board tools**: `get_board`, `get_board_columns`, `list_boards`
 * - **Item tools**: `get_items`, `get_item`, `search_items`, `create_item`,
 *   `update_item`, `rename_item`, `get_items_rich`
 * - **Matching tools**: `find_best_matches`
 *
 * @example
 * // Start the server (typically via Claude Code's MCP configuration)
 * bun services/monday/mcp-server.ts
 *
 * @module services/monday/mcp-server
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createItem,
  findBestMatches,
  getBoard,
  getBoardColumns,
  getItem,
  getItems,
  getItemsRich,
  renameItem,
  searchItems,
  updateItem,
} from "./client";
import { BOARD_COLUMNS, BOARD_IDS, getColumnId } from "./types";

// ============================================================================
// Types
// ============================================================================

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

// ============================================================================
// MCP Server Setup
// ============================================================================

/**
 * MCP server instance configured with MondayCRM tools.
 *
 * Server identity: "desert-mondaycrm" v1.0.0
 * Capabilities: tools (exposes Monday operations to Claude Code)
 */
const server = new Server(
  { name: "desert-mondaycrm", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ============================================================================
// Helper Functions
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
 * Resolves a board name or ID to a board ID.
 */
function resolveBoardId(boardIdOrName: string): string {
  const upperName = boardIdOrName.toUpperCase();
  if (upperName in BOARD_IDS) {
    return BOARD_IDS[upperName as keyof typeof BOARD_IDS];
  }
  return boardIdOrName;
}

/**
 * Converts a board reference to its canonical board name.
 */
function resolveBoardName(boardRef: string): BoardName | null {
  const upperRef = boardRef.toUpperCase() as BoardName;
  if (upperRef in BOARD_IDS) {
    return upperRef;
  }
  return null;
}

/**
 * Resolves a column reference to its Monday.com column ID.
 */
function resolveColumnId(boardRef: string, columnRef: string): string {
  const boardName = resolveBoardName(boardRef);
  if (boardName && boardName in BOARD_COLUMNS) {
    const resolved = getColumnId(boardName as ColumnBoardName, columnRef);
    if (resolved) {
      return resolved;
    }
  }
  return columnRef;
}

/**
 * Resolves all column aliases in a column values object.
 */
function resolveColumnValues(
  boardRef: string,
  columnValues: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(columnValues)) {
    const resolvedKey = resolveColumnId(boardRef, key);
    resolved[resolvedKey] = value;
  }
  return resolved;
}

/**
 * Formats a Monday item for display.
 */
function formatItem(item: {
  id: string;
  name: string;
  groupTitle: string;
  url: string;
  columns: Record<string, string | null>;
}): string {
  const columnEntries = Object.entries(item.columns)
    .filter(([_, v]) => v !== null && v !== "")
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  return [
    `**${item.name}**`,
    `ID: ${item.id}`,
    `Group: ${item.groupTitle}`,
    `URL: ${item.url}`,
    columnEntries ? `Columns:\n${columnEntries}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Helper to create a text response */
function text(t: string): ToolResponse {
  return { content: [{ type: "text", text: t }] };
}

// ============================================================================
// Tool Definitions
// ============================================================================

const tools = [
  // ========== BOARD TOOLS ==========
  {
    name: "list_boards",
    description:
      "List all known MondayCRM boards with their IDs. Use these board names or IDs with other tools.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_board",
    description:
      "Get board information including name and available groups. Accepts board ID or name (e.g., 'ESTIMATING', 'LEADS').",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: {
          type: "string",
          description:
            "Board ID or name (e.g., 'ESTIMATING', 'LEADS', 'CONTRACTORS', 'CONTACTS', 'PROJECTS')",
        },
      },
      required: ["boardId"],
    },
  },
  {
    name: "get_board_columns",
    description:
      "Get the column schema for a board. Shows all available columns with their IDs and types.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
      },
      required: ["boardId"],
    },
  },
  {
    name: "get_column_aliases",
    description:
      "Get column aliases for a board (ESTIMATING, CONTACTS). These let you use friendly names like CONTRACTOR instead of raw column IDs like deal_account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: {
          type: "string",
          description:
            "Board name (only ESTIMATING and CONTACTS have aliases defined)",
        },
      },
      required: ["boardId"],
    },
  },
  // ========== ITEM TOOLS ==========
  {
    name: "get_items",
    description:
      "Get all items from a board. Auto-paginates to fetch all items. Use maxItems to limit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
        maxItems: {
          type: "number",
          description: "Maximum items to return (default: 10000)",
        },
      },
      required: ["boardId"],
    },
  },
  {
    name: "get_item",
    description: "Get a single item by its ID with all column values.",
    inputSchema: {
      type: "object" as const,
      properties: {
        itemId: { type: "string", description: "The item ID to fetch" },
      },
      required: ["itemId"],
    },
  },
  {
    name: "search_items",
    description:
      "Search items by name within a board. Excludes 'Shell Estimates' group by default.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
        searchTerm: {
          type: "string",
          description: "Text to search for in item names",
        },
        excludeGroups: {
          type: "array",
          items: { type: "string" },
          description:
            "Groups to exclude from search (default: ['shell estimates'])",
        },
      },
      required: ["boardId", "searchTerm"],
    },
  },
  {
    name: "find_best_matches",
    description:
      "Find items with similar names using fuzzy matching. Returns scored results sorted by similarity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
        name: { type: "string", description: "Name to match against" },
        limit: {
          type: "number",
          description: "Max results to return (default: 5)",
        },
      },
      required: ["boardId", "name"],
    },
  },
  {
    name: "get_items_rich",
    description:
      "Get items with full column data including linked items and mirror values. Use when you need board_relation or mirror data.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
        maxItems: {
          type: "number",
          description: "Maximum items to return (default: 10000)",
        },
      },
      required: ["boardId"],
    },
  },
  {
    name: "create_item",
    description:
      "Create a new item on a board. Supports column aliases for ESTIMATING and CONTACTS boards (e.g., use CONTRACTOR instead of deal_account).",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
        itemName: { type: "string", description: "Name for the new item" },
        groupId: {
          type: "string",
          description: "Group ID to create item in (optional)",
        },
        columnValues: {
          type: "object",
          description:
            "Column values as JSON object. Supports column aliases (e.g., { CONTRACTOR: 'Acme' }) or raw IDs",
        },
      },
      required: ["boardId", "itemName"],
    },
  },
  {
    name: "update_item",
    description:
      "Update column values for an existing item. Supports column aliases for ESTIMATING and CONTACTS boards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: {
          type: "string",
          description: "Board ID or name (required for API)",
        },
        itemId: { type: "string", description: "Item ID to update" },
        columnValues: {
          type: "object",
          description:
            "Column values to update. Supports column aliases (e.g., { BID_STATUS: { label: 'Won' } }) or raw IDs",
        },
      },
      required: ["boardId", "itemId", "columnValues"],
    },
  },
  {
    name: "rename_item",
    description: "Rename an existing item.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID or name" },
        itemId: { type: "string", description: "Item ID to rename" },
        newName: { type: "string", description: "New name for the item" },
      },
      required: ["boardId", "itemId", "newName"],
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

const handlers: Record<string, ToolHandler> = {
  // ========== BOARD TOOLS ==========

  list_boards() {
    const boardList = Object.entries(BOARD_IDS)
      .map(([boardName, id]) => `- **${boardName}**: ${id}`)
      .join("\n");
    return Promise.resolve(
      text(
        `Available boards:\n\n${boardList}\n\nUse these names or IDs with other tools.`
      )
    );
  },

  async get_board(args) {
    const { boardId } = args as { boardId: string };
    const resolvedId = resolveBoardId(boardId);
    const board = await getBoard(resolvedId);
    if (board === null) {
      return text("Board not found");
    }
    const groupList = board.groups
      .map((g) => `  - ${g.title} (ID: ${g.id})`)
      .join("\n");
    return text(
      [`**${board.name}**`, `ID: ${board.id}`, "", "Groups:", groupList].join(
        "\n"
      )
    );
  },

  async get_board_columns(args) {
    const { boardId } = args as { boardId: string };
    const resolvedId = resolveBoardId(boardId);
    const columns = await getBoardColumns(resolvedId);
    if (columns.length === 0) {
      return text("No columns found");
    }
    const columnList = columns
      .map((c) => `- **${c.title}** (ID: ${c.id}, type: ${c.type})`)
      .join("\n");
    return text(`${columns.length} columns:\n\n${columnList}`);
  },

  get_column_aliases(args) {
    const { boardId } = args as { boardId: string };
    const boardName = resolveBoardName(boardId);
    if (!(boardName && boardName in BOARD_COLUMNS)) {
      return Promise.resolve(
        text(
          `No column aliases defined for "${boardId}". Only ESTIMATING and CONTACTS have aliases.`
        )
      );
    }
    const aliases = BOARD_COLUMNS[boardName as keyof typeof BOARD_COLUMNS];
    const aliasList = Object.entries(aliases)
      .map(([alias, def]) => `- **${alias}** → ${def.id} (${def.type})`)
      .join("\n");
    return Promise.resolve(
      text(
        `Column aliases for ${boardName}:\n\n${aliasList}\n\nUse these aliases in create_item and update_item columnValues.`
      )
    );
  },

  // ========== ITEM TOOLS ==========

  async get_items(args) {
    const { boardId, maxItems } = args as {
      boardId: string;
      maxItems?: number;
    };
    const resolvedId = resolveBoardId(boardId);
    const items = await getItems(resolvedId, { maxItems });
    if (items.length === 0) {
      return text("No items found");
    }
    const summary = items
      .slice(0, 50)
      .map(
        (item) => `- ${item.name} (ID: ${item.id}, Group: ${item.groupTitle})`
      )
      .join("\n");
    const moreText =
      items.length > 50 ? `\n\n...and ${items.length - 50} more items` : "";
    return text(`${items.length} items found:\n\n${summary}${moreText}`);
  },

  async get_item(args) {
    const { itemId } = args as { itemId: string };
    const item = await getItem(itemId);
    if (item === null) {
      return text("Item not found");
    }
    return text(formatItem(item));
  },

  async search_items(args) {
    const { boardId, searchTerm, excludeGroups } = args as {
      boardId: string;
      searchTerm: string;
      excludeGroups?: string[];
    };
    const resolvedId = resolveBoardId(boardId);
    const items = await searchItems(resolvedId, searchTerm, { excludeGroups });
    if (items.length === 0) {
      return text(`No items found matching "${searchTerm}"`);
    }
    // Return full details including status (group), amounts, dates, etc.
    const results = items
      .map((item) => {
        const cols = item.columns;
        // Extract key fields from columns
        const bidValue = cols.deal_value || cols.numbers || null;
        const bidStatus = cols.deal_stage || null;
        const dueDate = cols.date_mksf70mc || null;
        const estimateId = cols.text_mkseybgg || null;

        const details = [
          `- **${item.name}**`,
          `  ID: ${item.id}`,
          `  Status: ${item.groupTitle}`,
          bidStatus ? `  Bid Status: ${bidStatus}` : null,
          bidValue ? `  Bid Value: $${bidValue}` : null,
          estimateId ? `  Estimate ID: ${estimateId}` : null,
          dueDate ? `  Due Date: ${dueDate}` : null,
          `  URL: ${item.url}`,
        ]
          .filter(Boolean)
          .join("\n");

        return details;
      })
      .join("\n\n");
    return text(
      `${items.length} items matching "${searchTerm}":\n\n${results}`
    );
  },

  async find_best_matches(args) {
    const {
      boardId,
      name: matchName,
      limit,
    } = args as {
      boardId: string;
      name: string;
      limit?: number;
    };
    const resolvedId = resolveBoardId(boardId);
    const matches = await findBestMatches(resolvedId, matchName, limit);
    if (matches.length === 0) {
      return text(`No similar items found for "${matchName}"`);
    }
    const results = matches
      .map(
        (item) =>
          `- **${item.name}** (score: ${(item.score * 100).toFixed(0)}%)\n  ID: ${item.id}\n  URL: ${item.url}`
      )
      .join("\n\n");
    return text(`${matches.length} matches for "${matchName}":\n\n${results}`);
  },

  async get_items_rich(args) {
    const { boardId, maxItems } = args as {
      boardId: string;
      maxItems?: number;
    };
    const resolvedId = resolveBoardId(boardId);
    const items = await getItemsRich(resolvedId, { maxItems });
    if (items.length === 0) {
      return text("No items found");
    }
    const summary = items
      .slice(0, 20)
      .map((item) => {
        const relationCols = item.columnValues
          .filter((cv) => cv.type === "board_relation" || cv.type === "mirror")
          .map((cv) => `  ${cv.id}: ${cv.displayValue || cv.text || "(empty)"}`)
          .join("\n");
        return `- **${item.name}** (ID: ${item.id})\n${relationCols || "  (no relation columns)"}`;
      })
      .join("\n\n");
    const moreText =
      items.length > 20 ? `\n\n...and ${items.length - 20} more items` : "";
    return text(
      `${items.length} items with rich data:\n\n${summary}${moreText}`
    );
  },

  async create_item(args) {
    const { boardId, itemName, groupId, columnValues } = args as {
      boardId: string;
      itemName: string;
      groupId?: string;
      columnValues?: Record<string, unknown>;
    };
    const resolvedId = resolveBoardId(boardId);
    const resolvedColumnValues = columnValues
      ? resolveColumnValues(boardId, columnValues)
      : undefined;
    const newItemId = await createItem({
      boardId: resolvedId,
      itemName,
      groupId,
      columnValues: resolvedColumnValues,
    });
    const url = `https://monday.com/boards/${resolvedId}/pulses/${newItemId}`;
    return text(`Item created: "${itemName}"\nID: ${newItemId}\nURL: ${url}`);
  },

  async update_item(args) {
    const { boardId, itemId, columnValues } = args as {
      boardId: string;
      itemId: string;
      columnValues: Record<string, unknown>;
    };
    const resolvedId = resolveBoardId(boardId);
    const resolvedColumnValues = resolveColumnValues(boardId, columnValues);
    await updateItem({
      boardId: resolvedId,
      itemId,
      columnValues: resolvedColumnValues,
    });
    return text(`Item ${itemId} updated successfully`);
  },

  async rename_item(args) {
    const { boardId, itemId, newName } = args as {
      boardId: string;
      itemId: string;
      newName: string;
    };
    const resolvedId = resolveBoardId(boardId);
    await renameItem({ boardId: resolvedId, itemId, newName });
    return text(`Item ${itemId} renamed to "${newName}"`);
  },
};

// ============================================================================
// MCP Request Handlers
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ============================================================================
// Start Server
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Desert MondayCRM MCP server started");
