#!/usr/bin/env bun
/**
 * Desert Notion MCP Server
 *
 * A Model Context Protocol (MCP) server that exposes Notion API operations
 * as tools for Claude Code. This enables AI-assisted database queries,
 * page management, and content creation in Notion workspaces.
 *
 * ## Authentication
 *
 * Uses a single API key (NOTION_API_KEY environment variable) for all operations.
 * The integration must have access to the databases/pages being accessed.
 *
 * ## Available Tool Categories
 *
 * - **Database tools**: `get_database`, `query_database`, `search_database`
 * - **Page tools**: `get_page`, `create_page`, `update_page`, `archive_page`
 * - **Search tools**: `find_by_title`, `find_by_email`, `check_duplicates`
 * - **Dedupe tools**: `find_or_create_by_title`, `find_or_create_by_email`
 * - **File tools**: `upload_file`
 *
 * @example
 * // Start the server (typically via Claude Code's MCP configuration)
 * bun services/notion/mcp-server.ts
 *
 * @module services/notion/mcp-server
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  appendFileBlockToPage,
  archivePage,
  checkForDuplicates,
  createPage,
  findOrCreateByEmail,
  findOrCreateByTitle,
  findPageByEmail,
  findPageByTitle,
  findPagesByTitleContains,
  getDatabase,
  getPage,
  queryDatabase,
  updatePage,
  uploadFile,
} from "./client";

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
 * MCP server instance configured with Notion tools.
 *
 * Server identity: "desert-notion" v1.0.0
 * Capabilities: tools (exposes Notion operations to Claude Code)
 */
