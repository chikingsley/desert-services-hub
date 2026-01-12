// Quick test script for PDF generation
import { generatePDF } from "./lib/pdf/generate";
import type { PDFQuote } from "./lib/pdf/types";

const testQuote: PDFQuote = {
  estimateNumber: "TEST-001",
  date: new Date().toISOString(),
  estimator: "Test Estimator",
  estimatorEmail: "test@example.com",
  billTo: {
    companyName: "Test Company",
    address: "123 Test St",
  },
  project: {
    name: "Test Project",
  },
  siteAddress: {
    line1: "456 Project Ave",
  },
  sections: [],
  lineItems: [
    {
      id: "1",
      item: "TEST-ITEM",
      description: "Test line item",
      qty: 1,
      uom: "EA",
      cost: 100,
      total: 100,
    },
  ],
  total: 100,
};

console.log("Starting PDF generation...");
const startTime = Date.now();

try {
  const buffer = await generatePDF(testQuote);
  console.log(`PDF generated in ${Date.now() - startTime}ms`);
  console.log(`PDF size: ${buffer.length} bytes`);
  await Bun.write("/tmp/test-quote-direct.pdf", buffer);
  console.log("Saved to /tmp/test-quote-direct.pdf");
} catch (error) {
  console.error("Error generating PDF:", error);
}
