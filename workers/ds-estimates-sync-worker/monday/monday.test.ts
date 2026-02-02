/**
 * Monday.com Service Tests
 *
 * Run: bun test services/monday/monday.test.ts
 */
import { describe, expect, it } from "bun:test";
import { calculateSimilarity } from "./client";

describe("monday service", () => {
  describe("calculateSimilarity", () => {
    it("returns 1 for exact match", () => {
      expect(calculateSimilarity("hello", "hello")).toBe(1);
      expect(calculateSimilarity("Hello", "hello")).toBe(1);
    });

    it("returns 0.9 for contains match", () => {
      expect(calculateSimilarity("hello world", "hello")).toBe(0.9);
      expect(calculateSimilarity("hello", "hello world")).toBe(0.9);
    });

    it("returns partial match for word overlap", () => {
      const score = calculateSimilarity(
        "Phoenix Retail Project",
        "Phoenix Retail Center"
      );
      expect(score).toBeGreaterThan(0.5);
    });

    it("returns 0 for no overlap", () => {
      expect(calculateSimilarity("abc", "xyz")).toBe(0);
    });

    it("ignores short words", () => {
      expect(calculateSimilarity("a b c", "x y z")).toBe(0);
    });
  });

  describe("API key validation", () => {
    it("throws when MONDAY_API_KEY not set", async () => {
      const original = process.env.MONDAY_API_KEY;
      process.env.MONDAY_API_KEY = undefined;

      const { query } = await import("./client");

      await expect(query("{ users { id } }")).rejects.toThrow("MONDAY_API_KEY");

      process.env.MONDAY_API_KEY = original;
    });
  });
});
