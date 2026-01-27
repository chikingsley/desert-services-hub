/**
 * Enrichment Service Tests
 *
 * Run: bun test src/lib/enrichment/enrichment.test.ts
 */
import { describe, expect, it } from "bun:test";
import { findBestWebsite } from "./jina";
import { enrichCompanyByName } from "./pdl";
import { smartEnrich } from "./smart-enrich";

describe("enrichment service", () => {
  describe("jina", () => {
    it("finds best website from search results", () => {
      const results = [
        {
          title: "Baker Construction",
          url: "https://bakerconstruction.com/",
          description: "",
        },
        {
          title: "Baker on Yelp",
          url: "https://yelp.com/biz/baker",
          description: "",
        },
        {
          title: "Baker on LinkedIn",
          url: "https://linkedin.com/company/baker",
          description: "",
        },
      ];

      const best = findBestWebsite("Baker Construction", results);
      expect(best).toBe("https://bakerconstruction.com/");
    });

    it("penalizes aggregator sites", () => {
      const results = [
        {
          title: "Baker on Yelp",
          url: "https://yelp.com/biz/baker",
          description: "",
        },
        { title: "Baker Co", url: "https://bakerco.com/", description: "" },
      ];

      const best = findBestWebsite("Baker", results);
      expect(best).toBe("https://bakerco.com/");
    });

    it("returns null for empty results", () => {
      const best = findBestWebsite("Test", []);
      expect(best).toBeNull();
    });
  });

  describe("pdl", () => {
    it("enriches known company by name", async () => {
      const result = await enrichCompanyByName("Microsoft");

      expect(result.success).toBe(true);
      expect(result.company?.name).toBe("Microsoft");
      expect(result.company?.website).toBe("microsoft.com");
      expect(result.likelihood).toBeGreaterThanOrEqual(1);
    });

    it("returns not found for unknown company", async () => {
      const result = await enrichCompanyByName("XYZNONEXISTENT12345");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Company not found");
    });

    it("enriches construction company", async () => {
      const result = await enrichCompanyByName("Caliente Construction Inc");

      expect(result.success).toBe(true);
      expect(result.company?.industry).toBe("construction");
      expect(result.company?.state).toBe("arizona");
    });
  });

  describe("smartEnrich", () => {
    it("uses PDL for known companies", async () => {
      const result = await smartEnrich("Microsoft");

      expect(result.success).toBe(true);
      expect(result.source).toBe("pdl");
      expect(result.company?.name).toBe("Microsoft");
    });

    it("returns company info structure", async () => {
      const result = await smartEnrich("Caliente Construction Inc");

      expect(result.success).toBe(true);
      expect(result.company).toHaveProperty("name");
      expect(result.company).toHaveProperty("website");
      expect(result.company).toHaveProperty("address");
      expect(result.company).toHaveProperty("phone");
      expect(result.company).toHaveProperty("description");
    });
  });
});
