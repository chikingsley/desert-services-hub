import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseDustApplicationExport,
  parseHtmlExport,
} from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-applications";

const FIXTURE_PATH = "tests/apps/aqdata-worker/fixtures/dust-applications.xls";
const APP_ID_REGEX = /^D\d+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INVOICE_REGEX = /^IV\d+$/;

const fixtureExists = (() => {
  try {
    readFileSync(FIXTURE_PATH);
    return true;
  } catch {
    return false;
  }
})();

const describeFixture = fixtureExists ? describe : describe.skip;

describeFixture("dust application export parser (fixture)", () => {
  const data = fixtureExists ? readFileSync(FIXTURE_PATH) : Buffer.alloc(0);
  const asText = data.toString("utf8");

  test("parses thousands of permits from HTML-as-XLS fixture", () => {
    const results = parseDustApplicationExport(data);

    expect(results.length).toBeGreaterThan(1000);
    console.log(`  Parsed ${results.length} permits`);
  });

  test("parseHtmlExport returns same count as parseDustApplicationExport", () => {
    const fromExport = parseDustApplicationExport(data);
    const fromHtml = parseHtmlExport(asText);

    expect(fromHtml.length).toBe(fromExport.length);
  });

  test("first permit has core identity fields populated", () => {
    const results = parseDustApplicationExport(data);
    const first = results[0];
    if (!first) {
      throw new Error("Expected at least one permit");
    }

    expect(first.applicationId).toMatch(APP_ID_REGEX);
    expect(first.status).toBeTruthy();
    // Not all early permits have every field (city, address can be null)
    // but applicationId and status are always present
  });

  test("most permits have company and location fields", () => {
    const results = parseDustApplicationExport(data);
    let withCompany = 0;
    let withCity = 0;
    let withAddress = 0;

    for (const p of results) {
      if (p.companyName) {
        withCompany++;
      }
      if (p.city) {
        withCity++;
      }
      if (p.address) {
        withAddress++;
      }
    }

    // Coverage thresholds based on actual portal data
    expect(withCompany / results.length).toBeGreaterThan(0.9);
    expect(withCity / results.length).toBeGreaterThan(0.8);
    expect(withAddress / results.length).toBeGreaterThan(0.7);
  });

  test("known permit D0000246 has correct field values", () => {
    const results = parseDustApplicationExport(data);
    const permit = results.find((p) => p.applicationId === "D0000246");
    if (!permit) {
      throw new Error("Expected to find permit D0000246");
    }

    expect(permit.facilityId).toBe("F006946");
    expect(permit.facilityName).toBe(
      "I-17 at Happy Valley Rd Traffic Interchange"
    );
    expect(permit.projectName).toBe("N I-17 / W HAPPY VALLEY RD");
    expect(permit.companyId).toBe("CMP001380");
    expect(permit.companyName).toBe("FNF Construction Inc");
    expect(permit.status).toBe("Superseded");
    expect(permit.submittedDate).toBe("2019-10-08");
    expect(permit.expirationDate).toBe("2020-10-08");
    expect(permit.closedDate).toBe("2020-10-08");
    expect(permit.address).toBe("22431 N Black Canyon Hwy");
    expect(permit.city).toBe("Phoenix");
    expect(permit.parcel).toBe("209-04-041A");
    expect(permit.isBlockPermit).toBe(false);
    expect(permit.isAccelerated).toBe(false);
  });

  test("permits with invoices have invoice data extracted", () => {
    const results = parseDustApplicationExport(data);
    const withInvoice = results.filter((p) => p.invoiceNumber !== null);

    expect(withInvoice.length).toBeGreaterThan(0);
    console.log(`  ${withInvoice.length} permits have invoice data`);

    const example = withInvoice[0];
    if (!example) {
      throw new Error("Expected at least one permit with invoice");
    }
    expect(example.invoiceNumber).toMatch(INVOICE_REGEX);
    expect(typeof example.invoiceCharges).toBe("number");
    expect(typeof example.invoiceBalance).toBe("number");
  });

  test("all applicationIds match D-number pattern", () => {
    const results = parseDustApplicationExport(data);
    const invalid = results.filter((p) => !APP_ID_REGEX.test(p.applicationId));

    expect(invalid).toEqual([]);
  });

  test("dates are formatted as YYYY-MM-DD", () => {
    const results = parseDustApplicationExport(data);

    for (const permit of results.slice(0, 100)) {
      if (permit.submittedDate) {
        expect(permit.submittedDate).toMatch(DATE_REGEX);
      }
      if (permit.effectiveDate) {
        expect(permit.effectiveDate).toMatch(DATE_REGEX);
      }
      if (permit.expirationDate) {
        expect(permit.expirationDate).toMatch(DATE_REGEX);
      }
    }
  });

  test("no field contains raw HTML or &nbsp;", () => {
    const results = parseDustApplicationExport(data);

    for (const permit of results.slice(0, 200)) {
      const values = [
        permit.facilityName,
        permit.projectName,
        permit.companyName,
        permit.address,
        permit.city,
      ].filter(Boolean);

      for (const val of values) {
        expect(val).not.toContain("<td");
        expect(val).not.toContain("&nbsp;");
        expect(val).not.toContain("<tr");
      }
    }
  });
});
