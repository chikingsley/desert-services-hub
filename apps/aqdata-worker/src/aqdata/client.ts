import { BASE_URL, DUST_APP_STATUS_VALUES, FORMS, PAGES } from "./constants";

const CLICKABLE_LINK_REGEX =
  /<a[^>]*onclick="[^"]*source:[\\']?'?[^"]*"[^>]*>\s*([A-Z]+\d+)\s*<\/a>/gi;
const ANY_LINK_ID_REGEX = /<a[^>]*>\s*([A-Z]+\d+)\s*<\/a>/gi;

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

  searchInvoices(params: { invoiceNumber?: string } = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.invoices.submitBtn,
    };
    if (params.invoiceNumber) {
      fields[FORMS.invoices.fields.invoiceNumber] = params.invoiceNumber;
    }
    return this.postCurrentForm(fields);
  }

  searchComplaints(params: { complaintId?: string } = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.complaints.submitBtn,
    };
    if (params.complaintId) {
      fields[FORMS.complaints.fields.complaintId] = params.complaintId;
    }
    return this.postCurrentForm(fields);
  }

  searchAsbestosNotifications(
    params: { notificationNumber?: string } = {}
  ): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.asbestosNotifications.submitBtn,
    };
    if (params.notificationNumber) {
      fields[FORMS.asbestosNotifications.fields.notificationNumber] =
        params.notificationNumber;
    }
    return this.postCurrentForm(fields);
  }

  searchInspections(params: { inspectionId?: string } = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.inspections.submitBtn,
    };
    if (params.inspectionId) {
      fields[FORMS.inspections.fields.inspectionId] = params.inspectionId;
    }
    return this.postCurrentForm(fields);
  }

  searchEnforcementActions(
    params: { actionId?: string } = {}
  ): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.enforcementActions.submitBtn,
    };
    if (params.actionId) {
      fields[FORMS.enforcementActions.fields.actionId] = params.actionId;
    }
    return this.postCurrentForm(fields);
  }

  searchSettlements(params: { settlementId?: string } = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.settlements.submitBtn,
    };
    if (params.settlementId) {
      fields[FORMS.settlements.fields.settlementId] = params.settlementId;
    }
    return this.postCurrentForm(fields);
  }

  searchSiteVisits(params: { siteVisitId?: string } = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.siteVisits.submitBtn,
    };
    if (params.siteVisitId) {
      fields[FORMS.siteVisits.fields.siteVisitId] = params.siteVisitId;
    }
    return this.postCurrentForm(fields);
  }

  searchComplianceReports(params: { reportId?: string } = {}): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.complianceReports.submitBtn,
    };
    if (params.reportId) {
      fields[FORMS.complianceReports.fields.reportId] = params.reportId;
    }
    return this.postCurrentForm(fields);
  }

  // ---------------------------------------------------------------------------
  // Detail Pages
  // ---------------------------------------------------------------------------

  /**
   * Open a record's detail page by clicking its link in the current search
   * results. Works for any section — the source parameter is extracted from
   * the `onclick` handler of the `<a>` tag whose text matches the record ID.
   */
  openRecordDetail(recordId: string): Promise<string> {
    const source = this.findRowSource(recordId);
    if (!source) {
      throw new Error(
        `Could not find detail link source for record ${recordId}`
      );
    }
    return this.postCurrentForm({ source });
  }

  /**
   * @deprecated Use `openRecordDetail(applicationId)` instead.
   */
  openDustApplicationDetail(applicationId: string): Promise<string> {
    return this.openRecordDetail(applicationId);
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

  /**
   * Find all record IDs in the current search results that have clickable
   * `onclick` handlers. Returns IDs matching the given pattern (e.g. /CRPT\d+/)
   * that actually have a `source` parameter in their onclick.
   */
  findClickableIds(idPattern: RegExp): string[] {
    const matches = this.lastResponseHtml.matchAll(CLICKABLE_LINK_REGEX);
    const ids: string[] = [];
    for (const match of matches) {
      const id = match[1];
      if (id && idPattern.test(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Find all record IDs in the current search results (clickable or not).
   * Returns all IDs matching the pattern found in `<a>` tags.
   */
  findAllIds(idPattern: RegExp): string[] {
    const matches = this.lastResponseHtml.matchAll(ANY_LINK_ID_REGEX);
    const ids: string[] = [];
    for (const match of matches) {
      const id = match[1];
      if (id && idPattern.test(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Find the Oracle ADF `source` parameter for a record's clickable link in
   * the current search results HTML.
   *
   * Pattern: `<a onclick="...source:'SOURCE_VALUE'...">RECORD_ID</a>`
   *
   * Also handles Oracle ADF escaped quotes (`source:\'VALUE\'`).
   */
  private findRowSource(recordId: string): string | undefined {
    const escapedId = recordId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Try standard quotes first, then ADF-escaped quotes
    const patterns = [
      new RegExp(
        `<a[^>]*onclick="[^"]*source:'([^']+)'[^"]*"[^>]*>\\s*${escapedId}\\s*<\\/a>`,
        "i"
      ),
      new RegExp(
        `<a[^>]*onclick="[^"]*source:\\\\'([^\\\\']+)\\\\'[^"]*"[^>]*>\\s*${escapedId}\\s*<\\/a>`,
        "i"
      ),
    ];

    for (const pattern of patterns) {
      const match = this.lastResponseHtml.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    return undefined;
  }
}
