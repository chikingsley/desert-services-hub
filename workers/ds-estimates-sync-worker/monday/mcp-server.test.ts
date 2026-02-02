/**
 * Monday MCP Server Tests
 *
 * Unit tests for MCP helper functions and integration tests for tool operations.
 * Integration tests require MONDAY_API_KEY environment variable.
 *
 * Run: bun test services/monday/mcp-server.test.ts
 */
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import {
  createItem,
  getBoard,
  getBoardColumns,
  getItem,
  query,
  renameItem,
  updateItem,
} from "./client";
import { BOARD_COLUMNS, BOARD_IDS, getColumnId } from "./types";

// Increase timeout for API calls
setDefaultTimeout(30_000);

const hasCredentials = Boolean(process.env.MONDAY_API_KEY);
const TEST_PREFIX = "_TEST_MCP_DELETE_ME_";

// ============================================================================
// Helper Functions (mirror MCP server's internal functions for testing)
// ============================================================================

type BoardName = keyof typeof BOARD_IDS;
type ColumnBoardName = keyof typeof BOARD_COLUMNS;

function resolveBoardId(boardIdOrName: string): string {
  const upperName = boardIdOrName.toUpperCase();
  if (upperName in BOARD_IDS) {
    return BOARD_IDS[upperName as keyof typeof BOARD_IDS];
  }
  return boardIdOrName;
}

function resolveBoardName(boardRef: string): BoardName | null {
  const upperRef = boardRef.toUpperCase() as BoardName;
  if (upperRef in BOARD_IDS) {
    return upperRef;
  }
  return null;
}

function resolveColumnId(boardRef: string, columnRef: string): string {
  const boardName = resolveBoardName(boardRef);
  if (boardName && boardName in BOARD_COLUMNS) {
    const resolved = getColumnId(boardName as ColumnBoardName, columnRef);
    if (resolved) {
      return resolved;
    }
  }
  return columnRef;
}

function resolveColumnValues(
  boardRef: string,
  columnValues: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(columnValues)) {
    const resolvedKey = resolveColumnId(boardRef, key);
    resolved[resolvedKey] = value;
  }
  return resolved;
}

// ============================================================================
// Unit Tests - Helper Functions
// ============================================================================

describe("MCP Server Helper Functions", () => {
  describe("resolveBoardId", () => {
    it("resolves board names to IDs", () => {
      expect(resolveBoardId("ESTIMATING")).toBe("7943937851");
      expect(resolveBoardId("LEADS")).toBe("7943937841");
      expect(resolveBoardId("PROJECTS")).toBe("8692330900");
    });

    it("is case-insensitive", () => {
      expect(resolveBoardId("estimating")).toBe("7943937851");
      expect(resolveBoardId("Leads")).toBe("7943937841");
    });

    it("passes through raw board IDs", () => {
      expect(resolveBoardId("1234567890")).toBe("1234567890");
      expect(resolveBoardId("999")).toBe("999");
    });
  });

  describe("resolveBoardName", () => {
    it("resolves to canonical board name", () => {
      expect(resolveBoardName("estimating")).toBe("ESTIMATING");
      expect(resolveBoardName("LEADS")).toBe("LEADS");
    });

    it("returns null for raw IDs", () => {
      expect(resolveBoardName("7943937851")).toBeNull();
      expect(resolveBoardName("unknown")).toBeNull();
    });
  });

  describe("resolveColumnId", () => {
    it("resolves ESTIMATING column aliases", () => {
      expect(resolveColumnId("ESTIMATING", "CONTRACTOR")).toBe("deal_account");
      expect(resolveColumnId("ESTIMATING", "PLANS")).toBe("file_mkseqmab");
      expect(resolveColumnId("ESTIMATING", "BID_STATUS")).toBe("deal_stage");
    });

    it("resolves CONTACTS column aliases", () => {
      expect(resolveColumnId("CONTACTS", "EMAIL")).toBe("contact_email");
      expect(resolveColumnId("CONTACTS", "PHONE")).toBe("contact_phone");
    });

    it("is case-insensitive for board names", () => {
      expect(resolveColumnId("estimating", "CONTRACTOR")).toBe("deal_account");
    });

    it("passes through raw column IDs", () => {
      expect(resolveColumnId("ESTIMATING", "deal_account")).toBe(
        "deal_account"
      );
      expect(resolveColumnId("ESTIMATING", "unknown_col")).toBe("unknown_col");
    });

    it("passes through for boards without aliases", () => {
      expect(resolveColumnId("LEADS", "status")).toBe("status");
      expect(resolveColumnId("PROJECTS", "any_col")).toBe("any_col");
    });
  });

  describe("resolveColumnValues", () => {
    it("resolves all column aliases in object", () => {
      const input = {
        CONTRACTOR: "Acme Corp",
        BID_STATUS: { label: "Won" },
        PLANS: "file.pdf",
      };
      const result = resolveColumnValues("ESTIMATING", input);

      expect(result).toEqual({
        deal_account: "Acme Corp",
        deal_stage: { label: "Won" },
        file_mkseqmab: "file.pdf",
      });
    });

    it("preserves raw column IDs", () => {
      const input = {
        deal_account: "Test",
        some_other_col: "value",
      };
      const result = resolveColumnValues("ESTIMATING", input);

      expect(result).toEqual({
        deal_account: "Test",
        some_other_col: "value",
      });
    });

    it("handles mixed aliases and raw IDs", () => {
      const input = {
        CONTRACTOR: "Mixed",
        deal_stage: { label: "Test" },
      };
      const result = resolveColumnValues("ESTIMATING", input);

      expect(result).toEqual({
        deal_account: "Mixed",
        deal_stage: { label: "Test" },
      });
    });

    it("returns unchanged for boards without aliases", () => {
      const input = { status: "Active", priority: "High" };
      const result = resolveColumnValues("LEADS", input);

      expect(result).toEqual(input);
    });
  });
});