const server = new Server(
  { name: "desert-notion", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ============================================================================
// Helper Functions
// ============================================================================

/** Helper to create a text response */
function text(t: string): ToolResponse {
  return { content: [{ type: "text", text: t }] };
}

/**
 * Extract title from a Notion page's properties
 */
function extractTitle(
  properties: Record<string, unknown>,
  titleProperty = "Name"
): string {
  const prop = properties[titleProperty] as
    | { title?: Array<{ plain_text: string }> }
    | undefined;
  return prop?.title?.[0]?.plain_text ?? "Untitled";
}

/**
 * Format a Notion page for display
 */
function formatPage(page: {
  id: string;
  properties: Record<string, unknown>;
  created_time?: string;
  last_edited_time?: string;
}): string {
  const lines = [`**ID:** ${page.id}`];

  // Try to extract title from common property names
  for (const titleProp of ["Name", "Title", "name", "title"]) {
    const title = extractTitle(page.properties, titleProp);
    if (title !== "Untitled") {
      lines.unshift(`**${titleProp}:** ${title}`);
      break;
    }
  }

  if (page.created_time) {
    lines.push(`**Created:** ${page.created_time}`);
  }
  if (page.last_edited_time) {
    lines.push(`**Updated:** ${page.last_edited_time}`);
  }

  return lines.join("\n");
}

/**
 * Format database schema for display
 */
function formatDatabaseSchema(
  properties: Record<string, { name: string; type: string }>
): string {
  return Object.entries(properties)
    .map(([key, prop]) => `- **${prop.name}** (${key}): ${prop.type}`)
    .join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

const tools = [
  // ========== DATABASE TOOLS ==========
  {
    name: "get_database",
    description:
      "Get database schema including all properties and their types. Use this to understand a database structure before querying.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Notion database ID (UUID format)",
        },
      },
      required: ["databaseId"],
    },
  },
  {
    name: "query_database",
    description:
      "Query a Notion database with optional filters and sorting. Returns pages matching the criteria.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Notion database ID",
        },
        filter: {
          type: "object",
          description:
            'Notion filter object. Example: { "property": "Status", "select": { "equals": "Done" } }',
        },
        sorts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              property: { type: "string" },
              direction: { type: "string", enum: ["ascending", "descending"] },
            },
          },
          description: "Sort order for results",
        },
        pageSize: {
          type: "number",
          description: "Max results to return (default: 100, max: 100)",
        },
      },
      required: ["databaseId"],
    },
  },
  {
    name: "search_database",
    description:
      "Search a database by title property containing a search term. Faster than query_database for simple text searches.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Notion database ID",
        },
        titleProperty: {
          type: "string",
          description: "Name of the title property (e.g., 'Name', 'Title')",
        },
        searchTerm: {
          type: "string",
          description: "Text to search for in the title",
        },
      },
      required: ["databaseId", "titleProperty", "searchTerm"],
    },
  },
  // ========== PAGE TOOLS ==========
  {
    name: "get_page",
    description: "Get a single page by ID with all its properties.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pageId: {
          type: "string",
          description: "Notion page ID (UUID format)",
        },
      },
      required: ["pageId"],
    },
  },
  {
    name: "create_page",
    description:
      "Create a new page in a Notion database. Use property helpers for correct format.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Database to create page in",
        },
        properties: {
          type: "object",
          description:
            'Page properties in Notion format. Example: { "Name": { "title": [{ "text": { "content": "My Page" } }] } }',
        },
        iconUrl: {
          type: "string",
          description: "Optional external URL for page icon",
        },
      },
      required: ["databaseId", "properties"],
    },
  },
  {
    name: "update_page",
    description: "Update properties of an existing page.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pageId: {
          type: "string",
          description: "Page ID to update",
        },
        properties: {
          type: "object",
          description: "Properties to update (same format as create_page)",
        },
        iconUrl: {
          type: "string",
          description: "Optional new icon URL",
        },
      },
      required: ["pageId"],
    },
  },
  {
    name: "archive_page",
    description: "Archive (soft delete) a page.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pageId: {
          type: "string",
          description: "Page ID to archive",
        },
      },
      required: ["pageId"],
    },
  },
  // ========== SEARCH & FIND TOOLS ==========
  {
    name: "find_by_title",
    description:
      "Find a page by exact title match. Returns the page ID if found.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Database to search",
        },
        property: {
          type: "string",
          description: "Name of the title property",
        },
        value: {
          type: "string",
          description: "Exact title to match",
        },
      },
      required: ["databaseId", "property", "value"],
    },
  },
  {
    name: "find_by_email",
    description: "Find a page by email property. Useful for contact lookups.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Database to search",
        },
        property: {
          type: "string",
          description: "Name of the email property",
        },
        value: {
          type: "string",
          description: "Email address to match",
        },
      },
      required: ["databaseId", "property", "value"],
    },
  },
  {
    name: "check_duplicates",
    description:
      "Check if similar records exist before creating. Returns potential duplicates for review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Database to check",
        },
        titleProperty: {
          type: "string",
          description: "Title property to search",
        },
        searchTerms: {
          type: "array",
          items: { type: "string" },
          description:
            "Terms to search for (e.g., ['Acme', 'Corp'] finds 'Acme Corporation')",
        },
      },
      required: ["databaseId", "titleProperty", "searchTerms"],
    },
  },
  // ========== DEDUPE TOOLS ==========
  {
    name: "find_or_create_by_title",
    description:
      "Find existing page by title or create if not found. Prevents duplicates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Database ID",
        },
        titleProperty: {
          type: "string",
          description: "Name of the title property",
        },
        titleValue: {
          type: "string",
          description: "Title to find or create",
        },
        properties: {
          type: "object",
          description: "Properties for new page if creating",
        },
        iconUrl: {
          type: "string",
          description: "Optional icon URL for new page",
        },
      },
      required: ["databaseId", "titleProperty", "titleValue", "properties"],
    },
  },
  {
    name: "find_or_create_by_email",
    description:
      "Find existing page by email or create if not found. Useful for contacts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        databaseId: {
          type: "string",
          description: "Database ID",
        },
        emailProperty: {
          type: "string",
          description: "Name of the email property",
        },
        emailValue: {
          type: "string",
          description: "Email to find or create",
        },
        properties: {
          type: "object",
          description: "Properties for new page if creating",
        },
        iconUrl: {
          type: "string",
          description: "Optional icon URL for new page",
        },
      },
      required: ["databaseId", "emailProperty", "emailValue", "properties"],
    },
  },
  // ========== FILE TOOLS ==========
  {
    name: "upload_file",
    description:
      "Upload a file to Notion and optionally attach it to a page. Returns the file upload ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file to upload",
        },
        pageId: {
          type: "string",
          description: "Optional: Page ID to attach the file to",
        },
        caption: {
          type: "string",
          description: "Optional: Caption for the file block",
        },
      },
      required: ["filePath"],
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

