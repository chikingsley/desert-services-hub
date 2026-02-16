import { expect, test } from "bun:test";
import { buildSsspDocDefinition } from "@documents/pdf/sssp/build-sssp-doc-definition";
import type { SsspDocument } from "@documents/pdf/sssp/types";

const TEST_LOGO = "data:image/png;base64,AA==";

function buildDoc(overrides: Partial<SsspDocument> = {}): SsspDocument {
  return {
    projectName: "Test Project",
    projectAddress: "123 Test St, Phoenix, AZ",
    scopeItems: [
      {
        title: "Scope",
        details: [
          "Water truck support",
          "Street sweeping",
          "Portable sanitation service",
        ],
      },
    ],
    ...overrides,
  };
}

function contentText(doc: SsspDocument): string {
  const definition = buildSsspDocDefinition(doc, TEST_LOGO);
  return JSON.stringify(definition.content ?? []);
}

test("SSSP section heuristics include service sections by default", () => {
  const text = contentText(buildDoc());

  expect(text).toContain("Water Truck Operations");
  expect(text).toContain("Street Sweeping");
  expect(text).toContain(
    "Disinfectants used for portable sanitation servicing"
  );
});

test("SSSP sections[] empty excludes optional service sections", () => {
  const text = contentText(
    buildDoc({
      sections: [],
    })
  );

  expect(text).not.toContain("Water Truck Operations");
  expect(text).not.toContain("Street Sweeping");
  expect(text).not.toContain(
    "Disinfectants used for portable sanitation servicing"
  );
});

test("SSSP sections[] explicitly selects only requested service sections", () => {
  const text = contentText(
    buildDoc({
      sections: ["street-sweeping"],
    })
  );

  expect(text).not.toContain("Water Truck Operations");
  expect(text).toContain("Street Sweeping");
  expect(text).not.toContain(
    "Disinfectants used for portable sanitation servicing"
  );
});

test("SSSP sections[] takes precedence over legacy include* fields", () => {
  const text = contentText(
    buildDoc({
      sections: [],
      includeWaterTruckSection: true,
      includeStreetSweepingSection: true,
      includePortableSanitationSection: true,
    })
  );

  expect(text).not.toContain("Water Truck Operations");
  expect(text).not.toContain("Street Sweeping");
  expect(text).not.toContain(
    "Disinfectants used for portable sanitation servicing"
  );
});

test("legacy include* fields still work when sections[] is not provided", () => {
  const text = contentText(
    buildDoc({
      scopeItems: [{ title: "Scope", details: ["BMP installation only"] }],
      includeWaterTruckSection: true,
      includeStreetSweepingSection: true,
      includePortableSanitationSection: true,
    })
  );

  expect(text).toContain("Water Truck Operations");
  expect(text).toContain("Street Sweeping");
  expect(text).toContain(
    "Disinfectants used for portable sanitation servicing"
  );
});
