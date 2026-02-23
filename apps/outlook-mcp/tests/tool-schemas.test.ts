import { describe, expect, test } from "bun:test";
import { authTools } from "@outlook/auth/tools";
import { emailTools } from "@outlook/email/tools";
import { folderTools } from "@outlook/folder/tools";
import { rulesTools } from "@outlook/rules/tools";

const ALL_TOOLS = [...authTools, ...emailTools, ...folderTools, ...rulesTools];

describe("tool registry", () => {
  test("no duplicate tool names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  test("expected tool count", () => {
    // Update this if tools are added/removed intentionally
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(15);
  });
});

describe("tool schema completeness", () => {
  for (const tool of ALL_TOOLS) {
    test(`${tool.name} has required fields`, () => {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      expect(typeof tool.handler).toBe("function");
    });

    test(`${tool.name} has additionalProperties: false`, () => {
      expect(
        (tool.inputSchema as Record<string, unknown>).additionalProperties
      ).toBe(false);
    });

    test(`${tool.name} required fields exist in properties`, () => {
      const props = Object.keys(tool.inputSchema.properties ?? {});
      for (const req of tool.inputSchema.required ?? []) {
        expect(props).toContain(req);
      }
    });
  }
});
