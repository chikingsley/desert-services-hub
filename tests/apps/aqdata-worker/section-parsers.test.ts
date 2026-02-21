/**
 * Section Parser Tests — parse all 7 non-dust portal section exports.
 *
 * Each test reads the corresponding fixture XLS file (HTML-as-XLS from the
 * AQData portal) and verifies the parser produces correctly typed records
 * with sensible field values.
 *
 * These tests run against static fixture files and do not hit the live portal.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseAsbestosNotificationExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/asbestos-notifications";
import { parseComplaintExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/complaints";
import { parseComplianceReportExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/compliance-reports";
import { parseEnforcementActionExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/enforcement-actions";
import { parseInvoiceExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/invoices";
import { parseSettlementExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/settlements";
import { parseSiteVisitExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/site-visits";

const FIXTURES = "tests/apps/aqdata-worker/fixtures";

const SETTLEMENT_ID_RE = /^SA\d+$/;
const REPORT_ID_RE = /^CRPT\d+$/;
const ENFORCEMENT_ID_RE = /^ENF\d+$/;
const COMPLAINT_ID_RE = /^CMPL\d+$/;
const VISIT_ID_RE = /^SITE\d+$/;
const NOTIFICATION_ID_RE = /^ASB\d+$/;
const INVOICE_ID_RE = /^IV\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function loadFixture(name: string): Buffer {
  return readFileSync(`${FIXTURES}/${name}`);
}

// =============================================================================
// Settlements
// =============================================================================

describe("parseSettlementExport", () => {
  const data = loadFixture("settlements.xls");
  const results = parseSettlementExport(data);

  test("parses all settlement records", () => {
    expect(results.length).toBeGreaterThan(5000);
    console.log(`  Settlements: ${results.length} records`);
  });

  test("first record has valid settlement ID", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.settlementId).toMatch(SETTLEMENT_ID_RE);
  });

  test("records have company and enforcement fields", () => {
    const withCompany = results.filter((r) => r.companyName !== null);
    expect(withCompany.length).toBeGreaterThan(results.length * 0.9);

    const withEnforcement = results.filter(
      (r) => r.enforcementActionId !== null
    );
    expect(withEnforcement.length).toBeGreaterThan(results.length * 0.5);
  });

  test("settlement amounts parse as numbers", () => {
    const withAmount = results.filter((r) => r.settlementAmount !== null);
    expect(withAmount.length).toBeGreaterThan(0);
    for (const r of withAmount.slice(0, 10)) {
      expect(typeof r.settlementAmount).toBe("number");
    }
  });
});

// =============================================================================
// Compliance Reports
// =============================================================================

describe("parseComplianceReportExport", () => {
  const data = loadFixture("compliance-reports.xls");
  const results = parseComplianceReportExport(data);

  test("parses all compliance report records", () => {
    expect(results.length).toBeGreaterThan(10_000);
    console.log(`  Compliance Reports: ${results.length} records`);
  });

  test("first record has valid report ID", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.reportId).toMatch(REPORT_ID_RE);
  });

  test("records have facility and report type fields", () => {
    const withFacility = results.filter((r) => r.facilityId !== null);
    expect(withFacility.length).toBeGreaterThan(results.length * 0.9);

    const withType = results.filter((r) => r.reportType !== null);
    expect(withType.length).toBeGreaterThan(results.length * 0.5);
  });

  test("dates parse correctly", () => {
    const withDate = results.filter((r) => r.receivedDate !== null);
    expect(withDate.length).toBeGreaterThan(0);
    for (const r of withDate.slice(0, 10)) {
      expect(r.receivedDate).toMatch(DATE_RE);
    }
  });
});

// =============================================================================
// Enforcement Actions
// =============================================================================

describe("parseEnforcementActionExport", () => {
  const data = loadFixture("enforcement-actions.xls");
  const results = parseEnforcementActionExport(data);

  test("parses all enforcement action records", () => {
    expect(results.length).toBeGreaterThan(20_000);
    console.log(`  Enforcement Actions: ${results.length} records`);
  });

  test("first record has valid action ID", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.actionId).toMatch(ENFORCEMENT_ID_RE);
  });

  test("records have action type and state", () => {
    const withType = results.filter((r) => r.actionType !== null);
    expect(withType.length).toBeGreaterThan(results.length * 0.5);

    const withState = results.filter((r) => r.actionState !== null);
    expect(withState.length).toBeGreaterThan(results.length * 0.5);
  });

  test("penalty amounts parse as numbers", () => {
    const withPenalty = results.filter((r) => r.penaltyAmount !== null);
    expect(withPenalty.length).toBeGreaterThan(0);
    for (const r of withPenalty.slice(0, 10)) {
      expect(typeof r.penaltyAmount).toBe("number");
    }
  });

  test("isSep is a boolean", () => {
    for (const r of results.slice(0, 20)) {
      expect(typeof r.isSep).toBe("boolean");
    }
  });
});

// =============================================================================
// Complaints
// =============================================================================

describe("parseComplaintExport", () => {
  const data = loadFixture("complaints.xls");
  const results = parseComplaintExport(data);

  test("parses all complaint records", () => {
    expect(results.length).toBeGreaterThan(20_000);
    console.log(`  Complaints: ${results.length} records`);
  });

  test("first record has valid complaint ID", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.complaintId).toMatch(COMPLAINT_ID_RE);
  });

  test("records have state and category fields", () => {
    const withState = results.filter((r) => r.state !== null);
    expect(withState.length).toBeGreaterThan(results.length * 0.9);

    const withCategory = results.filter(
      (r) => r.investigationCategory !== null
    );
    expect(withCategory.length).toBeGreaterThan(results.length * 0.5);
  });

  test("dates parse correctly", () => {
    const withDate = results.filter((r) => r.receivedDate !== null);
    expect(withDate.length).toBeGreaterThan(0);
    for (const r of withDate.slice(0, 10)) {
      expect(r.receivedDate).toMatch(DATE_RE);
    }
  });

  test("facilities array is present on every record", () => {
    for (const r of results.slice(0, 50)) {
      expect(Array.isArray(r.facilities)).toBe(true);
    }
  });

  test("some complaints have linked facilities", () => {
    const withFacilities = results.filter((r) => r.facilities.length > 0);
    expect(withFacilities.length).toBeGreaterThan(0);
    console.log(
      `  Complaints with facilities: ${withFacilities.length}/${results.length}`
    );

    const first = withFacilities[0];
    expect(first).toBeDefined();
    const fac = first?.facilities[0];
    expect(fac).toBeDefined();
    expect(fac).toHaveProperty("facilityId");
    expect(fac).toHaveProperty("facilityName");
    expect(fac).toHaveProperty("companyName");
  });
});

// =============================================================================
// Site Visits
// =============================================================================

describe("parseSiteVisitExport", () => {
  const data = loadFixture("site-visits.xls");
  const results = parseSiteVisitExport(data);

  test("parses all site visit records", () => {
    expect(results.length).toBeGreaterThan(1000);
    console.log(`  Site Visits: ${results.length} records`);
  });

  test("first record has valid visit ID", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.visitId).toMatch(VISIT_ID_RE);
  });

  test("records have facility and visit type fields", () => {
    const withFacility = results.filter((r) => r.facilityId !== null);
    expect(withFacility.length).toBeGreaterThan(results.length * 0.9);

    const withType = results.filter((r) => r.visitType !== null);
    expect(withType.length).toBeGreaterThan(results.length * 0.5);
  });

  test("visit dates parse correctly", () => {
    const withDate = results.filter((r) => r.visitDate !== null);
    expect(withDate.length).toBeGreaterThan(0);
    for (const r of withDate.slice(0, 10)) {
      expect(r.visitDate).toMatch(DATE_RE);
    }
  });

  test("evaluators field is populated", () => {
    const withEvaluators = results.filter((r) => r.evaluators !== null);
    expect(withEvaluators.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Asbestos Notifications
// =============================================================================

describe("parseAsbestosNotificationExport", () => {
  const data = loadFixture("asbestos-notifications.xls");
  const results = parseAsbestosNotificationExport(data);

  test("parses all asbestos notification records", () => {
    expect(results.length).toBeGreaterThan(7000);
    console.log(`  Asbestos Notifications: ${results.length} records`);
  });

  test("first record has valid notification number", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.notificationNumber).toMatch(NOTIFICATION_ID_RE);
  });

  test("records have facility and status fields", () => {
    const withFacility = results.filter((r) => r.facilityId !== null);
    expect(withFacility.length).toBeGreaterThan(results.length * 0.5);

    const withStatus = results.filter((r) => r.status !== null);
    expect(withStatus.length).toBeGreaterThan(results.length * 0.5);
  });

  test("invoices array is present on every record", () => {
    for (const r of results.slice(0, 50)) {
      expect(Array.isArray(r.invoices)).toBe(true);
    }
  });

  test("some notifications have linked invoices", () => {
    const withInvoices = results.filter((r) => r.invoices.length > 0);
    expect(withInvoices.length).toBeGreaterThan(0);
    console.log(
      `  Notifications with invoices: ${withInvoices.length}/${results.length}`
    );

    const first = withInvoices[0];
    expect(first).toBeDefined();
    const inv = first?.invoices[0];
    expect(inv).toBeDefined();
    expect(inv).toHaveProperty("invoiceNumber");
    expect(inv).toHaveProperty("invoiceCharges");
    expect(inv).toHaveProperty("invoiceBalance");
  });

  test("dates parse correctly", () => {
    const withDate = results.filter((r) => r.createdDate !== null);
    expect(withDate.length).toBeGreaterThan(0);
    for (const r of withDate.slice(0, 10)) {
      expect(r.createdDate).toMatch(DATE_RE);
    }
  });
});

// =============================================================================
// Invoices
// =============================================================================

describe("parseInvoiceExport", () => {
  const data = loadFixture("invoices.xls");
  const results = parseInvoiceExport(data);

  test("parses all invoice records", () => {
    expect(results.length).toBeGreaterThan(70_000);
    console.log(`  Invoices: ${results.length} records`);
  });

  test("first record has valid invoice ID", () => {
    expect(results[0]).toBeDefined();
    expect(results[0]?.invoiceId).toMatch(INVOICE_ID_RE);
  });

  test("records have facility and type fields", () => {
    const withFacility = results.filter((r) => r.facilityId !== null);
    expect(withFacility.length).toBeGreaterThan(results.length * 0.5);

    const withType = results.filter((r) => r.invoiceType !== null);
    expect(withType.length).toBeGreaterThan(results.length * 0.5);
  });

  test("financial fields parse as numbers", () => {
    const withCharges = results.filter((r) => r.totalCharges !== null);
    expect(withCharges.length).toBeGreaterThan(0);
    for (const r of withCharges.slice(0, 10)) {
      expect(typeof r.totalCharges).toBe("number");
    }

    const withBalance = results.filter((r) => r.balance !== null);
    expect(withBalance.length).toBeGreaterThan(0);
  });

  test("dates parse correctly", () => {
    const withDate = results.filter((r) => r.createdDate !== null);
    expect(withDate.length).toBeGreaterThan(0);
    for (const r of withDate.slice(0, 10)) {
      expect(r.createdDate).toMatch(DATE_RE);
    }
  });

  test("invoice status is populated", () => {
    const withStatus = results.filter((r) => r.invoiceStatus !== null);
    expect(withStatus.length).toBeGreaterThan(results.length * 0.9);
  });
});
