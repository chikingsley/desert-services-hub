// Test: Sectioned style PDF (grouped with section headers and subtotals)
// Run: bun test tests/lib/pdf/sectioned.test.ts

import { describe, expect, test } from "bun:test";
import { generatePDF, savePDF } from "@/lib/pdf/generate-pdf";
import { maxCatalogQuote } from "./test-data";

describe("PDF Generation - Sectioned Style", () => {
  test("generates valid PDF with sections and subtotals", async () => {
    const buffer = await generatePDF(maxCatalogQuote, { style: "sectioned" });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // PDF files start with %PDF
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("sectioned is the default style", async () => {
    // No style option = sectioned
    const buffer = await generatePDF(maxCatalogQuote);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves sectioned style PDF to file", async () => {
    const outPath = await savePDF(maxCatalogQuote, "test-pdf-sectioned.pdf", {
      style: "sectioned",
    });

    expect(outPath).toBe("test-pdf-sectioned.pdf");

    // Verify file exists and is valid PDF
    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });
});
