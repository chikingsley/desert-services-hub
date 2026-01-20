/**
 * Contract Document Processing Client - Tests
 *
 * Tests for PDF text extraction, contract parsing and reconciliation.
 */

import { describe, expect, test } from "bun:test";
import { extractTextWithPdftotext, loadFixture } from "./test-utils";

describe("Contract Processing", () => {
  describe("PDF Text Extraction", () => {
    test("extracts text from estimate PDF", async () => {
      const fixture = await loadFixture("greenway-embrey");
      if (fixture.files.estimate === undefined) {
        throw new Error("Missing estimate file");
      }
      const text = await extractTextWithPdftotext(fixture.files.estimate);

      expect(text.length).toBeGreaterThan(1000);
    }, 60_000);

    test("extracts text from contract PDF", async () => {
      const fixture = await loadFixture("greenway-embrey");
      if (fixture.files.contract === undefined) {
        throw new Error("Missing contract file");
      }
      const text = await extractTextWithPdftotext(fixture.files.contract);

      expect(text.length).toBeGreaterThan(1000);
    }, 60_000);
  });

  describe("Line Item Extraction", () => {
    test("estimate contains expected line items", async () => {
      const fixture = await loadFixture("greenway-embrey");
      if (fixture.files.estimate === undefined) {
        throw new Error("Missing estimate file");
      }
      const text = await extractTextWithPdftotext(fixture.files.estimate);

      expect(text).toContain("SWPPP Narrative");
    }, 60_000);

    test("contract contains expected exhibits", async () => {
      const fixture = await loadFixture("greenway-embrey");
      if (fixture.files.contract === undefined) {
        throw new Error("Missing contract file");
      }
      const text = await extractTextWithPdftotext(fixture.files.contract);

      expect(text).toContain("Exhibit A");
    }, 60_000);
  });

  describe("Fixture Validation", () => {
    test("all fixtures have valid expected.json", async () => {
      const fixtures = await Promise.all([
        loadFixture("greenway-embrey"),
        loadFixture("kiwanis-caliente"),
      ]);

      for (const fixture of fixtures) {
        expect(fixture.expected).toBeDefined();
        expect(fixture.expected.estimate).toBeDefined();
        expect(fixture.expected.estimate.totalAmount).toBeGreaterThan(0);
        expect(fixture.expected.estimate.items).toBeInstanceOf(Array);
      }
    });
  });
});
