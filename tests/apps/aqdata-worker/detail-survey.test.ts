/**
 * AQData Detail Page Survey — discover detail page HTML for all sections.
 *
 * Connects to the live portal, searches each section, picks the first record,
 * clicks into its detail page, and saves the raw HTML as a fixture. These
 * fixtures become the basis for building detail page parsers.
 *
 * Gate: RUN_AQ_DETAIL_SURVEY=true (hits live portal, writes fixture files)
 */
import { describe, expect, test } from "bun:test";
import { AQDataClient } from "../../../apps/aqdata-worker/src/aqdata/client";

const RUN_SURVEY = process.env.RUN_AQ_DETAIL_SURVEY === "true";
const describeSuite = RUN_SURVEY ? describe : describe.skip;
const FIXTURES_DIR = "tests/apps/aqdata-worker/fixtures/detail-pages";

// ID patterns for extracting the first record from search results
const FIRST_ID_PATTERNS: Record<string, RegExp> = {
  asbestosNotification: />(ASB\d+)</,
  complaint: />(CMPL\d+)</,
  complianceReport: />(CRPT\d+)</,
  enforcementAction: />(ENF\d+)</,
  invoice: />(IV\d+)</,
  settlement: />(SA\d+)</,
  siteVisit: />(SITE\d+)</,
};

function extractFirstId(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ?? null;
}

let client: AQDataClient;

describeSuite("AQData Detail Page Survey — all sections", () => {
  test("connects to portal", async () => {
    client = new AQDataClient();
    await client.connect();
    expect(client.currentState).toBe("disclaimer_accepted");
    console.log("  Connected, session:", client.sessionId?.slice(0, 16));
  }, 30_000);

  // =========================================================================
  // Settlement Detail
  // =========================================================================

  test("settlement: search + open detail", async () => {
    await client.navigateToSettlementSearch();
    const searchHtml = await client.searchSettlements();
    const id = extractFirstId(searchHtml, FIRST_ID_PATTERNS.settlement);
    console.log(`  Settlement ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/settlement-detail.html`, detailHtml);
    console.log("  Saved: fixtures/detail-pages/settlement-detail.html");
  }, 120_000);

  // =========================================================================
  // Compliance Report Detail
  // =========================================================================

  test("compliance report: search + open detail", async () => {
    await client.navigateToComplianceReportSearch();
    const searchHtml = await client.searchComplianceReports();
    const id = extractFirstId(searchHtml, FIRST_ID_PATTERNS.complianceReport);
    console.log(`  Compliance Report ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(
      `${FIXTURES_DIR}/compliance-report-detail.html`,
      detailHtml
    );
    console.log("  Saved: fixtures/detail-pages/compliance-report-detail.html");
  }, 120_000);

  // =========================================================================
  // Enforcement Action Detail
  // =========================================================================

  test("enforcement action: search + open detail", async () => {
    await client.navigateToEnforcementSearch();
    const searchHtml = await client.searchEnforcementActions();
    const id = extractFirstId(searchHtml, FIRST_ID_PATTERNS.enforcementAction);
    console.log(`  Enforcement Action ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(
      `${FIXTURES_DIR}/enforcement-action-detail.html`,
      detailHtml
    );
    console.log(
      "  Saved: fixtures/detail-pages/enforcement-action-detail.html"
    );
  }, 120_000);

  // =========================================================================
  // Complaint Detail
  // =========================================================================

  test("complaint: search + open detail", async () => {
    await client.navigateToComplaintSearch();
    const searchHtml = await client.searchComplaints();
    const id = extractFirstId(searchHtml, FIRST_ID_PATTERNS.complaint);
    console.log(`  Complaint ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/complaint-detail.html`, detailHtml);
    console.log("  Saved: fixtures/detail-pages/complaint-detail.html");
  }, 120_000);

  // =========================================================================
  // Site Visit Detail
  // =========================================================================

  test("site visit: search + open detail", async () => {
    await client.navigateToSiteVisitSearch();
    const searchHtml = await client.searchSiteVisits();
    const id = extractFirstId(searchHtml, FIRST_ID_PATTERNS.siteVisit);
    console.log(`  Site Visit ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/site-visit-detail.html`, detailHtml);
    console.log("  Saved: fixtures/detail-pages/site-visit-detail.html");
  }, 120_000);

  // =========================================================================
  // Asbestos Notification Detail
  // =========================================================================

  test("asbestos notification: search + open detail", async () => {
    await client.navigateToAsbestosNotificationSearch();
    const searchHtml = await client.searchAsbestosNotifications();
    const id = extractFirstId(
      searchHtml,
      FIRST_ID_PATTERNS.asbestosNotification
    );
    console.log(`  Asbestos Notification ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(
      `${FIXTURES_DIR}/asbestos-notification-detail.html`,
      detailHtml
    );
    console.log(
      "  Saved: fixtures/detail-pages/asbestos-notification-detail.html"
    );
  }, 120_000);

  // =========================================================================
  // Invoice Detail
  // =========================================================================

  test("invoice: search + open detail", async () => {
    await client.navigateToInvoiceSearch();
    const searchHtml = await client.searchInvoices();
    const id = extractFirstId(searchHtml, FIRST_ID_PATTERNS.invoice);
    console.log(`  Invoice ID: ${id}`);
    expect(id).toBeTruthy();

    const detailHtml = await client.openRecordDetail(id as string);
    expect(detailHtml.length).toBeGreaterThan(1000);
    console.log(`  Detail HTML: ${detailHtml.length} bytes`);

    await Bun.write(`${FIXTURES_DIR}/invoice-detail.html`, detailHtml);
    console.log("  Saved: fixtures/detail-pages/invoice-detail.html");
  }, 120_000);
});
