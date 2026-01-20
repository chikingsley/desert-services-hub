// Test: Unbreakable sections toggle
// Run: bun test tests/lib/pdf/unbreakable.test.ts

import { describe, expect, test } from "bun:test";
import { generatePDF, savePDF } from "@/lib/pdf/generate-pdf";
import { maxCatalogQuote } from "./test-data";

describe("PDF Generation - Unbreakable Sections", () => {
  test("generates PDF with unbreakable sections (default)", async () => {
    // unbreakableSections defaults to true
    const buffer = await generatePDF(maxCatalogQuote, {
      style: "sectioned",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("generates PDF with unbreakable sections enabled", async () => {
    const buffer = await generatePDF(maxCatalogQuote, {
      style: "sectioned",
      unbreakableSections: true,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("generates PDF with unbreakable sections disabled", async () => {
    const buffer = await generatePDF(maxCatalogQuote, {
      style: "sectioned",
      unbreakableSections: false,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF with unbreakable sections enabled to file", async () => {
    const outPath = await savePDF(
      maxCatalogQuote,
      "test-pdf-unbreakable-true.pdf",
      {
        style: "sectioned",
        unbreakableSections: true,
      }
    );

    expect(outPath).toBe("test-pdf-unbreakable-true.pdf");

    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF with unbreakable sections disabled to file", async () => {
    const outPath = await savePDF(
      maxCatalogQuote,
      "test-pdf-unbreakable-false.pdf",
      {
        style: "sectioned",
        unbreakableSections: false,
      }
    );

    expect(outPath).toBe("test-pdf-unbreakable-false.pdf");

    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });
});
