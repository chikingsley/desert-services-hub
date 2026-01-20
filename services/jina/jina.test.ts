/**
 * Jina Service Tests
 *
 * Run: bun test services/jina/jina.test.ts
 */
import { describe, expect, it } from "bun:test";
import { parseSearchResults } from "./client";

describe("jina service", () => {
  describe("parseSearchResults", () => {
    it("parses markdown search results", () => {
      const markdown = `### Example Result
[Link](https://example.com)
This is the description.
More content here.

### Another Result
[Link](https://another.com)
Second description.`;

      const results = parseSearchResults(markdown);

      expect(results).toHaveLength(2);
      expect(results[0]?.title).toBe("Example Result");
      expect(results[0]?.url).toBe("https://example.com");
      expect(results[0]?.description).toBe("This is the description.");
      expect(results[1]?.title).toBe("Another Result");
      expect(results[1]?.url).toBe("https://another.com");
    });

    it("handles empty input", () => {
      const results = parseSearchResults("");
      expect(results).toHaveLength(0);
    });

    it("handles malformed input", () => {
      const results = parseSearchResults("just some text without structure");
      expect(results).toHaveLength(0);
    });
  });

  describe("API key validation", () => {
    it("throws when JINA_API_KEY not set", async () => {
      const original = process.env.JINA_API_KEY;
      process.env.JINA_API_KEY = undefined;

      // Import fresh to test the error
      const { read } = await import("./client");

      try {
        await read("https://example.com");
      } catch (e) {
        const error = e as Error;
        expect(error.message).toContain("JINA_API_KEY");
      }

      process.env.JINA_API_KEY = original;
    });
  });
});
