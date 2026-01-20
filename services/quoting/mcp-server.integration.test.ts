/**
 * Integration tests for Desert Quoting MCP Server
 *
 * These tests require the Desert Services Hub to be running at localhost:3000.
 * They test the actual API integration with real HTTP calls.
 *
 * Run: bun test services/quoting/mcp-server.integration.test.ts
 *
 * Prerequisites:
 * - cd desert-services-hub && bun run dev
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const HUB_URL = process.env.HUB_URL ?? "http://localhost:3000";

// ============================================================================
// Types
// ============================================================================

interface HubLineItem {
  id: string;
  section_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  is_excluded: number;
  notes: string | null;
  sort_order: number;
}

interface HubSection {
  id: string;
  name: string;
  sort_order: number;
}

interface HubQuote {
  id: string;
  base_number: string;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  current_version?: {
    id: string;
    total: number;
    sections: HubSection[];
    line_items: HubLineItem[];
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function hubFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${HUB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hub API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

function calculateTotal(lineItems: HubLineItem[]): number {
  let total = 0;
  for (const item of lineItems) {
    if (!item.is_excluded) {
      total += item.quantity * item.unit_price;
    }
  }
  return total;
}

async function checkHubAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${HUB_URL}/api/quotes`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("MCP Server Integration", () => {
  let hubAvailable = false;
  let testQuoteId: string | null = null;
  const TEST_PREFIX = "_TEST_DELETE_ME_";

  beforeAll(async () => {
    hubAvailable = await checkHubAvailable();
    if (!hubAvailable) {
      console.log(
        "Hub not available at",
        HUB_URL,
        "- skipping integration tests"
      );
    }
  });

  afterAll(async () => {
    // Cleanup: delete test quote if created
    if (testQuoteId && hubAvailable) {
      try {
        await fetch(`${HUB_URL}/api/quotes/${testQuoteId}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("list_quotes", () => {
    it.skipIf(!hubAvailable)("fetches quotes from hub API", async () => {
      const quotes = await hubFetch<HubQuote[]>("/api/quotes");

      expect(Array.isArray(quotes)).toBe(true);
      // Each quote should have expected properties
      const quote = quotes[0];
      if (quote) {
        expect(quote.id).toBeDefined();
        expect(quote.base_number).toBeDefined();
        expect(quote.job_name).toBeDefined();
        expect(quote.status).toBeDefined();
      }
    });

    it.skipIf(!hubAvailable)(
      "quotes have current_version with line items",
      async () => {
        const quotes = await hubFetch<HubQuote[]>("/api/quotes");

        // Find a quote with a current version
        const quoteWithVersion = quotes.find((q) => q.current_version);
        if (quoteWithVersion) {
          expect(quoteWithVersion.current_version).toBeDefined();
          expect(
            Array.isArray(quoteWithVersion.current_version?.line_items)
          ).toBe(true);
          expect(
            Array.isArray(quoteWithVersion.current_version?.sections)
          ).toBe(true);
          expect(typeof quoteWithVersion.current_version?.total).toBe("number");
        }
      }
    );
  });

  describe("get_quote", () => {
    it.skipIf(!hubAvailable)("fetches single quote by ID", async () => {
      // First get list to find a quote ID
      const quotes = await hubFetch<HubQuote[]>("/api/quotes");
      if (quotes.length === 0) {
        console.log("No quotes found, skipping get_quote test");
        return;
      }

      const firstQuote = quotes[0];
      expect(firstQuote).toBeDefined();
      const quoteId = firstQuote?.id;
      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);

      expect(quote.id).toBe(quoteId);
      expect(quote.base_number).toBeDefined();
      expect(quote.job_name).toBeDefined();
    });

    it.skipIf(!hubAvailable)("returns 404 for non-existent quote", async () => {
      const fakeId = "non-existent-quote-id-12345";

      try {
        await hubFetch<HubQuote>(`/api/quotes/${fakeId}`);
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect((err as Error).message).toContain("404");
      }
    });
  });

  describe("quote CRUD operations", () => {
    it.skipIf(!hubAvailable)("creates a test quote", async () => {
      const timestamp = Date.now();
      const newQuote = {
        job_name: `${TEST_PREFIX}Integration Test ${timestamp}`,
        job_address: "123 Test St",
        client_name: "Test Client",
        client_email: "test@example.com",
        status: "draft",
        sections: [],
        line_items: [],
        total: 0,
      };

      const response = await fetch(`${HUB_URL}/api/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newQuote),
      });

      expect(response.ok).toBe(true);
      const created = await response.json();
      expect(created.id).toBeDefined();
      testQuoteId = created.id;
    });

    it.skipIf(!hubAvailable)("adds line item to test quote", async () => {
      if (!testQuoteId) {
        console.log("No test quote created, skipping");
        return;
      }

      // Get current quote
      const quote = await hubFetch<HubQuote>(`/api/quotes/${testQuoteId}`);
      const version = quote.current_version;

      if (!version) {
        console.log("Quote has no version, skipping");
        return;
      }

      // Add new line item
      const newItem = {
        section_id: null,
        item: "Test Fence Install",
        description: "Test notes",
        qty: 100,
        uom: "LF",
        cost: 2.5,
        isStruck: false,
      };

      const updatedItems = [
        ...version.line_items.map((li) => ({
          section_id: li.section_id,
          item: li.description,
          description: li.notes,
          qty: li.quantity,
          uom: li.unit,
          cost: li.unit_price,
          isStruck: li.is_excluded === 1,
        })),
        newItem,
      ];

      const response = await fetch(`${HUB_URL}/api/quotes/${testQuoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_number: quote.base_number,
          job_name: quote.job_name,
          job_address: quote.job_address,
          client_name: quote.client_name,
          client_email: quote.client_email,
          status: quote.status,
          sections: version.sections.map((s) => ({ id: s.id, name: s.name })),
          line_items: updatedItems,
          total: 250, // 100 * 2.5
        }),
      });

      expect(response.ok).toBe(true);

      // Verify item was added
      const updated = await hubFetch<HubQuote>(`/api/quotes/${testQuoteId}`);
      const items = updated.current_version?.line_items ?? [];
      const addedItem = items.find(
        (i) => i.description === "Test Fence Install"
      );
      expect(addedItem).toBeDefined();
      expect(addedItem?.quantity).toBe(100);
      expect(addedItem?.unit).toBe("LF");
    });

    it.skipIf(!hubAvailable)("updates line item in test quote", async () => {
      if (!testQuoteId) {
        console.log("No test quote created, skipping");
        return;
      }

      // Get current quote
      const quote = await hubFetch<HubQuote>(`/api/quotes/${testQuoteId}`);
      const version = quote.current_version;

      if (!version || version.line_items.length === 0) {
        console.log("No line items to update, skipping");
        return;
      }

      // Update first line item quantity
      const updatedItems = version.line_items.map((li, i) => ({
        section_id: li.section_id,
        item: li.description,
        description: li.notes,
        qty: i === 0 ? 200 : li.quantity, // Double the first item's qty
        uom: li.unit,
        cost: li.unit_price,
        isStruck: li.is_excluded === 1,
      }));

      const response = await fetch(`${HUB_URL}/api/quotes/${testQuoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_number: quote.base_number,
          job_name: quote.job_name,
          job_address: quote.job_address,
          client_name: quote.client_name,
          client_email: quote.client_email,
          status: quote.status,
          sections: version.sections.map((s) => ({ id: s.id, name: s.name })),
          line_items: updatedItems,
          total: 500, // 200 * 2.5
        }),
      });

      expect(response.ok).toBe(true);

      // Verify update
      const updated = await hubFetch<HubQuote>(`/api/quotes/${testQuoteId}`);
      const firstItem = updated.current_version?.line_items[0];
      expect(firstItem?.quantity).toBe(200);
    });

    it.skipIf(!hubAvailable)("removes line item from test quote", async () => {
      if (!testQuoteId) {
        console.log("No test quote created, skipping");
        return;
      }

      // Get current quote
      const quote = await hubFetch<HubQuote>(`/api/quotes/${testQuoteId}`);
      const version = quote.current_version;

      if (!version || version.line_items.length === 0) {
        console.log("No line items to remove, skipping");
        return;
      }

      const originalCount = version.line_items.length;

      // Remove first line item
      const updatedItems = version.line_items.slice(1).map((li) => ({
        section_id: li.section_id,
        item: li.description,
        description: li.notes,
        qty: li.quantity,
        uom: li.unit,
        cost: li.unit_price,
        isStruck: li.is_excluded === 1,
      }));

      const response = await fetch(`${HUB_URL}/api/quotes/${testQuoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_number: quote.base_number,
          job_name: quote.job_name,
          job_address: quote.job_address,
          client_name: quote.client_name,
          client_email: quote.client_email,
          status: quote.status,
          sections: version.sections.map((s) => ({ id: s.id, name: s.name })),
          line_items: updatedItems,
          total: 0,
        }),
      });

      expect(response.ok).toBe(true);

      // Verify removal
      const updated = await hubFetch<HubQuote>(`/api/quotes/${testQuoteId}`);
      const newCount = updated.current_version?.line_items.length ?? 0;
      expect(newCount).toBe(originalCount - 1);
    });
  });

  describe("calculateTotal integration", () => {
    it.skipIf(!hubAvailable)("matches server-calculated total", async () => {
      const quotes = await hubFetch<HubQuote[]>("/api/quotes");
      const quoteWithItems = quotes.find(
        (q) => (q.current_version?.line_items.length ?? 0) > 0
      );

      if (!quoteWithItems?.current_version) {
        console.log("No quotes with items found, skipping");
        return;
      }

      const serverTotal = quoteWithItems.current_version.total;
      const calculatedTotal = calculateTotal(
        quoteWithItems.current_version.line_items
      );

      // Allow small floating point difference
      expect(Math.abs(serverTotal - calculatedTotal)).toBeLessThan(0.01);
    });
  });
});

describe("Hub API availability check", () => {
  it("checkHubAvailable returns boolean", async () => {
    const result = await checkHubAvailable();
    expect(typeof result).toBe("boolean");
  });
});
