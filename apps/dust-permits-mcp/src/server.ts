/**
 * Desert Permits MCP Server
 *
 * Creates and configures the MCP server instance with all permit tools.
 * Uses stdio transport for Claude Code integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PermitClient } from "@permits/client";
import { registerPermitTools } from "./tools";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "desert-permits",
    version: "1.0.0",
  });

  const client = new PermitClient({
    baseUrl: process.env.PERMIT_WORKER_URL ?? "http://localhost:47822",
  });

  registerPermitTools(server, client);

  return server;
}
