import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import {
  generateEstimatePDF,
  getEstimatePDFFilename,
} from "@documents/pdf/estimate/generate-estimate-pdf.server";
import { createLineItems } from "@estimates/catalog/catalog";
import { getPdfTestOutputPath } from "./output-path";

const CATALOG_NAME_ERROR_RE = /catalog code or exact catalog name/i;

const baseLineItems = createLineItems([
  { code: "CM-003", qty: 500 },
  { code: "CM-001", qty: 1 },
  { code: "CM-005", qty: 12 },
]);

const testQuote = {
  estimateNumber: "251227-01",
  date: new Date().toISOString(),
  estimator: "Jared Aiken",
  estimatorEmail: "jared@desertservices.net",
  billTo: {
    companyName: "ABC General Contractors",
    address: "1234 Commerce Blvd, Phoenix, AZ 85001",
    email: "contact@abcgeneral.com",
    phone: "(602) 555-0100",
  },
  jobInfo: {
    siteName: "Sunset Ridge Phase 2",
    address: "7890 N Scottsdale Rd, Scottsdale, AZ 85250",
  },
  sections: [],
  lineItems: baseLineItems.map((item, index) => ({
    id: String(index + 1),
    item: item.item,
    description: item.description,
    qty: item.qty,
    uom: item.uom,
    cost: item.cost,
    total: item.total,
  })),
  total: baseLineItems.reduce((sum, item) => sum + item.total, 0),
};

describe("PDF Generation", () => {
  test("generates a valid PDF buffer", async () => {
    const buffer = await generateEstimatePDF(testQuote);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF to file", async () => {
    const buffer = await generateEstimatePDF(testQuote);
    const outPath = getPdfTestOutputPath("example-estimate.pdf");

    writeFileSync(outPath, buffer);

    expect(buffer.length).toBeGreaterThan(0);
  });

  test("rejects non-catalog line items", async () => {
    const invalidQuote = {
      ...testQuote,
      lineItems: [
        {
          id: "bad-1",
          item: "Silt Fence",
          description: "not catalog",
          qty: 1,
          uom: "LF",
          cost: 10,
          total: 10,
        },
      ],
    };

    await expect(generateEstimatePDF(invalidQuote)).rejects.toThrow(
      CATALOG_NAME_ERROR_RE
    );
  });

  test("generates correct filename", () => {
    const filename = getEstimatePDFFilename(testQuote);
    expect(filename).toBe("Estimate-251227-01-abc-general-contractors.pdf");
  });
});
