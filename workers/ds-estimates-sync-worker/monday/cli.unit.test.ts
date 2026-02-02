/**
 * Monday CLI Unit Tests
 *
 * Tests for CLI argument parsing and filter logic.
 * No API calls - pure unit tests.
 *
 * Run: bun test services/monday/cli.unit.test.ts
 */
import { describe, expect, it } from "bun:test";
import type { ItemFilter } from "./cli";
import {
  applyFilters,
  parseArgs,
  parseColumnValues,
  parseFilters,
  resolveBoardId,
} from "./cli";
import type { MondayItem } from "./types";

describe("CLI argument parsing", () => {
  describe("parseArgs", () => {
    it("parses command with no arguments", () => {
      const result = parseArgs(["boards"]);
      expect(result.command).toBe("boards");
      expect(result.positional).toEqual([]);
      expect(result.flags).toEqual({});
    });

    it("parses command with positional arguments", () => {
      const result = parseArgs(["search", "ESTIMATING", "Phoenix"]);
      expect(result.command).toBe("search");
      expect(result.positional).toEqual(["ESTIMATING", "Phoenix"]);
    });

    it("parses flags with values", () => {
      const result = parseArgs(["items", "LEADS", "--limit", "10"]);
      expect(result.command).toBe("items");
      expect(result.positional).toEqual(["LEADS"]);
      expect(result.flags.limit).toBe("10");
    });

    it("parses boolean flags", () => {
      const result = parseArgs(["search", "LEADS", "test", "--fuzzy"]);
      expect(result.flags.fuzzy).toBe(true);
    });

    it("parses repeatable --col flags", () => {
      const result = parseArgs([
        "create",
        "LEADS",
        "--name",
        "Test",
        "--col",
        "status=New",
        "--col",
        "priority=High",
      ]);
      expect(result.flags.name).toBe("Test");
      expect(result.flags.col).toEqual(["status=New", "priority=High"]);
    });

    it("handles empty args", () => {
      const result = parseArgs([]);
      expect(result.command).toBe("");
      expect(result.positional).toEqual([]);
    });
  });

  describe("resolveBoardId", () => {
    it("resolves board names to IDs", () => {
      expect(resolveBoardId("ESTIMATING")).toBe("7943937851");
      expect(resolveBoardId("LEADS")).toBe("7943937841");
      expect(resolveBoardId("PROJECTS")).toBe("8692330900");
    });

    it("is case-insensitive for board names", () => {
      expect(resolveBoardId("estimating")).toBe("7943937851");
      expect(resolveBoardId("Leads")).toBe("7943937841");
    });

    it("passes through raw board IDs", () => {
      expect(resolveBoardId("1234567890")).toBe("1234567890");
      expect(resolveBoardId("999")).toBe("999");
    });
  });

  describe("parseFilters", () => {
    it("parses --contains filter", () => {
      const filters = parseFilters({ contains: "status=Done" });
      expect(filters).toEqual([
        { type: "contains", column: "status", value: "Done" },
      ]);
    });

    it("handles values with equals signs", () => {
      const filters = parseFilters({ contains: "formula=a=b+c" });
      expect(filters).toEqual([
        { type: "contains", column: "formula", value: "a=b+c" },
      ]);
    });

    it("parses --empty filter", () => {
      const filters = parseFilters({ empty: "contractor" });
      expect(filters).toEqual([{ type: "empty", column: "contractor" }]);
    });

    it("parses --not-empty filter", () => {
      const filters = parseFilters({ "not-empty": "email" });
      expect(filters).toEqual([{ type: "not-empty", column: "email" }]);
    });

    it("parses --group filter", () => {
      const filters = parseFilters({ group: "new_leads" });
      expect(filters).toEqual([{ type: "group", value: "new_leads" }]);
    });

    it("returns empty array for no filters", () => {
      const filters = parseFilters({});
      expect(filters).toEqual([]);
    });
  });

  describe("applyFilters", () => {
    const testItems: MondayItem[] = [
      {
        id: "1",
        name: "Item One",
        groupId: "new_leads",
        groupTitle: "New Leads",
        url: "https://example.com/1",
        columns: { status: "Done", contractor: "Acme Corp" },
      },
      {
        id: "2",
        name: "Item Two",
        groupId: "new_leads",
        groupTitle: "New Leads",
        url: "https://example.com/2",
        columns: { status: "In Progress", contractor: "" },
      },
      {
        id: "3",
        name: "Item Three",
        groupId: "archived",
        groupTitle: "Archived",
        url: "https://example.com/3",
        columns: { status: "Done", contractor: "Beta Inc" },
      },
    ];

    it("filters by contains", () => {
      const filters: ItemFilter[] = [
        { type: "contains", column: "status", value: "Done" },
      ];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["1", "3"]);
    });

    it("filters by contains case-insensitively", () => {
      const filters: ItemFilter[] = [
        { type: "contains", column: "contractor", value: "acme" },
      ];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("filters by empty column", () => {
      const filters: ItemFilter[] = [{ type: "empty", column: "contractor" }];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["2"]);
    });

    it("filters by not-empty column", () => {
      const filters: ItemFilter[] = [
        { type: "not-empty", column: "contractor" },
      ];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["1", "3"]);
    });

    it("filters by group ID", () => {
      const filters: ItemFilter[] = [{ type: "group", value: "new_leads" }];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["1", "2"]);
    });

    it("filters by group title (partial match)", () => {
      const filters: ItemFilter[] = [{ type: "group", value: "archived" }];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["3"]);
    });

    it("applies multiple filters (AND logic)", () => {
      const filters: ItemFilter[] = [
        { type: "contains", column: "status", value: "Done" },
        { type: "group", value: "new_leads" },
      ];
      const result = applyFilters(testItems, filters);
      expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("returns all items with no filters", () => {
      const result = applyFilters(testItems, []);
      expect(result).toHaveLength(3);
    });
  });

  describe("parseColumnValues", () => {
    it("parses single column value", () => {
      const result = parseColumnValues(["status=Done"]);
      expect(result).toEqual({ status: "Done" });
    });

    it("parses multiple column values", () => {
      const result = parseColumnValues(["status=Done", "priority=High"]);
      expect(result).toEqual({ status: "Done", priority: "High" });
    });

    it("handles values with equals signs", () => {
      const result = parseColumnValues(["formula=1+1=2"]);
      expect(result).toEqual({ formula: "1+1=2" });
    });

    it("parses JSON values", () => {
      const result = parseColumnValues(['data={"key":"value"}']);
      expect(result).toEqual({ data: { key: "value" } });
    });

    it("returns empty object for undefined", () => {
      const result = parseColumnValues(undefined);
      expect(result).toEqual({});
    });

    it("handles single string value", () => {
      const result = parseColumnValues("status=New");
      expect(result).toEqual({ status: "New" });
    });
  });
});
