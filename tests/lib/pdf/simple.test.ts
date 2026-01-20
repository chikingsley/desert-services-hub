// Test: Simple style PDF (flat line items, no sections)
// Run: bun test tests/lib/pdf/simple.test.ts

import { describe, expect, test } from "bun:test";
import { generatePDF, savePDF } from "@/lib/pdf/generate-pdf";
import { simpleQuote } from "./test-data";

describe("PDF Generation - Simple Style", () => {
  test("generates valid PDF with flat line items", async () => {
    const buffer = await generatePDF(simpleQuote, { style: "simple" });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // PDF files start with %PDF
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves simple style PDF to file", async () => {
    const outPath = await savePDF(simpleQuote, "test-pdf-simple.pdf", {
      style: "simple",
    });

    expect(outPath).toBe("test-pdf-simple.pdf");

    // Verify file exists and is valid PDF
    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });
});
