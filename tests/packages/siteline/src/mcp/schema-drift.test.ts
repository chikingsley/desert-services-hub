import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface IntrospectionField {
  name: string;
}

interface IntrospectionType {
  fields?: IntrospectionField[] | null;
  inputFields?: IntrospectionField[] | null;
  name: string;
}

interface IntrospectionDocument {
  __schema: {
    mutationType: { name: string } | null;
    queryType: { fields: IntrospectionField[] };
    types: IntrospectionType[];
  };
}

const INTROSPECTION_PATH = resolve(
  process.cwd(),
  "packages/siteline/src/mcp/reference/siteline-api-introspection.json"
);

function loadIntrospection(): IntrospectionDocument {
  const raw = readFileSync(INTROSPECTION_PATH, "utf8");
  return JSON.parse(raw) as IntrospectionDocument;
}

function toNameSet(
  values: IntrospectionField[] | null | undefined
): Set<string> {
  return new Set((values ?? []).map((value) => value.name));
}

describe("Siteline introspection drift guard", () => {
  test("query root keeps required read tools", () => {
    const doc = loadIntrospection();
    const queryNames = toNameSet(doc.__schema.queryType.fields);

    for (const required of [
      "contract",
      "currentCompany",
      "paginatedContracts",
      "paginatedPayApps",
      "payApp",
    ]) {
      expect(queryNames.has(required)).toBe(true);
    }
  });

  test("key scope remains read-only (no mutation root)", () => {
    const doc = loadIntrospection();
    expect(doc.__schema.mutationType).toBeNull();
  });

  test("GetPaginatedContractsInput keeps fields used by MCP tool", () => {
    const doc = loadIntrospection();
    const type = doc.__schema.types.find(
      (candidate) => candidate.name === "GetPaginatedContractsInput"
    );
    expect(type).toBeDefined();

    const inputNames = toNameSet(type?.inputFields);
    for (const required of [
      "contractStatus",
      "cursor",
      "limit",
      "month",
      "payAppStatus",
      "search",
    ]) {
      expect(inputNames.has(required)).toBe(true);
    }
  });

  test("Project type keeps fields used by MCP contract payloads", () => {
    const doc = loadIntrospection();
    const type = doc.__schema.types.find(
      (candidate) => candidate.name === "Project"
    );
    expect(type).toBeDefined();

    const fieldNames = toNameSet(type?.fields);
    for (const required of ["id", "name", "projectNumber"]) {
      expect(fieldNames.has(required)).toBe(true);
    }
  });
});
