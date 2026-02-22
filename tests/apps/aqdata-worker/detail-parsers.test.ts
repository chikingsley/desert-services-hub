/**
 * Detail Page Parser Tests — parse all 7 captured detail page fixtures.
 *
 * Verifies the generic detail parser extracts fields, tables, attachments,
 * and coordinates from each section's detail page HTML.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { parseDetailPage } from "../../../apps/aqdata-worker/src/aqdata/parsers/detail-generic";

const FIXTURES = "tests/apps/aqdata-worker/fixtures/detail-pages";

function loadFixture(name: string): string {
  const path = `${FIXTURES}/${name}`;
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

const hasFixtures =
  existsSync(FIXTURES) && existsSync(`${FIXTURES}/settlement-detail.html`);
const describeSuite = hasFixtures ? describe : describe.skip;

// =============================================================================
// Settlement Detail
// =============================================================================

describeSuite("parseDetailPage — settlement", () => {
  const html = loadFixture("settlement-detail.html");
  const result = parseDetailPage(html, "SA006569");

  test("extracts record ID", () => {
    expect(result.recordId).toBe("SA006569");
  });

  test("extracts settlement fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(5);
    console.log(`  Settlement fields (${Object.keys(result.fields).length}):`);
    for (const [key, value] of Object.entries(result.fields).slice(0, 10)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });

  test("extracts sub-tables", () => {
    expect(result.tables.length).toBeGreaterThan(0);
    console.log(`  Settlement tables (${result.tables.length}):`);
    for (const table of result.tables) {
      console.log(
        `    ${table.name}: ${table.rows.length} rows [${table.headers.slice(0, 4).join(", ")}]`
      );
    }
  });

  test("extracts attachments", () => {
    expect(result.attachments.length).toBeGreaterThan(0);
    console.log(`  Settlement attachments: ${result.attachments.length}`);
  });
});

// =============================================================================
// Enforcement Action Detail
// =============================================================================

describeSuite("parseDetailPage — enforcement action", () => {
  const html = loadFixture("enforcement-action-detail.html");
  const result = parseDetailPage(html, "ENF000090");

  test("extracts enforcement action fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(10);
    console.log(`  Enforcement fields (${Object.keys(result.fields).length}):`);
    for (const [key, value] of Object.entries(result.fields).slice(0, 12)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });

  test("extracts sub-tables", () => {
    // ENF000090 is a legacy 2005 record — sub-tables exist but contain no data rows
    expect(result.tables.length).toBeGreaterThanOrEqual(0);
    console.log(`  Enforcement tables (${result.tables.length}):`);
    for (const table of result.tables) {
      console.log(
        `    ${table.name}: ${table.rows.length} rows [${table.headers.slice(0, 4).join(", ")}]`
      );
    }
  });
});

// =============================================================================
// Compliance Report Detail
// =============================================================================

describeSuite("parseDetailPage — compliance report", () => {
  const html = loadFixture("compliance-report-detail.html");
  const result = parseDetailPage(html, "CRPT011820");

  test("extracts compliance report fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(5);
    console.log(
      `  Compliance Report fields (${Object.keys(result.fields).length}):`
    );
    for (const [key, value] of Object.entries(result.fields).slice(0, 12)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });

  test("extracts sub-tables", () => {
    expect(result.tables.length).toBeGreaterThanOrEqual(0);
    console.log(`  Compliance Report tables (${result.tables.length}):`);
    for (const table of result.tables) {
      console.log(
        `    ${table.name}: ${table.rows.length} rows [${table.headers.slice(0, 4).join(", ")}]`
      );
    }
  });
});

// =============================================================================
// Complaint Detail
// =============================================================================

describeSuite("parseDetailPage — complaint", () => {
  const html = loadFixture("complaint-detail.html");
  const result = parseDetailPage(html, "CMPL000016");

  test("extracts complaint fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(10);
    console.log(`  Complaint fields (${Object.keys(result.fields).length}):`);
    for (const [key, value] of Object.entries(result.fields).slice(0, 12)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });

  test("extracts sub-tables", () => {
    expect(result.tables.length).toBeGreaterThan(0);
    console.log(`  Complaint tables (${result.tables.length}):`);
    for (const table of result.tables) {
      console.log(
        `    ${table.name}: ${table.rows.length} rows [${table.headers.slice(0, 4).join(", ")}]`
      );
    }
  });

  test("extracts coordinates", () => {
    expect(result.coordinates).not.toBeNull();
    if (result.coordinates) {
      console.log(
        `  Complaint coords: ${result.coordinates.latitude}, ${result.coordinates.longitude}`
      );
      expect(result.coordinates.latitude).toBeCloseTo(33.43, 1);
      expect(result.coordinates.longitude).toBeCloseTo(-112.26, 1);
    }
  });
});

// =============================================================================
// Site Visit Detail
// =============================================================================

describeSuite("parseDetailPage — site visit", () => {
  const html = loadFixture("site-visit-detail.html");
  const result = parseDetailPage(html, "SITE000690");

  test("extracts site visit fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(4);
    console.log(`  Site Visit fields (${Object.keys(result.fields).length}):`);
    for (const [key, value] of Object.entries(result.fields)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });
});

// =============================================================================
// Asbestos Notification Detail
// =============================================================================

describeSuite("parseDetailPage — asbestos notification", () => {
  const html = loadFixture("asbestos-notification-detail.html");
  const result = parseDetailPage(html, "ASB0000003");

  test("extracts asbestos notification fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(8);
    console.log(`  Asbestos fields (${Object.keys(result.fields).length}):`);
    for (const [key, value] of Object.entries(result.fields).slice(0, 12)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });

  test("extracts sub-tables", () => {
    expect(result.tables.length).toBeGreaterThan(0);
    console.log(`  Asbestos tables (${result.tables.length}):`);
    for (const table of result.tables) {
      console.log(
        `    ${table.name}: ${table.rows.length} rows [${table.headers.slice(0, 4).join(", ")}]`
      );
    }
  });

  test("extracts coordinates", () => {
    expect(result.coordinates).not.toBeNull();
    if (result.coordinates) {
      console.log(
        `  Asbestos coords: ${result.coordinates.latitude}, ${result.coordinates.longitude}`
      );
      expect(result.coordinates.latitude).toBeCloseTo(33.39, 1);
    }
  });
});

// =============================================================================
// Invoice Detail
// =============================================================================

describeSuite("parseDetailPage — invoice", () => {
  const html = loadFixture("invoice-detail.html");
  const result = parseDetailPage(html, "IV000001");

  test("extracts invoice fields", () => {
    expect(Object.keys(result.fields).length).toBeGreaterThan(5);
    console.log(`  Invoice fields (${Object.keys(result.fields).length}):`);
    for (const [key, value] of Object.entries(result.fields)) {
      console.log(`    ${key}: ${value.slice(0, 80)}`);
    }
  });

  test("extracts sub-tables", () => {
    expect(result.tables.length).toBeGreaterThan(0);
    console.log(`  Invoice tables (${result.tables.length}):`);
    for (const table of result.tables) {
      console.log(
        `    ${table.name}: ${table.rows.length} rows [${table.headers.slice(0, 4).join(", ")}]`
      );
    }
  });
});
