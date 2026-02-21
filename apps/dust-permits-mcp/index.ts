/**
 * Desert Permits MCP Server — Entry Point
 *
 * Stdio-based MCP server for Claude Code integration.
 * Wraps PermitClient as discoverable tools for AI agents.
 *
 * Usage:
 *   bun apps/dust-permits-mcp/index.ts
 *
 * Configured in .mcp.json at repo root.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./src/server";

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);

// CRITICAL: Never use console.log — it writes to stdout and corrupts JSON-RPC.
// stderr is safe for logging.
console.error("Desert Permits MCP Server running on stdio");
