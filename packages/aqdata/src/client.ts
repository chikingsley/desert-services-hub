import {
  BASE_URL,
  DUST_APP_STATUS_VALUES,
  FORMS,
  PAGES,
} from "@aqdata/constants";

export type { PageContext, SessionState } from "@aqdata/transport";

import type { PageContext, SessionState } from "@aqdata/transport";
import { AQSessionTransport } from "@aqdata/transport";
import type { DustAppSearchParams } from "@aqdata/types";

export class AQDataClient extends AQSessionTransport {
  get currentState(): SessionState {
    return this.state;
  }

  get currentPage(): PageContext {
    return this.pageContext;
  }

  get lastHtml(): string {
    return this.lastResponseHtml;
  }

  get sessionId(): string | undefined {
    return this.cookies.get("JSESSIONID");
  }

  get disclaimerAck(): string | undefined {
    return this.cookies.get("disclaimer-ack");
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigateTo(path: string, context: PageContext): Promise<string> {
    if (this.state === "disconnected") {
      throw new Error("Not connected. Call connect() first.");
    }
    const url = `${BASE_URL}${path}`;
    if (this.debug) {
      console.log(`  [client] GET ${url}`);
    }
    const res = await fetch(url, {
      headers: { Cookie: this.getCookieHeader() },
      redirect: "manual",
    });

    const html = await this.followResponse(res);
    this.pageContext = context;
    this.state = "on_page";
    return html;
  }

  navigateToDustApplicationSearch(): Promise<string> {
    return this.navigateTo(
      PAGES.dustApplicationSearch,
      "dust_application_search"
    );
  }

  navigateToInspectionSearch(): Promise<string> {
    return this.navigateTo(PAGES.inspectionSearch, "inspection_search");
  }

  navigateToComplianceReportSearch(): Promise<string> {
    return this.navigateTo(
      PAGES.complianceReportSearch,
      "compliance_report_search"
    );
  }

  navigateToEnforcementSearch(): Promise<string> {
    return this.navigateTo(PAGES.enforcementSearch, "enforcement_search");
  }

  navigateToSettlementSearch(): Promise<string> {
    return this.navigateTo(PAGES.settlementSearch, "settlement_search");
  }

  navigateToSiteVisitSearch(): Promise<string> {
    return this.navigateTo(PAGES.siteVisitSearch, "site_visit_search");
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  searchDustApplications(params: DustAppSearchParams = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.dustApplications.submitBtn,
    };

    const statuses = params.statuses ?? [
      "Active",
      "Closed",
      "Rejected",
      "Submitted",
      "Superseded",
    ];
    for (const s of statuses) {
      const val = DUST_APP_STATUS_VALUES[s];
      if (val !== undefined) {
        fields[FORMS.dustApplications.statusField] = val;
      }
    }

    if (params.applicationId) {
      fields[FORMS.dustApplications.fields.applicationId] =
        params.applicationId;
    }
    if (params.facilityId) {
      fields[FORMS.dustApplications.fields.facilityId] = params.facilityId;
    }
    if (params.facilityName) {
      fields[FORMS.dustApplications.fields.facilityName] = params.facilityName;
    }
    if (params.projectName) {
      fields[FORMS.dustApplications.fields.projectName] = params.projectName;
    }
    if (params.companyName) {
      fields[FORMS.dustApplications.fields.companyName] = params.companyName;
    }
    if (params.address) {
      fields[FORMS.dustApplications.fields.address] = params.address;
    }
    if (params.city) {
      fields[FORMS.dustApplications.fields.city] = params.city;
    }
    if (params.parcel) {
      fields[FORMS.dustApplications.fields.parcel] = params.parcel;
    }

    return this.postCurrentForm(fields);
  }

  searchInspections(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.inspections.submitBtn,
    });
  }

  searchEnforcementActions(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.enforcementActions.submitBtn,
    });
  }

  searchSettlements(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.settlements.submitBtn,
    });
  }

  searchSiteVisits(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.siteVisits.submitBtn,
    });
  }

  searchComplianceReports(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.complianceReports.submitBtn,
    });
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  override exportCurrentResults(exportBtnSource: string): Promise<Buffer> {
    return super.exportCurrentResults(exportBtnSource);
  }
}
