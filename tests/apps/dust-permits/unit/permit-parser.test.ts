/**
 * Permit Parser Tests
 *
 * Tests for the Maricopa permit parser to ensure invoice data is extracted correctly.
 *
 * @module tests/unit/permit-parser.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  parseHtmlExport,
  parsePermitExport,
  parseXlsxFile,
} from "@/db/sync/permit-parser";

// Sample files
const SAMPLE_XLSX_PATH = "data/samples/dustApplications.xlsx";
const COMPANY_HTML_EXPORT = "data/samples/company-permits-export.html";
const MARKETING_HTML_EXPORT = "data/samples/marketing-permits-export.html";

// Top-level regex patterns for test assertions
const PERMIT_ID_REGEX = /^D\d+$/;
const COMPANY_ID_REGEX = /^CMP\d+$/;
const INVOICE_NUMBER_REGEX = /^IV\d+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

describe("permit-parser", () => {
  describe("parseXlsxFile", () => {
    test("parses sample xlsx file", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);

      expect(permits.length).toBeGreaterThan(0);

      const first = permits[0];
      expect(first).toBeDefined();
      expect(first?.id).toMatch(PERMIT_ID_REGEX);
      expect(first?.projectName).toBeDefined();
      expect(first?.companyId).toMatch(COMPANY_ID_REGEX);
    });

    test("extracts invoice data from xlsx", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);

      const withInvoice = permits.filter((p) =>
        p.invoiceNumber?.startsWith("IV")
      );

      expect(withInvoice.length).toBeGreaterThan(0);

      const sample = withInvoice[0];
      expect(sample?.invoiceNumber).toMatch(INVOICE_NUMBER_REGEX);
      expect(typeof sample?.invoiceCharges).toBe("number");
      expect(typeof sample?.invoiceBalance).toBe("number");
    });

    test("invoice data is associated with correct permit", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);

      const permitWithInvoice = permits.find(
        (p) => p.invoiceNumber === "IV004764"
      );

      expect(permitWithInvoice).toBeDefined();
      expect(permitWithInvoice?.invoiceCharges).toBe(7710);
      expect(permitWithInvoice?.invoiceBalance).toBe(0);
    });

    test("handles permits without invoice data", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);

      const withoutInvoice = permits.filter((p) => p.invoiceNumber === null);
      expect(withoutInvoice.length).toBeGreaterThan(0);

      const sample = withoutInvoice[0];
      expect(sample?.id).toMatch(PERMIT_ID_REGEX);
      expect(sample?.invoiceNumber).toBeNull();
    });

    test("formats dates correctly", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);

      const withDate = permits.find((p) => p.submittedDate !== null);
      expect(withDate).toBeDefined();
      expect(withDate?.submittedDate).toMatch(ISO_DATE_REGEX);
    });
  });

  describe("parseHtmlExport (portal exports)", () => {
    test("parses company permits HTML export", async () => {
      const content = await Bun.file(COMPANY_HTML_EXPORT).text();
      const permits = parseHtmlExport(content);

      expect(permits.length).toBeGreaterThan(1000);

      const first = permits[0];
      expect(first?.id).toMatch(PERMIT_ID_REGEX);
      expect(first?.companyId).toMatch(COMPANY_ID_REGEX);
    });

    test("extracts invoice data from company HTML export", async () => {
      const content = await Bun.file(COMPANY_HTML_EXPORT).text();
      const permits = parseHtmlExport(content);

      const withInvoice = permits.filter((p) => p.invoiceNumber !== null);

      expect(withInvoice.length).toBeGreaterThan(0);

      const sample = withInvoice[0];
      expect(sample?.invoiceNumber).toMatch(INVOICE_NUMBER_REGEX);
      expect(typeof sample?.invoiceCharges).toBe("number");
    });

    test("parses marketing permits HTML export", async () => {
      const content = await Bun.file(MARKETING_HTML_EXPORT).text();
      const permits = parseHtmlExport(content);

      expect(permits.length).toBeGreaterThan(30_000);

      const withInvoice = permits.filter((p) => p.invoiceNumber !== null);
      expect(withInvoice.length).toBeGreaterThan(0);
    });

    test("parses inline HTML correctly", () => {
      const htmlContent =
        "<table>" +
        "<tr><td>D0012345</td><td>Test Project</td><td>CMP001234</td><td>Test Company Inc</td><td>Active</td><td>01/15/2024</td><td>01/20/2024</td><td>01/20/2025</td><td>&nbsp;</td><td>&nbsp;</td><td>01/25/2024</td><td>&nbsp;</td><td>123 Main St</td><td>Phoenix</td><td>123-45-678</td><td>No</td><td>Yes</td>" +
        "<td><table border=1><thead><tr><th>Invoice Number</th><th>Invoice Charges</th><th>Invoice Balance</th></tr></thead><tbody>" +
        "<tr><td>IV001234</td><td>5000.00</td><td>0.00</td></tr>" +
        "</tbody></table></td></tr>" +
        "</table>";

      const permits = parseHtmlExport(htmlContent);

      expect(permits.length).toBe(1);
      expect(permits[0]?.id).toBe("D0012345");
      expect(permits[0]?.invoiceNumber).toBe("IV001234");
      expect(permits[0]?.invoiceCharges).toBe(5000);
      expect(permits[0]?.invoiceBalance).toBe(0);
    });

    test("handles permits without invoice data", () => {
      const htmlContent =
        "<table>" +
        "<tr><td>D0099999</td><td>No Invoice Project</td><td>CMP005555</td><td>Another Company</td><td>Draft</td><td>02/01/2024</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>456 Oak Ave</td><td>Scottsdale</td><td>999-88-777</td><td>Yes</td><td>No</td>" +
        "<td><table border=1><thead><tr><th>Invoice Number</th><th>Invoice Charges</th><th>Invoice Balance</th></tr></thead><tbody></tbody></table></td></tr>" +
        "</table>";

      const permits = parseHtmlExport(htmlContent);

      expect(permits.length).toBe(1);
      expect(permits[0]?.id).toBe("D0099999");
      expect(permits[0]?.invoiceNumber).toBeNull();
    });
  });

  describe("parsePermitExport (auto-detect)", () => {
    test("auto-detects xlsx format", () => {
      const permits = parsePermitExport("", SAMPLE_XLSX_PATH);

      expect(permits.length).toBeGreaterThan(0);

      const withInvoice = permits.filter((p) => p.invoiceNumber !== null);
      expect(withInvoice.length).toBeGreaterThan(0);
    });

    test("auto-detects HTML format", async () => {
      const content = await Bun.file(COMPANY_HTML_EXPORT).text();
      const permits = parsePermitExport(content);

      expect(permits.length).toBeGreaterThan(0);

      const withInvoice = permits.filter((p) => p.invoiceNumber !== null);
      expect(withInvoice.length).toBeGreaterThan(0);
    });
  });

  describe("invoice coverage statistics", () => {
    test("xlsx sample file coverage", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);
      const total = permits.length;
      const withInvoice = permits.filter(
        (p) => p.invoiceNumber !== null
      ).length;
      const coverage = ((withInvoice / total) * 100).toFixed(1);

      console.log("\n📊 XLSX Sample Invoice Coverage:");
      console.log(
        `   Total: ${total} | With invoice: ${withInvoice} | ${coverage}%`
      );

      expect(withInvoice).toBeGreaterThan(0);
    });

    test("company HTML export coverage", async () => {
      const content = await Bun.file(COMPANY_HTML_EXPORT).text();
      const permits = parseHtmlExport(content);
      const total = permits.length;
      const withInvoice = permits.filter(
        (p) => p.invoiceNumber !== null
      ).length;
      const coverage = ((withInvoice / total) * 100).toFixed(1);

      console.log("\n📊 Company HTML Export Invoice Coverage:");
      console.log(
        `   Total: ${total} | With invoice: ${withInvoice} | ${coverage}%`
      );

      expect(withInvoice).toBeGreaterThan(0);
    });

    test("marketing HTML export coverage", async () => {
      const content = await Bun.file(MARKETING_HTML_EXPORT).text();
      const permits = parseHtmlExport(content);
      const total = permits.length;
      const withInvoice = permits.filter(
        (p) => p.invoiceNumber !== null
      ).length;
      const coverage = ((withInvoice / total) * 100).toFixed(1);

      console.log("\n📊 Marketing HTML Export Invoice Coverage:");
      console.log(
        `   Total: ${total} | With invoice: ${withInvoice} | ${coverage}%`
      );

      expect(withInvoice).toBeGreaterThan(0);
    });
  });
});
