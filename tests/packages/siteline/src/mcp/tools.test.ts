import { describe, expect, test } from "bun:test";
import { createServer } from "@siteline/mcp/server";

interface ToolEntry {
  annotations?: {
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    readOnlyHint?: boolean;
  };
  outputSchema?: unknown;
}

interface InspectableMcpServer {
  _registeredTools: Record<string, ToolEntry>;
  close: () => Promise<void>;
}

describe("Siteline MCP tool contract", () => {
  test("registers expected read-only, non-destructive tools", async () => {
    const server = createServer() as unknown as InspectableMcpServer;
    const names = Object.keys(server._registeredTools).sort();

    expect(names).toEqual([
      "siteline_current_company",
      "siteline_get_contract",
      "siteline_get_pay_app",
      "siteline_list_contracts",
      "siteline_list_pay_apps",
      "siteline_query",
    ]);

    for (const name of names) {
      const tool = server._registeredTools[name];
      expect(tool).toBeDefined();
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.idempotentHint).toBe(true);
      expect(tool.annotations?.openWorldHint).toBe(true);
      expect(tool.outputSchema).toBeDefined();
    }

    await server.close();
  });
});
