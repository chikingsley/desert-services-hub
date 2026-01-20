/**
 * Tests for Jina + Gemini Company Enrichment
 *
 * Run: bun test services/enrichment/jina-gemini.test.ts
 */

import { describe, expect, test } from "bun:test";
import { enrichCompany, enrichProvider } from "./jina-gemini";

describe("Jina + Gemini Enrichment", () => {
  test("enrichCompany - known company", async () => {
    const result = await enrichCompany("Weinberger", {
      context: "roll-off dumpster rental",
      location: "Arizona",
    });

    console.log("Result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.company).toBeDefined();
    expect(result.company?.name).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.sources.length).toBeGreaterThan(0);
  });

  test("enrichProvider - short name (DX)", async () => {
    const result = await enrichProvider("DX", "roll-off dumpster", "Arizona");

    console.log("DX Result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.company).toBeDefined();
  });

  test("enrichProvider - short name (LP)", async () => {
    const result = await enrichProvider(
      "LP",
      "temporary fence rental",
      "Arizona"
    );

    console.log("LP Result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.company).toBeDefined();
  });

  test("enrichProvider - short name (WM)", async () => {
    const result = await enrichProvider("WM", "portable restroom", "Arizona");

    console.log("WM Result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.company).toBeDefined();
    // WM is likely Waste Management
    expect(
      result.company?.name?.toLowerCase().includes("waste") ||
        result.company?.fullName?.toLowerCase().includes("waste")
    ).toBe(true);
  });
});
