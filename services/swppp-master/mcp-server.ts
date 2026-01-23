#!/usr/bin/env bun
/**
 * SWPPP Master MCP Server
 *
 * A Model Context Protocol (MCP) server that exposes SWPPP Master operations
 * as tools for Claude Code. Enables AI-assisted project lookup and search.
 *
 * ## Available Tools
 *
 * ### Direct SharePoint Access (real-time, slower)
 * - `search_swppp_master`: Search projects by job name, contractor, or query
 * - `get_swppp_summary`: Get row counts for each worksheet
 * - `find_swppp_project`: Find a specific project by name
 *
 * ### SQLite Access (cached, faster)
 * - `query_swppp_local`: Query local SQLite database
 * - `sync_swppp_master`: Sync data from SharePoint to SQLite
 * - `get_swppp_sync_status`: Check sync status
 *
 * @example
 * // Start the server (typically via Claude Code's MCP configuration)
 * bun services/swppp-master/mcp-server.ts
 *
 * @module services/swppp-master/mcp-server
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { findProject, getSummary, searchProjects } from "./client";
import { WORKSHEETS, type WorksheetName } from "./config";
import { getContractors, getJobNames, queryProjects } from "./db";
import { getSyncStatus, syncAll, syncWorksheet } from "./sync";

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

const server = new Server(
  { name: "desert-swppp-master", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ============================================================================
// Helper Functions
// ============================================================================

function resolveWorksheet(name: string | undefined): WorksheetName | undefined {
  if (!name) return undefined;

  const upper = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (upper.includes("NEED") || upper.includes("SCHEDULE")) {
    return WORKSHEETS.NEED_TO_SCHEDULE;
  }
  if (upper.includes("CONFIRM")) {
    return WORKSHEETS.CONFIRMED_SCHEDULE;
  }
  if (upper.includes("BILL") || upper.includes("BV")) {
    return WORKSHEETS.BILLING_VERIFICATION;
  }

  // Try exact match
  for (const ws of Object.values(WORKSHEETS)) {
    if (ws.toLowerCase() === name.toLowerCase()) {
      return ws;
    }
  }

  return undefined;
}

function success(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function error(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS = [
  // Direct SharePoint Tools
  {
    name: "search_swppp_master",
    description:
      "Search SWPPP Master Excel for projects. Queries SharePoint directly (real-time but slower). Use query_swppp_local for faster cached searches.",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Search by job/project name (case-insensitive)",
        },
        contractor: {
          type: "string",
          description: "Search by contractor name (case-insensitive)",
        },
        query: {
          type: "string",
          description: "Search across all text fields (case-insensitive)",
        },
        worksheet: {
          type: "string",
          description:
            "Worksheet to search: 'Need to Schedule', 'Confirmed Schedule', or 'SWPPP B & V'. Leave empty for all.",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20)",
        },
      },
    },
  },
  {
    name: "find_swppp_project",
    description:
      "Find a specific project by exact or fuzzy name match in SWPPP Master. Queries SharePoint directly.",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Project/job name to find",
        },
        fuzzy: {
          type: "boolean",
          description:
            "Allow partial name matches (default: false for exact match)",
        },
        worksheet: {
          type: "string",
          description: "Limit search to specific worksheet",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "get_swppp_summary",
    description:
      "Get summary of SWPPP Master: row counts per worksheet. Queries SharePoint directly.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // SQLite Tools
  {
    name: "query_swppp_local",
    description:
      "Query the local SQLite copy of SWPPP Master. Faster than SharePoint queries. Run sync_swppp_master first if data is stale.",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Search by job/project name (LIKE match)",
        },
        contractor: {
          type: "string",
          description: "Search by contractor name (LIKE match)",
        },
        query: {
          type: "string",
          description: "Search across all text fields",
        },
        worksheet: {
          type: "string",
          description: "Limit to specific worksheet",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 50)",
        },
      },
    },
  },
  {
    name: "list_swppp_job_names",
    description: "Get all unique job names from local SWPPP Master database.",
    inputSchema: {
      type: "object",
      properties: {
        worksheet: {
          type: "string",
          description: "Limit to specific worksheet",
        },
      },
    },
  },
  {
    name: "list_swppp_contractors",
    description: "Get all unique contractors from local SWPPP Master database.",
    inputSchema: {
      type: "object",
      properties: {
        worksheet: {
          type: "string",
          description: "Limit to specific worksheet",
        },
      },
    },
  },
  {
    name: "sync_swppp_master",
    description:
      "Sync SWPPP Master data from SharePoint to local SQLite. Use fullRefresh to clear and reload all data.",
    inputSchema: {
      type: "object",
      properties: {
        worksheet: {
          type: "string",
          description:
            "Specific worksheet to sync. Leave empty for all worksheets.",
        },
        fullRefresh: {
          type: "boolean",
          description: "Clear existing data before sync (default: false)",
        },
      },
    },
  },
  {
    name: "get_swppp_sync_status",
    description:
      "Check sync status: last sync time and row counts for each worksheet.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

const toolHandlers: Record<string, ToolHandler> = {
  // Direct SharePoint handlers
  async search_swppp_master(args) {
    try {
      const results = await searchProjects({
        jobName: args.jobName as string | undefined,
        contractor: args.contractor as string | undefined,
        query: args.query as string | undefined,
        worksheet: resolveWorksheet(args.worksheet as string | undefined),
        limit: (args.limit as number) ?? 20,
      });

      return success({
        count: results.length,
        projects: results,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  async find_swppp_project(args) {
    try {
      const project = await findProject(args.jobName as string, {
        fuzzy: (args.fuzzy as boolean) ?? false,
        worksheet: resolveWorksheet(args.worksheet as string | undefined),
      });

      if (!project) {
        return success({ found: false, project: null });
      }

      return success({ found: true, project });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  async get_swppp_summary(_args) {
    try {
      const summary = await getSummary();
      return success(summary);
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  // SQLite handlers
  async query_swppp_local(args) {
    try {
      const results = queryProjects({
        jobName: args.jobName as string | undefined,
        contractor: args.contractor as string | undefined,
        query: args.query as string | undefined,
        worksheet: resolveWorksheet(args.worksheet as string | undefined),
        limit: (args.limit as number) ?? 50,
      });

      return success({
        count: results.length,
        projects: results,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  async list_swppp_job_names(args) {
    try {
      const worksheet = resolveWorksheet(args.worksheet as string | undefined);
      const names = getJobNames(worksheet);
      return success({ count: names.length, jobNames: names });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  async list_swppp_contractors(args) {
    try {
      const worksheet = resolveWorksheet(args.worksheet as string | undefined);
      const contractors = getContractors(worksheet);
      return success({ count: contractors.length, contractors });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  async sync_swppp_master(args) {
    try {
      const fullRefresh = (args.fullRefresh as boolean) ?? false;
      const worksheetName = args.worksheet as string | undefined;

      if (worksheetName) {
        const worksheet = resolveWorksheet(worksheetName);
        if (!worksheet) {
          return error(`Unknown worksheet: ${worksheetName}`);
        }
        const result = await syncWorksheet(worksheet, { fullRefresh });
        return success(result);
      }

      const results = await syncAll({ fullRefresh });
      const totalRows = results.reduce((sum, r) => sum + r.rowsSynced, 0);
      const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

      return success({
        worksheets: results,
        totalRows,
        totalDuration: totalTime,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },

  async get_swppp_sync_status(_args) {
    try {
      const status = getSyncStatus();
      return success(status);
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },
};

// ============================================================================
// Request Handlers
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    return error(`Unknown tool: ${name}`);
  }

  return handler(args);
});

// ============================================================================
// Server Startup
// ============================================================================

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
