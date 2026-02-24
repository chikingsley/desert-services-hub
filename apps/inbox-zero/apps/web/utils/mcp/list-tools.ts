import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createScopedLogger } from "@/utils/logger";
import { getIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import { getAuthToken } from "@/utils/mcp/oauth";
import { createMcpTransport } from "@/utils/mcp/transport";

const logger = createScopedLogger("mcp-list-tools");

export async function listMcpTools(
  integration: IntegrationKey,
  emailAccountId: string
): Promise<
  Array<{ name: string; description?: string; inputSchema?: unknown }>
> {
  const integrationConfig = getIntegration(integration);

  if (!integrationConfig.serverUrl) {
    throw new Error(`No server URL for integration: ${integration}`);
  }

  const authToken = await getAuthToken({ integration, emailAccountId });

  const transport = createMcpTransport(integrationConfig.serverUrl, authToken);

  const client = new Client({
    name: `inbox-zero-${integration}`,
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();

    logger.info("Listed MCP tools", {
      integration,
      toolCount: result.tools.length,
    });

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  } catch (error) {
    logger.error("Failed to list MCP tools", { error, integration });
    throw new Error(
      `Failed to list tools: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  } finally {
    await client.close();
    await transport.close();
  }
}
