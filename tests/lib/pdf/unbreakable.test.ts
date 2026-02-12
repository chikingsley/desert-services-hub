// Test: Unbreakable sections toggle
// Run: bun test tests/lib/pdf/unbreakable.test.ts

import { describe, expect, test } from "bun:test";
import {
  generateEstimatePDF,
  saveEstimatePDF,
} from "@/lib/pdf/estimate/generate-estimate-pdf.server";
import { getPdfTestOutputPath } from "./output-path";
import { maxCatalogQuote } from "./test-data";

describe("PDF Generation - Unbreakable Sections", () => {
  test("generates PDF with unbreakable sections (default)", async () => {
    // unbreakableSections defaults to true
    const buffer = await generateEstimatePDF(maxCatalogQuote, {
      style: "sectioned",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("generates PDF with unbreakable sections enabled", async () => {
    const buffer = await generateEstimatePDF(maxCatalogQuote, {
      style: "sectioned",
      unbreakableSections: true,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("generates PDF with unbreakable sections disabled", async () => {
    const buffer = await generateEstimatePDF(maxCatalogQuote, {
      style: "sectioned",
      unbreakableSections: false,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF with unbreakable sections enabled to file", async () => {
    const targetPath = getPdfTestOutputPath("test-pdf-unbreakable-true.pdf");
    const outPath = await saveEstimatePDF(maxCatalogQuote, targetPath, {
      style: "sectioned",
      unbreakableSections: true,
    });

    expect(outPath).toBe(targetPath);

    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF with unbreakable sections disabled to file", async () => {
    const targetPath = getPdfTestOutputPath("test-pdf-unbreakable-false.pdf");
    const outPath = await saveEstimatePDF(maxCatalogQuote, targetPath, {
      style: "sectioned",
      unbreakableSections: false,
    });

    expect(outPath).toBe(targetPath);

    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });
});