const handlers: Record<string, ToolHandler> = {
  // ========== DATABASE TOOLS ==========

  async get_database(args) {
    const { databaseId } = args as { databaseId: string };
    const db = await getDatabase(databaseId);
    return text(
      [
        `**Database:** ${db.title}`,
        `**ID:** ${db.id}`,
        "",
        "**Properties:**",
        formatDatabaseSchema(db.properties),
      ].join("\n")
    );
  },

  async query_database(args) {
    const { databaseId, filter, sorts, pageSize } = args as {
      databaseId: string;
      filter?: Record<string, unknown>;
      sorts?: Array<{
        property?: string;
        direction: "ascending" | "descending";
      }>;
      pageSize?: number;
    };

    const result = await queryDatabase({
      databaseId,
      filter,
      sorts,
      pageSize: pageSize ?? 100,
    });

    if (result.results.length === 0) {
      return text("No pages found matching the criteria.");
    }

    const pages = result.results
      .slice(0, 20)
      .map((page) => formatPage(page))
      .join("\n\n---\n\n");

    const moreText =
      result.results.length > 20
        ? `\n\n...and ${result.results.length - 20} more pages`
        : "";

    const hasMoreText = result.has_more ? "\n(More results available)" : "";

    return text(
      `${result.results.length} pages found:\n\n${pages}${moreText}${hasMoreText}`
    );
  },

  async search_database(args) {
    const { databaseId, titleProperty, searchTerm } = args as {
      databaseId: string;
      titleProperty: string;
      searchTerm: string;
    };

    const matches = await findPagesByTitleContains({
      databaseId,
      property: titleProperty,
      value: searchTerm,
    });

    if (matches.length === 0) {
      return text(`No pages found matching "${searchTerm}"`);
    }

    const results = matches
      .map((m) => `- **${m.title}**\n  ID: ${m.id}`)
      .join("\n\n");

    return text(
      `${matches.length} pages matching "${searchTerm}":\n\n${results}`
    );
  },

  // ========== PAGE TOOLS ==========

  async get_page(args) {
    const { pageId } = args as { pageId: string };
    const page = await getPage(pageId);

    if (page === null) {
      return text("Page not found");
    }

    return text(formatPage(page));
  },

  async create_page(args) {
    const { databaseId, properties, iconUrl } = args as {
      databaseId: string;
      properties: Record<string, unknown>;
      iconUrl?: string;
    };

    const icon = iconUrl
      ? { type: "external" as const, external: { url: iconUrl } }
      : undefined;

    const pageId = await createPage({ databaseId, properties, icon });
    return text(`Page created successfully.\nID: ${pageId}`);
  },

  async update_page(args) {
    const { pageId, properties, iconUrl } = args as {
      pageId: string;
      properties?: Record<string, unknown>;
      iconUrl?: string;
    };

    const icon = iconUrl
      ? { type: "external" as const, external: { url: iconUrl } }
      : undefined;

    await updatePage({ pageId, properties, icon });
    return text(`Page ${pageId} updated successfully.`);
  },

  async archive_page(args) {
    const { pageId } = args as { pageId: string };
    await archivePage(pageId);
    return text(`Page ${pageId} archived successfully.`);
  },

  // ========== SEARCH & FIND TOOLS ==========

  async find_by_title(args) {
    const { databaseId, property, value } = args as {
      databaseId: string;
      property: string;
      value: string;
    };

    const pageId = await findPageByTitle({ databaseId, property, value });

    if (pageId === null) {
      return text(`No page found with ${property} = "${value}"`);
    }

    return text(`Found page: ${pageId}`);
  },

  async find_by_email(args) {
    const { databaseId, property, value } = args as {
      databaseId: string;
      property: string;
      value: string;
    };

    const pageId = await findPageByEmail({ databaseId, property, value });

    if (pageId === null) {
      return text(`No page found with ${property} = "${value}"`);
    }

    return text(`Found page: ${pageId}`);
  },

  async check_duplicates(args) {
    const { databaseId, titleProperty, searchTerms } = args as {
      databaseId: string;
      titleProperty: string;
      searchTerms: string[];
    };

    const dupes = await checkForDuplicates({
      databaseId,
      titleProperty,
      searchTerms,
    });

    if (dupes.length === 0) {
      return text("No potential duplicates found.");
    }

    const results = dupes.map((d) => `- **${d.title}** (${d.id})`).join("\n");

    return text(
      `${dupes.length} potential duplicate(s) found:\n\n${results}\n\nReview before creating a new entry.`
    );
  },

  // ========== DEDUPE TOOLS ==========

  async find_or_create_by_title(args) {
    const { databaseId, titleProperty, titleValue, properties, iconUrl } =
      args as {
        databaseId: string;
        titleProperty: string;
        titleValue: string;
        properties: Record<string, unknown>;
        iconUrl?: string;
      };

    const icon = iconUrl
      ? { type: "external" as const, external: { url: iconUrl } }
      : undefined;

    const result = await findOrCreateByTitle({
      databaseId,
      titleProperty,
      titleValue,
      properties,
      icon,
    });

    if (result.created) {
      return text(`Created new page: ${result.id}`);
    }
    return text(`Found existing page: ${result.id}`);
  },

  async find_or_create_by_email(args) {
    const { databaseId, emailProperty, emailValue, properties, iconUrl } =
      args as {
        databaseId: string;
        emailProperty: string;
        emailValue: string;
        properties: Record<string, unknown>;
        iconUrl?: string;
      };

    const icon = iconUrl
      ? { type: "external" as const, external: { url: iconUrl } }
      : undefined;

    const result = await findOrCreateByEmail({
      databaseId,
      emailProperty,
      emailValue,
      properties,
      icon,
    });

    if (result.created) {
      return text(`Created new page: ${result.id}`);
    }
    return text(`Found existing page: ${result.id}`);
  },

  // ========== FILE TOOLS ==========

  async upload_file(args) {
    const { filePath, pageId, caption } = args as {
      filePath: string;
      pageId?: string;
      caption?: string;
    };

    const fileId = await uploadFile(filePath);

    if (pageId) {
      await appendFileBlockToPage(pageId, fileId, caption);
      return text(
        `File uploaded and attached to page.\nFile ID: ${fileId}\nPage ID: ${pageId}`
      );
    }

    return text(`File uploaded successfully.\nFile ID: ${fileId}`);
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
console.error("Desert Notion MCP server started");
