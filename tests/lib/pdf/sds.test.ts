import { describe, expect, test } from "bun:test";
import {
  generateSdsPDF,
  saveSdsPDF,
} from "@lib/pdf/sds/generate-sds-pdf.server";
import type { SdsListDocument } from "@lib/pdf/sds/types";
import { getPdfTestOutputPath } from "./output-path";

const sdsDoc: SdsListDocument = {
  title: "Safety Data Sheets",
  subtitle: "Chemical Inventory List",
  updated: "February 2026",
  revision: "1",
  entries: [
    {
      tradeName: "Sample Solvent",
      supplier: "Sample Supplier",
      page: 1,
      url: "https://example.com/sds/sample-solvent.pdf",
    },
    {
      tradeName: "Sample Cleaner",
      supplier: "Sample Supplier",
      page: 2,
    },
  ],
};

describe("SDS PDF Generation", () => {
  test("generates a valid PDF buffer", async () => {
    const bytes = await generateSdsPDF(sdsDoc);

    expect(bytes.length).toBeGreaterThan(0);

    const header = Buffer.from(bytes.subarray(0, 4)).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF to file", async () => {
    const targetPath = getPdfTestOutputPath("test-sds.pdf");
    const outPath = await saveSdsPDF(sdsDoc, targetPath);

    expect(outPath).toBe(targetPath);

    const file = Bun.file(outPath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = Buffer.from(bytes.subarray(0, 4)).toString();
    expect(header).toBe("%PDF");
  });
});
