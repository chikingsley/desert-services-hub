/**
 * AQData Portal Survey — exports all non-dust portal sections.
 *
 * Connects to the live AQData portal and exports data from every reachable
 * section: settlements, compliance reports, enforcement actions, complaints,
 * site visits, asbestos notifications, and invoices.
 *
 * All sections require a search click (empty filters = all records) before
 * the Export to Excel button is available. Inspections are skipped because
 * the unfiltered search times out (too many records).
 *
 * Gate: RUN_AQ_SURVEY=true (hits live portal, writes fixture files)
 */
import { describe, expect, test } from "bun:test";
import { AQDataClient } from "../../../apps/aqdata-worker/src/aqdata/client";
import { FORMS } from "../../../apps/aqdata-worker/src/aqdata/constants";

const RUN_SURVEY = process.env.RUN_AQ_SURVEY === "true";
const describeSuite = RUN_SURVEY ? describe : describe.skip;
const FIXTURES_DIR = "tests/apps/aqdata-worker/fixtures";

const RECORD_COUNT_REGEX = /\d+-\d+ of (\d+)/;
const TH_REGEX = /<th[^>]*>([^<]+)<\/th>/gi;

let client: AQDataClient;

function extractRecordCount(html: string): number {
  const match = html.match(RECORD_COUNT_REGEX);
  return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

function extractHeaders(html: string): string[] {
  const headers: string[] = [];
  const regex = new RegExp(TH_REGEX.source, "gi");
  for (const match of html.matchAll(regex)) {
    const text = (match[1] ?? "").trim();
    if (text && text.length < 80) {
      headers.push(text);
    }
  }
  return headers;
}

describeSuite("AQData Portal Survey — all sections", () => {
  test("connects to portal", async () => {
    client = new AQDataClient();
    await client.connect();
    expect(client.currentState).toBe("disclaimer_accepted");
    console.log("  Connected, session:", client.sessionId?.slice(0, 16));
  }, 30_000);

  // =========================================================================
  // Settlements
  // =========================================================================

  test("settlements: search + export", async () => {
    await client.navigateToSettlementSearch();
    const html = await client.searchSettlements();

    const count = extractRecordCount(html);
    console.log(`  Settlements: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(
      FORMS.settlements.exportBtn
    );
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/settlements.xls`, buffer);
    console.log("  Saved: fixtures/settlements.xls");
  }, 120_000);

  // =========================================================================
  // Compliance Reports
  // =========================================================================

  test("compliance reports: search + export", async () => {
    await client.navigateToComplianceReportSearch();
    const html = await client.searchComplianceReports();

    const count = extractRecordCount(html);
    console.log(`  Compliance Reports: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(
      FORMS.complianceReports.exportBtn
    );
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/compliance-reports.xls`, buffer);
    console.log("  Saved: fixtures/compliance-reports.xls");
  }, 120_000);

  // =========================================================================
  // Enforcement Actions
  // =========================================================================

  test("enforcement actions: search + export", async () => {
    await client.navigateToEnforcementSearch();
    const html = await client.searchEnforcementActions();

    const count = extractRecordCount(html);
    console.log(`  Enforcement Actions: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(
      FORMS.enforcementActions.exportBtn
    );
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/enforcement-actions.xls`, buffer);
    console.log("  Saved: fixtures/enforcement-actions.xls");
  }, 300_000);

  // =========================================================================
  // Complaints
  // =========================================================================

  test("complaints: search + export", async () => {
    await client.navigateToComplaintSearch();
    const html = await client.searchComplaints();

    const count = extractRecordCount(html);
    console.log(`  Complaints: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(
      FORMS.complaints.exportBtn
    );
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/complaints.xls`, buffer);
    console.log("  Saved: fixtures/complaints.xls");
  }, 120_000);

  // =========================================================================
  // Site Visits
  // =========================================================================

  test("site visits: search + export", async () => {
    await client.navigateToSiteVisitSearch();
    const html = await client.searchSiteVisits();

    const count = extractRecordCount(html);
    console.log(`  Site Visits: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(
      FORMS.siteVisits.exportBtn
    );
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/site-visits.xls`, buffer);
    console.log("  Saved: fixtures/site-visits.xls");
  }, 120_000);

  // =========================================================================
  // Asbestos Notifications
  // =========================================================================

  test("asbestos notifications: search + export", async () => {
    await client.navigateToAsbestosNotificationSearch();
    const html = await client.searchAsbestosNotifications();

    const count = extractRecordCount(html);
    console.log(`  Asbestos Notifications: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(
      FORMS.asbestosNotifications.exportBtn
    );
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/asbestos-notifications.xls`, buffer);
    console.log("  Saved: fixtures/asbestos-notifications.xls");
  }, 180_000);

  // =========================================================================
  // Invoices
  // =========================================================================

  test("invoices: search + export", async () => {
    await client.navigateToInvoiceSearch();
    const html = await client.searchInvoices();

    const count = extractRecordCount(html);
    console.log(`  Invoices: ${count} records`);
    console.log(`  Headers: ${extractHeaders(html).join(" | ")}`);

    const buffer = await client.exportCurrentResults(FORMS.invoices.exportBtn);
    expect(buffer.length).toBeGreaterThan(10_000);
    console.log(`  Export: ${buffer.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/invoices.xls`, buffer);
    console.log("  Saved: fixtures/invoices.xls");
  }, 300_000);
});
