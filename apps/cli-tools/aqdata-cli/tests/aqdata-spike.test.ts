import { afterAll, describe, expect, test } from "bun:test";
import { AQDataClient } from "@aqdata/client";
import { FORMS } from "@aqdata/constants";
import { parseDustApplicationExport } from "@aqdata/parsers/dust-applications";

const RUN_SPIKE = process.env.RUN_AQ_SPIKE === "true";
const describeSuite = RUN_SPIKE ? describe : describe.skip;

const FIXTURES_DIR =
  "apps/cli-tools/aqdata-cli/tests/fixtures";

let client: AQDataClient;

describeSuite("AQ Data Spike", () => {
  afterAll(() => {
    // Pure HTTP client, nothing to tear down
  });

  // ==========================================================================
  // PHASE 1: Session establishment
  // ==========================================================================

  test("1. GET disclaimer page and extract JSESSIONID", async () => {
    client = new AQDataClient();

    // connect() handles the full disclaimer flow internally
    // But first let's verify the site is reachable
    const res = await fetch("https://aqdata.maricopa.gov/disclaimer.jsf", {
      redirect: "manual",
    });
    expect(res.status).toBe(200);
    console.log("  [spike 1] Site is reachable, status:", res.status);

    const setCookies = res.headers.getSetCookie?.() ?? [];
    const jsessionCookie = setCookies.find((c) =>
      c.startsWith("JSESSIONID="),
    );
    expect(jsessionCookie).toBeDefined();
    console.log(
      "  [spike 1] JSESSIONID present:",
      !!jsessionCookie,
    );

    const html = await res.text();
    expect(html).toContain("_idJsp1:agreeBtn");
    expect(html).toContain("oracle.adf.faces.STATE_TOKEN");
    console.log(
      "  [spike 1] Disclaimer page has agree button and state token",
    );
  }, 15_000);

  test("2. connect() establishes full session", async () => {
    client = new AQDataClient();
    client.debug = true;
    await client.connect();

    expect(client.currentState).toBe("disclaimer_accepted");
    expect(client.sessionId).toBeDefined();
    expect(client.disclaimerAck).toBe("dHJ1ZQ==");
    console.log("  [spike 2] Session established");
    console.log("  [spike 2] State:", client.currentState);
    console.log("  [spike 2] Page:", client.currentPage);

    // Verify we got to the home page
    expect(client.lastHtml).toContain("Home");
    console.log(
      "  [spike 2] Home page loaded, HTML length:",
      client.lastHtml.length,
    );
  }, 20_000);

  // ==========================================================================
  // PHASE 2: Navigate to Dust Application Search
  // ==========================================================================

  test("3. navigate to Dust Application Search", async () => {
    const html = await client.navigateToDustApplicationSearch();

    expect(html).toContain("dustAppSearch_SubmitBtn");
    expect(html).toContain("dcpStateCds");
    console.log("  [spike 3] Dust Application Search page loaded");
    console.log("  [spike 3] Page context:", client.currentPage);
    console.log("  [spike 3] HTML length:", html.length);

    // Verify the form fields exist
    expect(html).toContain("dcpNumber");
    expect(html).toContain("facilityId");
    expect(html).toContain("projectName");
    console.log("  [spike 3] All expected form fields present");
  }, 20_000);

  // ==========================================================================
  // PHASE 3: Dust Application Search + Export + Parse
  // ==========================================================================

  test("4. search dust applications (all statuses)", async () => {
    const html = await client.searchDustApplications();

    // Should have result table
    expect(html).toContain("dcpSearchTable");
    console.log("  [spike 4] Search returned results table");

    // Check for result count in the HTML
    const countMatch = html.match(/(\d[\d,]*)\s+(?:of|total|results)/i);
    if (countMatch) {
      console.log("  [spike 4] Result count:", countMatch[1]);
    }

    // Verify export button is present
    expect(html).toContain("_idJsp72");
    console.log("  [spike 4] Export to Excel button found");
  }, 60_000);

  test("5. export dust application results to Excel", async () => {
    const buffer = await client.exportCurrentResults(
      FORMS.dustApplications.exportBtn,
    );

    expect(buffer.length).toBeGreaterThan(0);
    console.log("  [spike 5] Export buffer size:", buffer.length, "bytes");

    // Log first few bytes to identify format
    const header = buffer.slice(0, 20).toString("utf-8");
    console.log("  [spike 5] First 20 chars:", JSON.stringify(header));

    // Save fixture for offline tests
    const fixturePath = `${FIXTURES_DIR}/dust-applications.xls`;
    await Bun.write(fixturePath, buffer);
    console.log("  [spike 5] Saved fixture to", fixturePath);
  }, 60_000);

  test("6. parse exported dust applications", async () => {
    const fixturePath = `${FIXTURES_DIR}/dust-applications.xls`;
    const data = await Bun.file(fixturePath).arrayBuffer();
    const results = parseDustApplicationExport(Buffer.from(data));

    expect(results.length).toBeGreaterThan(0);
    console.log("  [spike 6] Parsed", results.length, "dust applications");

    // Validate first result
    const first = results[0]!;
    console.log("  [spike 6] First result:", JSON.stringify(first, null, 2));
    expect(first.applicationId).toBeTruthy();

    // Sample a few more
    const sample = results.slice(0, 5);
    for (const app of sample) {
      console.log(
        `  [spike 6]   ${app.applicationId} | ${app.status} | ${app.companyName ?? "?"} | ${app.projectName ?? "?"}`,
      );
    }
  }, 15_000);

  // ==========================================================================
  // PHASE 4: Compliance — Inspection Search
  // ==========================================================================

  test("7. navigate to Inspection Search", async () => {
    console.log("  [spike 7] Current page before nav:", client.currentPage);

    const html = await client.navigateToInspectionSearch();

    // Debug: check what page we landed on
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    console.log("  [spike 7] Page title:", titleMatch?.[1] ?? "unknown");
    console.log("  [spike 7] Page context:", client.currentPage);
    console.log("  [spike 7] HTML length:", html.length);

    // Debug: find all tab/sub-tab links on the page
    const linkRegex = /source:'([^']+)'\}[^>]*>.*?alt="([^"]+)"/gs;
    let linkMatch: RegExpExecArray | null;
    const links: string[] = [];
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      links.push(`${linkMatch[2]} => ${linkMatch[1]}`);
    }
    console.log("  [spike 7] Available links:", links.join(", "));

    expect(html).toContain("inspectionSearch_SubmitBtn");
    console.log("  [spike 7] Inspection Search page loaded");
  }, 30_000);

  test("8. search inspections (all)", async () => {
    const html = await client.searchInspections();

    expect(html).toContain("fceTable");
    console.log("  [spike 8] Inspection results table found");

    const countMatch = html.match(/(\d[\d,]*)\s+(?:of|total|results)/i);
    if (countMatch) {
      console.log("  [spike 8] Result count:", countMatch[1]);
    }
  }, 60_000);

  test("9. export inspection results", async () => {
    const buffer = await client.exportCurrentResults(
      FORMS.inspections.exportBtn,
    );

    expect(buffer.length).toBeGreaterThan(0);
    console.log("  [spike 9] Export buffer size:", buffer.length, "bytes");

    const fixturePath = `${FIXTURES_DIR}/inspections.xls`;
    await Bun.write(fixturePath, buffer);
    console.log("  [spike 9] Saved fixture to", fixturePath);

    // Quick peek at the data
    const { read, utils } = await import("xlsx");
    const wb = read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (sheet) {
      const rows = utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        raw: false,
        defval: null,
      });
      console.log("  [spike 9] Header:", rows[0]);
      console.log("  [spike 9] Row count:", rows.length);
      if (rows[1]) console.log("  [spike 9] First data row:", rows[1]);
    }
  }, 60_000);

  // ==========================================================================
  // PHASE 5: Enforcement Actions
  // ==========================================================================

  test("10. navigate to Enforcement Action Search", async () => {
    const html = await client.navigateToEnforcementSearch();

    expect(html).toContain("eaSearch_SubmitBtn");
    console.log("  [spike 10] Enforcement Action Search page loaded");
  }, 20_000);

  test("11. search enforcement actions (all)", async () => {
    const html = await client.searchEnforcementActions();

    console.log("  [spike 11] Search completed");
    console.log("  [spike 11] HTML length:", html.length);

    // Discover results table name and export button
    const tableMatch = html.match(/id="([^"]*(?:Table|table)[^"]*)"/);
    if (tableMatch) {
      console.log("  [spike 11] Results table ID:", tableMatch[1]);
    }

    // Discover export button
    const exportMatch = html.match(
      /source['":\s]+['"]([^'"]*(?:Table|table)[^'"]*_idJsp\d+)['"]/,
    );
    if (exportMatch) {
      console.log("  [spike 11] Export button source:", exportMatch[1]);
    }
  }, 60_000);

  // ==========================================================================
  // PHASE 6: Settlements
  // ==========================================================================

  test("12. navigate to Settlement Search", async () => {
    const html = await client.navigateToSettlementSearch();

    expect(html).toContain("saSearch_SubmitBtn");
    console.log("  [spike 12] Settlement Search page loaded");
  }, 20_000);

  test("13. search settlements (all)", async () => {
    const html = await client.searchSettlements();

    console.log("  [spike 13] Search completed");
    console.log("  [spike 13] HTML length:", html.length);

    const tableMatch = html.match(/id="([^"]*(?:Table|table)[^"]*)"/);
    if (tableMatch) {
      console.log("  [spike 13] Results table ID:", tableMatch[1]);
    }
  }, 60_000);

  // ==========================================================================
  // PHASE 7: Site Visits
  // ==========================================================================

  test("14. navigate to Site Visit Search", async () => {
    const html = await client.navigateToSiteVisitSearch();

    expect(html).toContain("siteVisitSearchBtn");
    console.log("  [spike 14] Site Visit Search page loaded");
  }, 20_000);

  test("15. search site visits (all)", async () => {
    const html = await client.searchSiteVisits();

    console.log("  [spike 15] Search completed");
    console.log("  [spike 15] HTML length:", html.length);

    const tableMatch = html.match(/id="([^"]*(?:Table|table)[^"]*)"/);
    if (tableMatch) {
      console.log("  [spike 15] Results table ID:", tableMatch[1]);
    }
  }, 60_000);

  // ==========================================================================
  // PHASE 8: Compliance Reports
  // ==========================================================================

  test("16. navigate to Compliance Report Search", async () => {
    const html = await client.navigateToComplianceReportSearch();

    expect(html).toContain("compReportSearch_SubmitBtn");
    console.log("  [spike 16] Compliance Report Search page loaded");
  }, 20_000);

  test("17. search compliance reports (all)", async () => {
    const html = await client.searchComplianceReports();

    console.log("  [spike 17] Search completed");
    console.log("  [spike 17] HTML length:", html.length);

    const tableMatch = html.match(/id="([^"]*(?:Table|table)[^"]*)"/);
    if (tableMatch) {
      console.log("  [spike 17] Results table ID:", tableMatch[1]);
    }
  }, 60_000);
});
