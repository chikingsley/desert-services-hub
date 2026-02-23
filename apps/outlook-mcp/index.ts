#!/usr/bin/env bun
/**
 * Outlook MCP Server - Main entry point
 *
 * A Model Context Protocol server that provides access to
 * Microsoft Outlook through the Microsoft Graph API.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { authTools } from "@outlook/auth/tools";
import config from "@outlook/config";
import { emailTools } from "@outlook/email/tools";
import { folderTools } from "@outlook/folder/tools";
import { rulesTools } from "@outlook/rules/tools";
import type { Tool } from "@outlook/types";

// Log startup information
console.error(`STARTING ${config.SERVER_NAME.toUpperCase()} MCP SERVER`);
console.error(`Test mode is ${config.USE_TEST_MODE ? "enabled" : "disabled"}`);

// Combine all tools
const TOOLS = [
  ...authTools,

  ...emailTools,
  ...folderTools,
  ...rulesTools,
] as Tool[];

// Create server
const server = new Server(
  { name: config.SERVER_NAME, version: config.SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, () => {
  console.error(`TOOLS LIST: ${TOOLS.length} tools`);
  return {
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  console.error(`TOOL CALL: ${name}`);

  const tool = TOOLS.find((t) => t.name === name);
  if (!tool?.handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
  }

  try {
    // biome-ignore lint/suspicious/noExplicitAny: SDK CallToolResult type compatibility
    return (await tool.handler((args ?? {}) as Record<string, unknown>)) as any;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : String(error)
    );
  }
});

// Stay alive on SIGTERM
process.on("SIGTERM", () => {
  console.error("SIGTERM received but staying alive");
});

// Start the server
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => console.error(`${config.SERVER_NAME} connected and listening`))
  .catch((error: Error) => {
    console.error(`Connection error: ${error.message}`);
    process.exit(1);
  });