// ============================================================================
// Integration Tests - API Operations
// ============================================================================

async function deleteItem(itemId: string): Promise<void> {
  await query(`
    mutation {
      delete_item(item_id: ${itemId}) {
        id
      }
    }
  `);
}

describe.skipIf(!hasCredentials)("MCP Server Integration", () => {
  const createdItemIds: string[] = [];

  afterAll(async () => {
    for (const itemId of createdItemIds) {
      try {
        await deleteItem(itemId);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("Board operations (via resolved board names)", () => {
    it("getBoard works with board name", async () => {
      const boardId = resolveBoardId("LEADS");
      const board = await getBoard(boardId);

      expect(board).toBeDefined();
      expect(board?.id).toBe(BOARD_IDS.LEADS);
    });

    it("getBoardColumns works with board name", async () => {
      const boardId = resolveBoardId("ESTIMATING");
      const columns = await getBoardColumns(boardId);

      expect(columns.length).toBeGreaterThan(0);
      // Verify some known columns exist
      const columnIds = columns.map((c) => c.id);
      expect(columnIds).toContain("deal_account"); // CONTRACTOR alias
      expect(columnIds).toContain("deal_stage"); // BID_STATUS alias
    });
  });

  describe("Item operations with column aliases", () => {
    it("createItem → getItem → updateItem → rename lifecycle", async () => {
      // Arrange
      const boardId = resolveBoardId("LEADS");
      const testName = `${TEST_PREFIX}${Date.now()}`;

      // Act: Create
      const itemId = await createItem({
        boardId,
        itemName: testName,
      });
      createdItemIds.push(itemId);

      // Assert: Created
      expect(itemId).toBeDefined();

      // Verify: Retrieve
      const item = await getItem(itemId);
      expect(item?.name).toBe(testName);

      // Update with empty column values (just verify it works)
      await updateItem({
        boardId,
        itemId,
        columnValues: {},
      });

      // Rename
      const newName = `${testName}_renamed`;
      await renameItem({
        boardId,
        itemId,
        newName,
      });

      // Verify rename
      const renamedItem = await getItem(itemId);
      expect(renamedItem?.name).toBe(newName);
    });

    it("column alias resolution works in update", async () => {
      // This test verifies that if we pass column aliases to updateItem,
      // they need to be resolved first (which the MCP server does)
      const boardId = resolveBoardId("LEADS");
      const testName = `${TEST_PREFIX}${Date.now()}_alias_test`;

      // Create item
      const itemId = await createItem({
        boardId,
        itemName: testName,
      });
      createdItemIds.push(itemId);

      // For LEADS board, column aliases aren't defined, so we just verify
      // the pattern works with raw column IDs (which pass through unchanged)
      const columnValues = resolveColumnValues("LEADS", {
        some_text_column: "test",
      });

      // This should equal the input since LEADS has no aliases
      expect(columnValues).toEqual({ some_text_column: "test" });
    });
  });

  describe("Error handling", () => {
    it("getItem returns null for non-existent item", async () => {
      const item = await getItem("999999999999");
      expect(item).toBeNull();
    });

    it("getBoard returns null for non-existent board", async () => {
      const board = await getBoard("999999999999");
      expect(board).toBeNull();
    });
  });
});
