import { beforeAll, describe, expect, it, mock } from "bun:test";
import {
  calculateTotal,
  error,
  type HubLineItem,
  type HubQuote,
  resolveQuoteId,
  success,
} from "./mcp-server";

// ============================================================================
// Constants
// ============================================================================

const _UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ============================================================================
// Mock Data
// ============================================================================

const mockQuotes: HubQuote[] = [
  {
    id: "uuid-1",
    base_number: "250101001",
    job_name: "Phoenix Project",
    job_address: "123 Main St",
    client_name: "Acme Corp",
    client_email: "acme@example.com",
    status: "draft",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    current_version: {
      id: "v1",
      total: 1000,
      sections: [],
      line_items: [
        {
          id: "item-1",
          section_id: null,
          description: "Included Item",
          quantity: 10,
          unit: "EA",
          unit_cost: 7,
          unit_price: 10,
          is_excluded: 0,
          notes: null,
          sort_order: 0,
        },
      ],
    },
  },
  {
    id: "uuid-2",
    base_number: "250101002",
    job_name: "Scottsdale Build",
    job_address: "456 Oak Ave",
    client_name: "Builder Inc",
    client_email: "builder@example.com",
    status: "sent",
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
    current_version: { id: "v2", total: 2500, sections: [], line_items: [] },
  },
];

// ============================================================================
// Tests
// ============================================================================

describe("calculateTotal", () => {
  it("calculates total for empty items array", () => {
    expect(calculateTotal([])).toBe(0);
  });

  it("calculates total for single item", () => {
    const items: HubLineItem[] = [
      {
        id: "1",
        section_id: null,
        description: "Test Item",
        quantity: 10,
        unit: "EA",
        unit_cost: 7,
        unit_price: 10,
        is_excluded: 0,
        notes: null,
        sort_order: 0,
      },
    ];
    expect(calculateTotal(items)).toBe(100);
  });

  it("excludes struck items from total", () => {
    const items: HubLineItem[] = [
      {
        id: "1",
        section_id: null,
        description: "Included",
        quantity: 10,
        unit: "EA",
        unit_cost: 7,
        unit_price: 10,
        is_excluded: 0,
        notes: null,
        sort_order: 0,
      },
      {
        id: "2",
        section_id: null,
        description: "Excluded",
        quantity: 100,
        unit: "EA",
        unit_cost: 70,
        unit_price: 100,
        is_excluded: 1,
        notes: null,
        sort_order: 1,
      },
    ];
    expect(calculateTotal(items)).toBe(100);
  });
});

describe("resolveQuoteId", () => {
  beforeAll(() => {
    // Mock global fetch for hubFetch inside resolveQuoteId
    global.fetch = mock(
      async () =>
        new Response(JSON.stringify(mockQuotes), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as any;
  });

  it("returns input if it looks like a full UUID", async () => {
    const id = "12345678-1234-1234-1234-123456789012";
    const result = await resolveQuoteId(id);
    expect(result).toBe(id);
  });

  it("resolves base_number to UUID", async () => {
    const result = await resolveQuoteId("250101001");
    expect(result).toBe("uuid-1");
  });

  it("resolves UUID string to itself", async () => {
    const result = await resolveQuoteId("uuid-2");
    expect(result).toBe("uuid-2");
  });

  it("throws error for unknown ID", async () => {
    await expect(resolveQuoteId("unknown")).rejects.toThrow(
      'Quote "unknown" not found'
    );
  });
});

describe("helpers", () => {
  it("success helper creates correct structure", () => {
    expect(success("msg")).toEqual({
      content: [{ type: "text", text: "msg" }],
    });
  });

  it("error helper creates correct structure", () => {
    expect(error("err")).toEqual({
      content: [{ type: "text", text: "Error: err" }],
      isError: true,
    });
  });
});
