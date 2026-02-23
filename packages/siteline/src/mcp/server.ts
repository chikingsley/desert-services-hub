import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SitelineClient } from "@siteline/client";
import { registerSitelineTools } from "./tools";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "desert-siteline",
    version: "1.0.0",
  });

  const client = new SitelineClient();
  registerSitelineTools(server, client);

  return server;
}
