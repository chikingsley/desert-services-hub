import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./src/mcp/server";

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("Desert Siteline MCP Server running on stdio");
