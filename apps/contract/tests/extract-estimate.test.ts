/**
 * Tests for Estimate Extraction
 *
 * Tests the extraction of Desert Services estimates from PDF text:
 * - Header parsing (estimate number, revision, date, GC, job info)
 * - Line item extraction (qty, unit cost, total, taxable flag)
 * - Tax calculation
 * - Total extraction
 *
 * Run with: bun test apps/contract/tests/extract-estimate.test.ts
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  extractHeader,
  extractLineItems,
  extractTax,
  extractTotal,
  parseEstimateText,
} from "../scripts/extract-estimate";

// Test fixtures - PDF text extracted from actual estimates
const _FIXTURES_PATH = join(
  import.meta.dir,
  "../templates/ground-truth/test-fixtures"
);

// Sample estimate text for unit tests - PDF-like format (space separated)
const EDISON_PARK_TEXT = `Services Estimate  Date  11/4/2025  Estimate #  11042501  To:  Low Mountain Construction 4105 N 20th St Suite 205 Phoenix, AZ 85016   Job Name  EDISON PARK EXPANSION  Estimator  Jared Aiken ALL ADDENDA HAVE BEEN RECEIVED AND ACKNOWLEDGED  SWPPP ESTIMATE FOR: EDISON PARK EXPANSION SEC OF E ROOSEVELT ST AND N 19TH ST PHOENIX, AZ 85044 SWPPP Narrative SWPPP Narrative Design Manual - Required per EPA Specifications (Each)   1   1,350.00   1,350.00 Compost Filter Sock Installation of 9" Compost Filter Sock (LF)   2,660   2.75   7,315.00 Rock Entrance Rock Entrance installed per SWPPP Plan (Each)   1   2,475.00   2,475.00 Inlet Protection Drop Inlet Protection (Each)   5   175.00   875.00 Inlet Protection Curb Inlet Protection (Each)   3   275.00   825.00 SWPPP Sign SWPPP Sign - per ADEQ Specifications   1   275.00   275.00 Spill Kit Spill Kit - per ADEQ Specifications   1   345.00   345.00 Misc Textura/Procore/GCPay fees   1   100.00   100.00 Inspections SWPPP Inspections (approximately 9 months)   21   195.00   4,095.00 Mobilization Charge Mobilization Charges (Each)   2   255.00   510.00 Page 3 $19,140.00 -- 3 of 3 --`;

// Sample with revision and tax (Modera PV R1 format) - PDF-like format
const MODERA_PV_R1_TEXT = `Services Estimate  Date  12/10/2025  Estimate #  12102503-R1  To:  Mill Creek Residential 15210 N. Scottsdale Suite 210 Scottsdale, AZ 85254   Job Name  MODERA PARADISE VALLEY  Estimator  Jared Aiken  SWPPP ESTIMATE FOR: MODERA PARADISE VALLEY 4580 E CACTUS ROAD PHOENIX, AZ 85032 SWPPP Narrative SWPPP Narrative Design Manual   1   1,350.00   1,350.00 Compost Filter Sock Installation of 9" Compost Filter Sock (LF)   1,780   2.75   4,895.00 Rock Entrance Rock Entrance with Rock and Filterfabric   3   2,475.00   7,425.00 Rumble Grates Monthly rental   24   1,100.00   26,400.00T Inlet Protection Curb Inlet Protection (Each)   2   375.00   750.00 SWPPP Sign SWPPP Sign   2   275.00   550.00 Spill Kit Spill Kit   2   345.00   690.00 Inspections SWPPP Inspections   60   195.00   11,700.00 Permit Filing Dust Control Permit   1   2,760.00   2,760.00 Permit Filing Dust Permit Renewal   2   1,630.00   3,260.00 Mobilization Charge Mobilization Charges (Each)   1   255.00   255.00 Backflow Certification Certification of Backflow   2   295.00   590.00T Backflow Rental Monthly Rental Charge for Backflow   27   490.00   13,230.00T Rental Tax   3,660.02   3,660.02 Page 4 $79,215.02 -- 4 of 4 --`;

describe("Estimate Extraction", () => {
  describe("Header Extraction", () => {
    test("should extract basic header info", () => {
      const header = extractHeader(EDISON_PARK_TEXT);

      expect(header.estimateNumber).toBe("11042501");
      expect(header.revision).toBeNull();
      expect(header.date).toBe("11/4/2025");
      expect(header.gcName).toContain("Low Mountain Construction");
      expect(header.jobName).toContain("EDISON PARK");
      expect(header.estimator).toContain("Jared Aiken");
    });

    test("should extract revision number", () => {
      const header = extractHeader(MODERA_PV_R1_TEXT);

      expect(header.estimateNumber).toBe("12102503");
      expect(header.revision).toBe("-R1");
      expect(header.gcName).toContain("Mill Creek Residential");
      expect(header.jobName).toContain("MODERA PARADISE VALLEY");
    });

    test("should extract job name with project info", () => {
      const header = extractHeader(MODERA_PV_R1_TEXT);

      // Job name should be present
      expect(header.jobName).toBeTruthy();
      expect(header.jobName.length).toBeGreaterThan(5);
    });
  });

  describe("Line Item Extraction", () => {
    test("should extract line items with qty, unit cost, and total", () => {
      const items = extractLineItems(EDISON_PARK_TEXT);

      // Should have multiple items
      expect(items.length).toBeGreaterThan(5);

      // Find an item with filter sock total
      const filterSockItem = items.find((i) => i.total === 7315);
      expect(filterSockItem).toBeDefined();
      expect(filterSockItem?.qty).toBe(2660);
      expect(filterSockItem?.unitCost).toBe(2.75);
    });

    test("should identify taxable items (T suffix)", () => {
      const items = extractLineItems(MODERA_PV_R1_TEXT);

      const taxableItems = items.filter((i) => i.taxable);
      expect(taxableItems.length).toBeGreaterThan(0);

      // Item with total 26400 (rumble grates) should be taxable
      const rumbleGrates = items.find((i) => i.total === 26_400);
      expect(rumbleGrates?.taxable).toBe(true);
    });

    test("should categorize items by section", () => {
      const items = extractLineItems(EDISON_PARK_TEXT);

      // Check that we have items in different sections
      const requiredItems = items.filter((i) => i.section === "required");
      const phase1Items = items.filter((i) => i.section === "phase1");

      expect(requiredItems.length).toBeGreaterThan(0);
      expect(phase1Items.length).toBeGreaterThan(0);
    });

    test("should skip zero qty/zero total items", () => {
      const textWithZero =
        EDISON_PARK_TEXT +
        " Concrete Rolloff 15 Cubic Yard System 0 725.00 0.00";
      const items = extractLineItems(textWithZero);

      // Should not have an item with total 0
      const zeroItem = items.find((i) => i.total === 0);
      expect(zeroItem).toBeUndefined();
    });
  });

  describe("Tax Extraction", () => {
    test("should extract rental tax amount", () => {
      const items = extractLineItems(MODERA_PV_R1_TEXT);
      const tax = extractTax(MODERA_PV_R1_TEXT, items);

      expect(tax).not.toBeNull();
      expect(tax?.taxAmount).toBeCloseTo(3660.02, 2);
    });

    test("should calculate tax rate from taxable items", () => {
      const items = extractLineItems(MODERA_PV_R1_TEXT);
      const tax = extractTax(MODERA_PV_R1_TEXT, items);

      // Tax rate should be around 9.1% for AZ
      expect(tax?.taxRate).toBeGreaterThan(0.08);
      expect(tax?.taxRate).toBeLessThan(0.12);
    });

    test("should return null when no rental tax line", () => {
      const items = extractLineItems(EDISON_PARK_TEXT);
      const tax = extractTax(EDISON_PARK_TEXT, items);

      expect(tax).toBeNull();
    });
  });

  describe("Total Extraction", () => {
    test("should extract final total", () => {
      const total = extractTotal(EDISON_PARK_TEXT);
      expect(total).toBe(19_140);
    });

    test("should extract total with tax", () => {
      const total = extractTotal(MODERA_PV_R1_TEXT);
      expect(total).toBeCloseTo(79_215.02, 2);
    });
  });

  describe("Full Estimate Parsing", () => {
    test("should parse complete estimate", () => {
      const estimate = parseEstimateText(EDISON_PARK_TEXT, "11042501.pdf");

      expect(estimate.header.estimateNumber).toBe("11042501");
      expect(estimate.lineItems.length).toBeGreaterThan(5);
      expect(estimate.total).toBe(19_140);
      expect(estimate.sourceFile).toBe("11042501.pdf");
      expect(estimate.extractedAt).toBeDefined();
    });

    test("should parse estimate with revision and tax", () => {
      const estimate = parseEstimateText(MODERA_PV_R1_TEXT, "12102503-R1.pdf");

      expect(estimate.header.estimateNumber).toBe("12102503");
      expect(estimate.header.revision).toBe("-R1");
      expect(estimate.tax).not.toBeNull();
      expect(estimate.tax?.taxAmount).toBeCloseTo(3660.02, 2);
      expect(estimate.total).toBeCloseTo(79_215.02, 2);
    });

    test("should calculate subtotal from line items", () => {
      const estimate = parseEstimateText(EDISON_PARK_TEXT, "test.pdf");

      const calculatedSubtotal = estimate.lineItems.reduce(
        (sum, item) => sum + item.total,
        0
      );
      expect(estimate.subtotal).toBe(calculatedSubtotal);
    });
  });
});

describe("Real Estimate Files", () => {
  // These tests use actual PDF files with pdfjs-dist for text extraction
  const FILES_PATH = join(import.meta.dir, "../../../../files-for-work-all");

  /**
   * Extract text from PDF using pdfjs-dist
   */
  async function extractPdfText(pdfPath: string): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const data = await Bun.file(pdfPath).arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      fullText += `${pageText}\n\n-- ${i} of ${pdf.numPages} --\n\n`;
    }

    return fullText;
  }

  test("should parse Edison Park estimate (11042501.pdf)", async () => {
    const pdfPath = join(FILES_PATH, "11042501.pdf");
    const file = Bun.file(pdfPath);

    if (!(await file.exists())) {
      console.log("Skipping - file not found:", pdfPath);
      return;
    }

    const text = await extractPdfText(pdfPath);
    const estimate = parseEstimateText(text, "11042501.pdf");

    expect(estimate.header.estimateNumber).toBe("11042501");
    expect(estimate.header.jobName).toContain("EDISON");
    expect(estimate.total).toBeGreaterThan(10_000);
    expect(estimate.lineItems.length).toBeGreaterThan(3);

    console.log(
      `✓ Edison Park: ${estimate.lineItems.length} items, $${estimate.total}`
    );
  });

  test("should parse Modera PV estimate (12102503.pdf)", async () => {
    const pdfPath = join(FILES_PATH, "12102503.pdf");
    const file = Bun.file(pdfPath);

    if (!(await file.exists())) {
      console.log("Skipping - file not found:", pdfPath);
      return;
    }

    const text = await extractPdfText(pdfPath);
    const estimate = parseEstimateText(text, "12102503.pdf");

    expect(estimate.header.estimateNumber).toBe("12102503");
    expect(estimate.header.jobName).toContain("MODERA");
    expect(estimate.total).toBeGreaterThan(50_000);

    console.log(
      `✓ Modera PV: ${estimate.lineItems.length} items, $${estimate.total}`
    );
  });

  test("should parse multiple estimates consistently", async () => {
    const estimateFiles = ["11042501.pdf", "12102503.pdf"];

    let successCount = 0;

    for (const filename of estimateFiles) {
      const pdfPath = join(FILES_PATH, filename);
      const file = Bun.file(pdfPath);

      if (!(await file.exists())) {
        console.log("Skipping - file not found:", filename);
        continue;
      }

      const text = await extractPdfText(pdfPath);
      const estimate = parseEstimateText(text, filename);

      // Every estimate should have these basics
      expect(estimate.header.estimateNumber).toBeTruthy();
      expect(estimate.total).toBeGreaterThan(0);
      expect(estimate.lineItems.length).toBeGreaterThan(0);

      successCount++;
      console.log(
        `✓ ${filename}: ${estimate.header.jobName || "Unknown"} - $${estimate.total.toLocaleString()} (${estimate.lineItems.length} items)`
      );
    }

    expect(successCount).toBeGreaterThan(0);
  });
});
