/**
 * AQData Portal E2E Verification Tests
 *
 * Verifies that the AQData HTTP client can connect to the Maricopa County
 * portal, navigate the Oracle ADF form system, export data, parse results,
 * and scrape individual permit detail pages.
 *
 * Gate: RUN_AQ_E2E=true (hits the live portal)
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AQDataClient } from "../../../apps/aqdata-worker/src/aqdata/client";
import { FORMS } from "../../../apps/aqdata-worker/src/aqdata/constants";
import { parseDustApplicationDetail } from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail";
import { parseDustApplicationExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-applications";

const APP_ID_REGEX = /^D\d+$/;
const RUN_E2E = process.env.RUN_AQ_E2E === "true";
const describeSuite = RUN_E2E ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Shared client and fixtures for the test suite
// ---------------------------------------------------------------------------

let client: AQDataClient;
let exportBuffer: Buffer;
let samplePermitId: string;

describeSuite("AQData Portal E2E", () => {
  afterAll(() => {
    // Pure HTTP client — no teardown needed
  });

  // =========================================================================
  // Phase 1: Session — verify portal reachable and session established
  // =========================================================================

  describe("session", () => {
    test("portal is reachable and returns JSESSIONID", async () => {
      const res = await fetch("https://aqdata.maricopa.gov/disclaimer.jsf", {
        redirect: "manual",
      });

      expect(res.status).toBe(200);
      const cookies = res.headers.getSetCookie?.() ?? [];
      expect(cookies.some((c) => c.startsWith("JSESSIONID="))).toBeTrue();
    }, 15_000);

    test("client connects through disclaimer to home page", async () => {
      client = new AQDataClient();
      await client.connect();

      expect(client.currentState).toBe("disclaimer_accepted");
      expect(client.sessionId).toBeDefined();
      expect(client.lastHtml).toContain("Home");
    }, 20_000);
  });

  // =========================================================================
  // Phase 2: Export — navigate, search, export, parse dust applications
  // =========================================================================

  describe("dust application export", () => {
    test("navigates to dust application search page", async () => {
      const html = await client.navigateToDustApplicationSearch();

      expect(html).toContain("dustAppSearch_SubmitBtn");
      expect(html).toContain("dcpStateCds");
      expect(client.currentPage).toBe("dust_application_search");
    }, 20_000);

    test("searches all statuses and gets results table", async () => {
      const html = await client.searchDustApplications();

      expect(html).toContain("dcpSearchTable");
    }, 60_000);

    test("exports results to Excel buffer", async () => {
      exportBuffer = await client.exportCurrentResults(
        FORMS.dustApplications.exportBtn
      );

      expect(exportBuffer.length).toBeGreaterThan(100_000);
    }, 60_000);

    test("parses export into thousands of permits", () => {
      const results = parseDustApplicationExport(exportBuffer);

      expect(results.length).toBeGreaterThan(1000);
      console.log(`  Parsed ${results.length} permits from live export`);

      // Grab a known-active permit for detail scrape phase
      const active = results.find((p) => p.status === "Active");
      const first = results[0];
      if (!(active || first)) {
        throw new Error("Expected at least one permit in export");
      }
      samplePermitId = active?.applicationId ?? first?.applicationId ?? "";
    });

    test("every parsed permit has a valid application ID", () => {
      const results = parseDustApplicationExport(exportBuffer);

      for (const permit of results) {
        expect(permit.applicationId).toMatch(APP_ID_REGEX);
      }
    });

    test("field coverage: required fields are populated", () => {
      const results = parseDustApplicationExport(exportBuffer);
      let withStatus = 0;
      let withCompany = 0;
      let withCity = 0;

      for (const permit of results) {
        if (permit.status) {
          withStatus++;
        }
        if (permit.companyName) {
          withCompany++;
        }
        if (permit.city) {
          withCity++;
        }
      }

      // These coverage thresholds are based on actual portal data
      expect(withStatus / results.length).toBeGreaterThan(0.95);
      expect(withCompany / results.length).toBeGreaterThan(0.9);
      expect(withCity / results.length).toBeGreaterThan(0.8);
    });
  });

  // =========================================================================
  // Phase 3: Detail — navigate to individual permit and parse with Cheerio
  // =========================================================================

  describe("permit detail scrape", () => {
    test("navigates to search and finds a specific permit", async () => {
      await client.navigateToDustApplicationSearch();
      const html = await client.searchDustApplications({
        applicationId: samplePermitId,
      });

      expect(html).toContain(samplePermitId);
    }, 30_000);

    test("opens permit detail page via row link", async () => {
      const html = await client.openRecordDetail(samplePermitId);

      expect(html).toContain("Dust Application Detail");
      expect(html.length).toBeGreaterThan(10_000);
    }, 30_000);

    test("Cheerio parser extracts structured detail from live HTML", async () => {
      // Re-fetch detail for a clean parse
      await client.navigateToDustApplicationSearch();
      await client.searchDustApplications({
        applicationId: samplePermitId,
      });
      const html = await client.openRecordDetail(samplePermitId);
      const detail = parseDustApplicationDetail(html, samplePermitId);

      expect(detail.applicationId).toBe(samplePermitId);
      expect(detail.structured.header.applicationId).toBe(samplePermitId);
      expect(detail.structured.header.status).toBeTruthy();
      expect(detail.structured.header.companyName).toBeTruthy();

      // Coordinates should be present for most permits
      if (detail.coordinates) {
        expect(detail.coordinates.latitude).toBeGreaterThan(30);
        expect(detail.coordinates.latitude).toBeLessThan(37);
        expect(detail.coordinates.longitude).toBeGreaterThan(-115);
        expect(detail.coordinates.longitude).toBeLessThan(-109);
      }

      console.log(
        `  Detail: ${samplePermitId} | ${detail.structured.header.status} | ${detail.structured.header.companyName}`
      );
      console.log(
        `  Attachments: ${detail.attachments.length} | Permit doc: ${detail.permitDocument ? "yes" : "no"}`
      );
    }, 60_000);

    test("attachments list includes document links", async () => {
      await client.navigateToDustApplicationSearch();
      await client.searchDustApplications({
        applicationId: samplePermitId,
      });
      const html = await client.openRecordDetail(samplePermitId);
      const detail = parseDustApplicationDetail(html, samplePermitId);

      // Most active permits have at least one attachment
      if (detail.attachments.length > 0) {
        for (const attachment of detail.attachments) {
          expect(attachment.url).toContain("https://");
          expect(attachment.attachmentId).toBeTruthy();
        }
      }
    }, 60_000);
  });

  // =========================================================================
  // Phase 4: PDF — download permit document and extract fields
  // =========================================================================

  describe("permit PDF download", () => {
    test("downloads permit document PDF if available", async () => {
      await client.navigateToDustApplicationSearch();
      await client.searchDustApplications({
        applicationId: samplePermitId,
      });
      const html = await client.openRecordDetail(samplePermitId);
      const detail = parseDustApplicationDetail(html, samplePermitId);

      if (!detail.permitDocument?.url) {
        console.log("  No permit document available — skipping PDF test");
        return;
      }

      const doc = await client.downloadDocument(detail.permitDocument.url);

      expect(doc.bytes.length).toBeGreaterThan(1000);
      expect(
        doc.contentType?.includes("pdf") || doc.url.endsWith(".pdf")
      ).toBeTrue();
      console.log(
        `  Downloaded PDF: ${doc.bytes.length} bytes, type: ${doc.contentType}`
      );
    }, 30_000);
  });

  // =========================================================================
  // Phase 5: Portal coverage — verify other sections are navigable
  // =========================================================================

  describe("portal section navigation", () => {
    test("inspections search page loads", async () => {
      const html = await client.navigateToInspectionSearch();
      expect(html).toContain("inspectionSearch_SubmitBtn");
    }, 20_000);

    test("enforcement actions search page loads", async () => {
      const html = await client.navigateToEnforcementSearch();
      expect(html).toContain("eaSearch_SubmitBtn");
    }, 20_000);

    test("settlements search page loads", async () => {
      const html = await client.navigateToSettlementSearch();
      expect(html).toContain("saSearch_SubmitBtn");
    }, 20_000);

    test("site visits search page loads", async () => {
      const html = await client.navigateToSiteVisitSearch();
      expect(html).toContain("siteVisitSearchBtn");
    }, 20_000);

    test("compliance reports search page loads", async () => {
      const html = await client.navigateToComplianceReportSearch();
      expect(html).toContain("compReportSearch_SubmitBtn");
    }, 20_000);
  });
});
