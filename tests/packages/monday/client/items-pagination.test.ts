/**
 * Tests for cursor-based pagination using next_items_page.
 *
 * Monday API best practice: first page uses boards { items_page },
 * subsequent pages use next_items_page(cursor) at root level to avoid
 * the complexity cost of re-nesting inside boards.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";

// We mock the query function to capture the GraphQL strings sent
const queryCalls: string[] = [];
const queryResponses: unknown[] = [];

mock.module("@monday/client/query", () => ({
  query: async (graphql: string) => {
    queryCalls.push(graphql);
    return queryResponses.shift();
  },
}));

// Import after mock
const { getItems } = await import("@monday/client/items");
const { getItemsRich } = await import("@monday/client/rich");

beforeEach(() => {
  queryCalls.length = 0;
  queryResponses.length = 0;
});

describe("getItems pagination", () => {
  it("uses boards { items_page } for the first page", async () => {
    queryResponses.push({
      boards: [
        {
          items_page: {
            cursor: null,
            items: [
              {
                id: "1",
                name: "Item 1",
                group: { id: "g1", title: "Group 1" },
                column_values: [],
              },
            ],
          },
        },
      ],
    });

    const items = await getItems("12345");
    expect(items).toHaveLength(1);
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]).toContain("boards(ids:");
    expect(queryCalls[0]).toContain("items_page");
  });

  it("uses next_items_page for subsequent pages (not re-nested boards)", async () => {
    // First page returns a cursor
    queryResponses.push({
      boards: [
        {
          items_page: {
            cursor: "cursor_abc",
            items: [
              {
                id: "1",
                name: "Item 1",
                group: { id: "g1", title: "Group 1" },
                column_values: [],
              },
            ],
          },
        },
      ],
    });

    // Second page via next_items_page
    queryResponses.push({
      next_items_page: {
        cursor: null,
        items: [
          {
            id: "2",
            name: "Item 2",
            group: { id: "g1", title: "Group 1" },
            column_values: [],
          },
        ],
      },
    });

    const items = await getItems("12345");
    expect(items).toHaveLength(2);
    expect(queryCalls).toHaveLength(2);

    // First call: nested in boards
    expect(queryCalls[0]).toContain("boards(ids:");

    // Second call: uses next_items_page at root level, NOT nested in boards
    expect(queryCalls[1]).toContain("next_items_page");
    expect(queryCalls[1]).not.toContain("boards(ids:");
  });

  it("uses page size of 500", async () => {
    queryResponses.push({
      boards: [
        {
          items_page: {
            cursor: null,
            items: [],
          },
        },
      ],
    });

    await getItems("12345");
    expect(queryCalls[0]).toContain("limit: 500");
  });
});

describe("getItemsRich pagination", () => {
  it("uses next_items_page for subsequent pages", async () => {
    // First page
    queryResponses.push({
      boards: [
        {
          items_page: {
            cursor: "cursor_xyz",
            items: [
              {
                id: "1",
                name: "Item 1",
                group: { id: "g1", title: "Group 1" },
                column_values: [
                  { id: "col1", type: "text", text: "val", value: null },
                ],
              },
            ],
          },
        },
      ],
    });

    // Second page
    queryResponses.push({
      next_items_page: {
        cursor: null,
        items: [
          {
            id: "2",
            name: "Item 2",
            group: { id: "g1", title: "Group 1" },
            column_values: [
              { id: "col1", type: "text", text: "val2", value: null },
            ],
          },
        ],
      },
    });

    const items = await getItemsRich("12345");
    expect(items).toHaveLength(2);
    expect(queryCalls).toHaveLength(2);

    // Second call should use next_items_page, not boards
    expect(queryCalls[1]).toContain("next_items_page");
    expect(queryCalls[1]).not.toContain("boards(ids:");
  });
});
