import { afterAll, describe, expect, test } from "bun:test";
import { AQDataClient } from "@aqdata/client";
import { FORMS } from "@aqdata/constants";
import { parseDustApplicationExport } from "@aqdata/parsers/dust-applications";

const RUN_SPIKE = process.env.RUN_AQ_SPIKE === "true";
const RUN_UNFILTERED_SEARCHES = process.env.RUN_AQ_SPIKE_UNFILTERED === "true";
const describeSuite = RUN_SPIKE ? describe : describe.skip;
const RESULTS_TABLE_ID_REGEX = /id="([^"]*(?:Table|table)[^"]*)"/;

const FIXTURES_DIR = "apps/cli-tools/aqdata-cli/tests/fixtures";

let client: AQDataClient;

describeSuite("AQ Data Spike", () => {
  afterAll(() => {
    // Pure HTTP client, nothing to tear down
  });

  // ==========================================================================
  // PHASE 1: Session
  // ==========================================================================

  test("1. site reachable", async () => {
    const res = await fetch("https://aqdata.maricopa.gov/disclaimer.jsf", {
      redirect: "manual",
    });
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie?.() ?? [];
    expect(setCookies.find((c) => c.startsWith("JSESSIONID="))).toBeDefined();
    const html = await res.text();
    expect(html).toContain("_idJsp1:agreeBtn");
    console.log("  [1] Site reachable, JSESSIONID present, agree button found");
  }, 15_000);

  test("2. connect session", async () => {
    client = new AQDataClient();
    await client.connect();

    expect(client.currentState).toBe("disclaimer_accepted");
    expect(client.sessionId).toBeDefined();
    expect(client.disclaimerAck).toBe("dHJ1ZQ==");
    expect(client.lastHtml).toContain("Home");
    console.log("  [2] Session established, on home page");
  }, 20_000);

  // ==========================================================================
  // PHASE 2: Dust Application Search
  // ==========================================================================

  test("3. navigate to Dust Application Search", async () => {
    const html = await client.navigateToDustApplicationSearch();

    expect(html).toContain("dustAppSearch_SubmitBtn");
    expect(html).toContain("dcpStateCds");
    expect(html).toContain("dcpNumber");
    console.log(
      "  [3] Dust Application Search loaded, page:",
      client.currentPage
    );
  }, 20_000);

  test("4. search dust applications", async () => {
    const html = await client.searchDustApplications();

    expect(html).toContain("dcpSearchTable");
    console.log("  [4] Search results table present");
  }, 60_000);

  test("5. export dust applications to Excel", async () => {
    const buffer = await client.exportCurrentResults(
      FORMS.dustApplications.exportBtn
    );

    expect(buffer.length).toBeGreaterThan(0);
    console.log("  [5] Export:", buffer.length, "bytes");

    await Bun.write(`${FIXTURES_DIR}/dust-applications.xls`, buffer);
  }, 60_000);

  test("6. parse exported dust applications", async () => {
    const data = await Bun.file(
      `${FIXTURES_DIR}/dust-applications.xls`
    ).arrayBuffer();
    const results = parseDustApplicationExport(Buffer.from(data));

    expect(results.length).toBeGreaterThan(0);
    console.log("  [6] Parsed", results.length, "dust applications");

    const first = results[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error("Expected at least one dust application in export");
    }
    expect(first.applicationId).toBeTruthy();
    console.log(
      "  [6] First:",
      first.applicationId,
      "|",
      first.status,
      "|",
      first.companyName
    );
  }, 15_000);

  // ==========================================================================
  // PHASE 3: Compliance — Inspection Search
  // ==========================================================================

  test("7. navigate to Inspection Search", async () => {
    const html = await client.navigateToInspectionSearch();

    expect(html).toContain("inspectionSearch_SubmitBtn");
    console.log("  [7] Inspection Search loaded, page:", client.currentPage);
  }, 30_000);

  test("8. search inspections (server timeout — too many unfiltered results)", async () => {
    if (!RUN_UNFILTERED_SEARCHES) {
      return;
    }
    const html = await client.searchInspections();
    expect(html).toContain("fceTable");
  }, 120_000);

  test("9. export inspections", async () => {
    const buffer = await client.exportCurrentResults(
      FORMS.inspections.exportBtn
    );

    expect(buffer.length).toBeGreaterThan(0);
    console.log("  [9] Export:", buffer.length, "bytes");

    await Bun.write(`${FIXTURES_DIR}/inspections.xls`, buffer);
  }, 60_000);

  // ==========================================================================
  // PHASE 4: Enforcement Actions
  // ==========================================================================

  test("10. navigate to Enforcement Action Search", async () => {
    const html = await client.navigateToEnforcementSearch();

    expect(html).toContain("eaSearch_SubmitBtn");
    console.log(
      "  [10] Enforcement Action Search loaded, page:",
      client.currentPage
    );
  }, 20_000);

  test("11. search enforcement actions (server timeout — too many unfiltered results)", async () => {
    if (!RUN_UNFILTERED_SEARCHES) {
      return;
    }
    const html = await client.searchEnforcementActions();
    console.log("  [11] HTML length:", html.length);
  }, 120_000);

  // ==========================================================================
  // PHASE 5: Settlements
  // ==========================================================================

  test("12. navigate to Settlement Search", async () => {
    const html = await client.navigateToSettlementSearch();

    expect(html).toContain("saSearch_SubmitBtn");
    console.log("  [12] Settlement Search loaded, page:", client.currentPage);
  }, 20_000);

  test("13. search settlements", async () => {
    const html = await client.searchSettlements();

    console.log("  [13] Search completed, HTML length:", html.length);
    const tableMatch = html.match(RESULTS_TABLE_ID_REGEX);
    if (tableMatch) {
      console.log("  [13] Results table:", tableMatch[1]);
    }
  }, 60_000);

  // ==========================================================================
  // PHASE 6: Site Visits
  // ==========================================================================

  test("14. navigate to Site Visit Search", async () => {
    const html = await client.navigateToSiteVisitSearch();

    expect(html).toContain("siteVisitSearchBtn");
    console.log("  [14] Site Visit Search loaded, page:", client.currentPage);
  }, 20_000);

  test("15. search site visits", async () => {
    const html = await client.searchSiteVisits();

    console.log("  [15] Search completed, HTML length:", html.length);
    const tableMatch = html.match(RESULTS_TABLE_ID_REGEX);
    if (tableMatch) {
      console.log("  [15] Results table:", tableMatch[1]);
    }
  }, 60_000);

  // ==========================================================================
  // PHASE 7: Compliance Reports
  // ==========================================================================

  test("16. navigate to Compliance Report Search", async () => {
    const html = await client.navigateToComplianceReportSearch();

    expect(html).toContain("compReportSearch_SubmitBtn");
    console.log(
      "  [16] Compliance Report Search loaded, page:",
      client.currentPage
    );
  }, 20_000);

  test("17. search compliance reports", async () => {
    const html = await client.searchComplianceReports();

    console.log("  [17] Search completed, HTML length:", html.length);
    const tableMatch = html.match(RESULTS_TABLE_ID_REGEX);
    if (tableMatch) {
      console.log("  [17] Results table:", tableMatch[1]);
    }
  }, 60_000);
});
