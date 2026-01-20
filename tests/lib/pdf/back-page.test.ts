// Test: PDF with back page (catalog pricing page appended)
// Run: bun test tests/lib/pdf/back-page.test.ts

import { describe, expect, test } from "bun:test";
import {
  generateBackPagePDF,
  generatePDF,
  savePDF,
} from "@/lib/pdf/generate-pdf";
import { maxCatalogQuote } from "./test-data";

describe("PDF Generation - Back Page", () => {
  test("generates valid standalone back page PDF", async () => {
    const buffer = await generateBackPagePDF();

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // PDF files start with %PDF
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("generates valid PDF with back page included", async () => {
    const buffer = await generatePDF(maxCatalogQuote, {
      style: "sectioned",
      includeBackPage: true,
    });

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);

    // PDF files start with %PDF
    const header = Buffer.from(buffer.subarray(0, 4)).toString();
    expect(header).toBe("%PDF");
  });

  test("PDF with back page is larger than without", async () => {
    const withoutBackPage = await generatePDF(maxCatalogQuote, {
      style: "sectioned",
      includeBackPage: false,
    });

    const withBackPage = await generatePDF(maxCatalogQuote, {
      style: "sectioned",
      includeBackPage: true,
    });

    // Back page adds at least one page worth of content
    expect(withBackPage.length).toBeGreaterThan(withoutBackPage.length);
  });

  test("saves PDF with back page to file", async () => {
    const outPath = await savePDF(
      maxCatalogQuote,
      "test-pdf-with-backpage.pdf",
      {
        style: "sectioned",
        includeBackPage: true,
      }
    );

    expect(outPath).toBe("test-pdf-with-backpage.pdf");

    // Verify file exists and is valid PDF
    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves standalone back page to file", async () => {
    const buffer = await generateBackPagePDF();
    const outPath = "test-pdf-backpage-only.pdf";
    await Bun.write(outPath, buffer);

    // Verify file exists and is valid PDF
    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const savedBuffer = Buffer.from(await file.arrayBuffer());
    const header = savedBuffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });
});
