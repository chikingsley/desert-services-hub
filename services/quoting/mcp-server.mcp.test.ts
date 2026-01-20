import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type HubQuote, tools } from "./mcp-server";

// ============================================================================
// Tool Tests (Testing Handlers Directly)
// ============================================================================

describe("MCP Tool Handlers", () => {
  const mockQuote: HubQuote = {
    id: "uuid-test",
    base_number: "260115",
    job_name: "Test Project",
    job_address: null,
    client_name: "Test Client",
    client_email: null,
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_version: {
      id: "v1",
      total: 0,
      sections: [],
      line_items: [],
    },
  };

  beforeEach(() => {
    // Reset global fetch mock
    global.fetch = mock(async (url: string) => {
      // Return list of quotes for ID resolution
      if (url.endsWith("/api/quotes")) {
        return new Response(JSON.stringify([mockQuote]));
      }
      // Return single quote
      if (url.includes("/api/quotes/uuid-test")) {
        return new Response(JSON.stringify(mockQuote));
      }
      return new Response(JSON.stringify({ ok: true }));
    }) as any;
  });

  describe("list_quotes", () => {
    it("returns formatted quote list with UUIDs", async () => {
      expect(tools.list_quotes).toBeDefined();
      const response = await tools.list_quotes!.handler({});
      const textContent = response.content[0];
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("uuid-test");
      expect(textContent?.text).toContain("260115");
      expect(textContent?.text).toContain("Test Project");
    });
  });

  describe("add_line_item", () => {
    it("sends correct field mapping to Hub API", async () => {
      let capturedPayload: any = null;

      global.fetch = mock(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/api/quotes"))
          return new Response(JSON.stringify([mockQuote]));
        if (url.includes("/api/quotes/uuid-test")) {
          if (init?.method === "PUT") {
            capturedPayload = JSON.parse(init.body as string);
          }
          return new Response(JSON.stringify(mockQuote));
        }
        return new Response(JSON.stringify({ ok: true }));
      }) as any;

      expect(tools.add_line_item).toBeDefined();
      await tools.add_line_item!.handler({
        quote_id: "260115",
        item: "Steel Fence",
        description: "Heavy duty",
        qty: 10,
        uom: "LF",
        cost: 45,
      });

      expect(capturedPayload).not.toBeNull();
      const firstItem = capturedPayload.line_items[0];
      // verify our "fix": item name goes to 'item', notes go to 'description' in Hub API terms
      expect(firstItem.item).toBe("Steel Fence");
      expect(firstItem.description).toBe("Heavy duty");
    });
  });
});
