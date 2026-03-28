import { describe, expect, it } from "vite-plus/test";

import { normalizeApiPath } from "@/lib/api/client";

describe("normalizeApiPath", () => {
  it("prefixes relative paths with /api", () => {
    expect(normalizeApiPath("health")).toBe("/api/health");
  });

  it("preserves an existing /api prefix", () => {
    expect(normalizeApiPath("/api/catalog")).toBe("/api/catalog");
  });
});
