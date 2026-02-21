import { BASE_URL, DUST_APP_STATUS_VALUES, FORMS, PAGES } from "./constants";

export type { PageContext, SessionState } from "./transport";

import type { PageContext, SessionState } from "./transport";
import { AQSessionTransport } from "./transport";
import type { DustAppSearchParams } from "./types";

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

  navigateToAsbestosNotificationSearch(): Promise<string> {
    return this.navigateTo(
      PAGES.asbestosNotificationSearch,
      "asbestos_notification_search"
    );
  }

  navigateToComplaintSearch(): Promise<string> {
    return this.navigateTo(PAGES.complaintSearch, "complaint_search");
  }

  navigateToDustApplicationSearch(): Promise<string> {
    return this.navigateTo(
      PAGES.dustApplicationSearch,
      "dust_application_search"
    );
  }

  navigateToInvoiceSearch(): Promise<string> {
    return this.navigateTo(PAGES.invoiceSearch, "invoice_search");
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
    const fields: Record<string, string | string[]> = {
      source: FORMS.dustApplications.submitBtn,
    };

    // For direct ID lookups, default to Active to match typical portal usage.
    // For broad syncs, default to all statuses so exports are complete.
    let statuses: DustAppSearchParams["statuses"] = [];
    if (params.statuses?.length) {
      statuses = params.statuses;
    } else if (params.applicationId) {
      statuses = ["Active"];
    } else {
      statuses = ["Active", "Closed", "Rejected", "Submitted", "Superseded"];
    }

    if (statuses.length) {
      const values = statuses
        .map((status) => DUST_APP_STATUS_VALUES[status])
        .filter((value): value is string => value !== undefined);
      if (values.length > 0) {
        fields[FORMS.dustApplications.statusField] = values;
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

  searchInvoices(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.invoices.submitBtn,
    });
  }

  searchComplaints(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.complaints.submitBtn,
    });
  }

  searchAsbestosNotifications(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.asbestosNotifications.submitBtn,
    });
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

  openDustApplicationDetail(applicationId: string): Promise<string> {
    const source = this.findDustApplicationRowSource(applicationId);
    if (!source) {
      throw new Error(
        `Could not find detail link source for application ${applicationId}`
      );
    }

    const postUrl = this.buildPostUrl(this.currentFormAction || PAGES.home);
    const body = new URLSearchParams();
    body.append("oracle.adf.faces.FORM", this.currentFormName);
    body.append("oracle.adf.faces.STATE_TOKEN", this.stateToken);
    body.append("source", source);

    return fetch(postUrl, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      method: "POST",
      redirect: "manual",
    }).then((res) => this.followResponse(res));
  }

  resolveAbsoluteUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }
    if (trimmed.startsWith("/")) {
      return `${BASE_URL}${trimmed}`;
    }
    return `${BASE_URL}/${trimmed}`;
  }

  async downloadDocument(url: string): Promise<{
    bytes: Uint8Array;
    contentType: string | null;
    url: string;
  }> {
    const resolvedUrl = this.resolveAbsoluteUrl(url);
    if (!resolvedUrl) {
      throw new Error("Document URL is empty.");
    }

    const res = await this.fetchWithSession(resolvedUrl);
    if (!res.ok) {
      throw new Error(
        `Document download failed (${res.status}) for ${resolvedUrl}`
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      bytes,
      contentType: res.headers.get("content-type"),
      url: resolvedUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  override exportCurrentResults(exportBtnSource: string): Promise<Buffer> {
    return super.exportCurrentResults(exportBtnSource);
  }

  private findDustApplicationRowSource(
    applicationId: string
  ): string | undefined {
    const escapedId = applicationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rowPattern = new RegExp(
      `<a[^>]*onclick="[^"]*source:'([^']+)'[^"]*"[^>]*>\\s*${escapedId}\\s*<\\/a>`,
      "i"
    );
    const match = this.lastResponseHtml.match(rowPattern);
    return match?.[1];
  }
}
