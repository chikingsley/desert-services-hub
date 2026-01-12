import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { generatePDF, getPDFFilename } from "./generate";

const testQuote = {
  estimateNumber: "251227-01",
  date: new Date().toISOString(),
  estimator: "John Smith",
  estimatorEmail: "john@desertservices.com",
  billTo: {
    companyName: "ABC General Contractors",
    address: "1234 Commerce Blvd, Suite 500",
    address2: "Phoenix, AZ 85001",
  },
  project: { name: "Sunset Ridge Development Phase 2" },
  siteAddress: {
    line1: "7890 N Scottsdale Rd",
    line2: "Scottsdale, AZ 85250",
  },
  sections: [],
  lineItems: [
    {
      id: "1",
      item: "Silt Fence",
      description: "Install silt fence per SWPPP",
      qty: 500,
      uom: "LF",
      cost: 3.5,
      total: 1750,
    },
    {
      id: "2",
      item: "Rock Check Dam",
      description: "Type A rock check dam",
      qty: 5,
      uom: "EA",
      cost: 450,
      total: 2250,
    },
    {
      id: "3",
      item: "Inlet Protection",
      description: "Curb inlet  protection",
      qty: 12,
      uom: "EA",
      cost: 125,
      total: 1500,
    },
  ],
  total: 5500,
};

describe("PDF Generation", () => {
  test("generates a valid PDF buffer", async () => {
    const buffer = await generatePDF(testQuote);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // PDF files start with %PDF
    const header = buffer.subarray(0, 4).toString();
    expect(header).toBe("%PDF");
  });

  test("saves PDF to file", async () => {
    const buffer = await generatePDF(testQuote);
    const outPath = "./example-estimate.pdf";

    writeFileSync(outPath, buffer);
    console.log(`PDF saved to ${outPath}`);

    expect(buffer.length).toBeGreaterThan(0);
  });

  test("generates correct filename", () => {
    const filename = getPDFFilename(testQuote);
    expect(filename).toBe("Estimate-251227-01-abc-general-contractors.pdf");
  });
});
