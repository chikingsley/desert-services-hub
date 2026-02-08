import {
  APPLICATIONS_SUBTABS,
  BASE_URL,
  COMPLIANCE_SUBTABS,
  DISCLAIMER,
  DUST_APP_STATUS_VALUES,
  FORMS,
  HOME,
  PAGES,
  TAB_INDEX,
  TAB_SOURCES,
} from "@aqdata/constants";
import type { DustAppSearchParams } from "@aqdata/types";

export type SessionState = "disconnected" | "disclaimer_accepted" | "on_page";
export type PageContext =
  | "home"
  | "applications"
  | "dust_application_search"
  | "compliance"
  | "inspection_search"
  | "compliance_report_search"
  | "enforcement_search"
  | "settlement_search"
  | "site_visit_search";

const STATE_TOKEN_REGEX =
  /name="oracle\.adf\.faces\.STATE_TOKEN"\s+value="(\d+)"/;
const FORM_NAME_REGEX = /name="(oracle\.adf\.faces\.FORM)"\s+value="([^"]+)"/;
const FORM_ACTION_REGEX = /<form[^>]+name="([^"]+)"[^>]+action="([^"]+)"/;

// Regex to find tab links: source:'PREFIX:N:SUFFIX' with tab text nearby
const TAB_LINK_REGEX =
  /source:'([^']+)'\}[^>]*>.*?<img[^>]+alt="([^"]+)"/gs;

export class AQDataClient {
  debug = !!process.env.AQ_DEBUG;

  private state: SessionState = "disconnected";
  private pageContext: PageContext = "home";
  private cookies: Map<string, string> = new Map();
  private stateToken = 1;
  private currentFormName = "";
  private currentFormAction = "";
  private lastResponseHtml = "";

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
  // Session lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.state !== "disconnected") return;

    // Step 1: GET disclaimer page → extract JSESSIONID
    const disclaimerUrl = `${BASE_URL}${PAGES.disclaimer}`;
    const getRes = await fetch(disclaimerUrl, { redirect: "manual" });
    this.updateCookies(getRes);
    const disclaimerHtml = await getRes.text();
    this.extractFormInfo(disclaimerHtml);
    this.stateToken = this.extractStateToken(disclaimerHtml);

    // Step 2: POST disclaimer acceptance
    const postUrl = this.buildPostUrl(PAGES.disclaimer);
    const body = this.buildFormData({
      [DISCLAIMER.formField]: DISCLAIMER.formName,
      [DISCLAIMER.stateTokenField]: String(this.stateToken),
      source: DISCLAIMER.agreeBtn,
      event: "",
    });

    const postRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      body,
      redirect: "manual",
    });
    this.updateCookies(postRes);
    this.stateToken++;

    // Step 3: Follow redirect to home page
    const homeUrl = `${BASE_URL}${PAGES.home}`;
    const homeRes = await fetch(homeUrl, {
      headers: { Cookie: this.getCookieHeader() },
      redirect: "manual",
    });
    this.updateCookies(homeRes);
    const homeHtml = await homeRes.text();
    this.lastResponseHtml = homeHtml;
    this.extractFormInfo(homeHtml);
    this.stateToken = this.extractStateToken(homeHtml);
    this.currentFormName = HOME.formName;
    this.pageContext = "home";
    this.state = "disclaimer_accepted";
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigateToTab(tabName: string): Promise<string> {
    if (this.state === "disconnected") {
      throw new Error("Not connected. Call connect() first.");
    }

    // Dynamically find the tab source ID from the current page HTML
    const sourceId = this.findTabSourceId(tabName);
    if (!sourceId) {
      // Fallback to computed source ID
      const tabIndex = TAB_INDEX[tabName];
      if (tabIndex === undefined) {
        throw new Error(`Unknown tab: ${tabName}. Not found in HTML or TAB_INDEX.`);
      }
      const computed = this.getTabSourceId(tabIndex);
      const html = await this.postCurrentForm({ source: computed });
      this.updatePageContext(tabName);
      return html;
    }

    const html = await this.postCurrentForm({ source: sourceId });
    this.updatePageContext(tabName);
    return html;
  }

  private updatePageContext(tabName: string): void {
    if (tabName === "applications") {
      this.pageContext = "applications";
    } else if (tabName === "compliance") {
      this.pageContext = "compliance";
    } else if (tabName === "home") {
      this.pageContext = "home";
    }
    this.state = "on_page";
  }

  async navigateToSubTab(
    subTabSource: string,
    newContext: PageContext,
  ): Promise<string> {
    if (this.state === "disconnected") {
      throw new Error("Not connected. Call connect() first.");
    }

    const html = await this.postCurrentForm({ source: subTabSource });
    this.pageContext = newContext;
    this.state = "on_page";
    return html;
  }

  async navigateToDustApplicationSearch(): Promise<string> {
    if (
      this.pageContext !== "applications" &&
      this.pageContext !== "dust_application_search"
    ) {
      await this.navigateToTab("applications");
    }
    return this.navigateToSubTab(
      APPLICATIONS_SUBTABS.dustApplicationSearch,
      "dust_application_search",
    );
  }

  async navigateToInspectionSearch(): Promise<string> {
    // Always navigate to compliance tab first (ensures correct page context)
    if (!this.isOnCompliancePage()) {
      await this.navigateToTab("compliance");
    }
    // Compliance tab lands on inspection search by default
    if (this.pageContext === "compliance") {
      // Check if we're already on the inspection search page
      if (this.lastResponseHtml.includes("inspectionSearch_SubmitBtn")) {
        this.pageContext = "inspection_search";
        return this.lastResponseHtml;
      }
    }
    const source =
      this.findSubTabSourceId("Inspection Search") ??
      COMPLIANCE_SUBTABS.inspectionSearch;
    return this.navigateToSubTab(source, "inspection_search");
  }

  async navigateToComplianceReportSearch(): Promise<string> {
    if (!this.isOnCompliancePage()) {
      await this.navigateToTab("compliance");
    }
    const source =
      this.findSubTabSourceId("Compliance Report Search") ??
      COMPLIANCE_SUBTABS.complianceReportSearch;
    return this.navigateToSubTab(source, "compliance_report_search");
  }

  async navigateToEnforcementSearch(): Promise<string> {
    if (!this.isOnCompliancePage()) {
      await this.navigateToTab("compliance");
    }
    const source =
      this.findSubTabSourceId("Enforcement Action Search") ??
      COMPLIANCE_SUBTABS.enforcementSearch;
    return this.navigateToSubTab(source, "enforcement_search");
  }

  async navigateToSettlementSearch(): Promise<string> {
    if (!this.isOnCompliancePage()) {
      await this.navigateToTab("compliance");
    }
    const source =
      this.findSubTabSourceId("Settlement Search") ??
      COMPLIANCE_SUBTABS.settlementSearch;
    return this.navigateToSubTab(source, "settlement_search");
  }

  async navigateToSiteVisitSearch(): Promise<string> {
    if (!this.isOnCompliancePage()) {
      await this.navigateToTab("compliance");
    }
    const source =
      this.findSubTabSourceId("Site Visit Search") ??
      COMPLIANCE_SUBTABS.siteVisitSearch;
    return this.navigateToSubTab(source, "site_visit_search");
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async searchDustApplications(
    params: DustAppSearchParams = {},
  ): Promise<string> {
    const fields: Record<string, string> = {
      source: FORMS.dustApplications.submitBtn,
    };

    // Select all statuses by default if none specified
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

    if (params.applicationId)
      fields[FORMS.dustApplications.fields.applicationId] =
        params.applicationId;
    if (params.facilityId)
      fields[FORMS.dustApplications.fields.facilityId] = params.facilityId;
    if (params.facilityName)
      fields[FORMS.dustApplications.fields.facilityName] = params.facilityName;
    if (params.projectName)
      fields[FORMS.dustApplications.fields.projectName] = params.projectName;
    if (params.companyName)
      fields[FORMS.dustApplications.fields.companyName] = params.companyName;
    if (params.address)
      fields[FORMS.dustApplications.fields.address] = params.address;
    if (params.city) fields[FORMS.dustApplications.fields.city] = params.city;
    if (params.parcel)
      fields[FORMS.dustApplications.fields.parcel] = params.parcel;

    return this.postCurrentForm(fields);
  }

  async searchInspections(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.inspections.submitBtn,
    });
  }

  async searchEnforcementActions(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.enforcementActions.submitBtn,
    });
  }

  async searchSettlements(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.settlements.submitBtn,
    });
  }

  async searchSiteVisits(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.siteVisits.submitBtn,
    });
  }

  async searchComplianceReports(): Promise<string> {
    return this.postCurrentForm({
      source: FORMS.complianceReports.submitBtn,
    });
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  async exportCurrentResults(exportBtnSource: string): Promise<Buffer> {
    const postUrl = this.buildPostUrl(this.currentFormAction);
    const body = this.buildFormData({
      [DISCLAIMER.formField]: this.currentFormName,
      [DISCLAIMER.stateTokenField]: String(this.stateToken),
      source: exportBtnSource,
      event: "",
    });

    const res = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      body,
      redirect: "manual",
    });
    this.updateCookies(res);
    this.stateToken++;

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async postCurrentForm(
    extraFields: Record<string, string>,
  ): Promise<string> {
    const postUrl = this.buildPostUrl(
      this.currentFormAction || PAGES.home,
    );
    const body = this.buildFormData({
      [DISCLAIMER.formField]: this.currentFormName || HOME.formName,
      [DISCLAIMER.stateTokenField]: String(this.stateToken),
      event: "",
      ...extraFields,
    });

    if (this.debug) {
      console.log(`  [client] POST ${postUrl}`);
      console.log(`  [client] form=${this.currentFormName} token=${this.stateToken} source=${extraFields.source ?? "none"}`);
    }

    const res = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      body,
      redirect: "manual",
    });
    this.updateCookies(res);

    if (this.debug) {
      console.log(`  [client] Response: ${res.status}`);
    }

    // Handle redirects (302 to new page)
    if (res.status === 302) {
      const location = res.headers.get("location");
      if (this.debug) {
        console.log(`  [client] Redirect to: ${location}`);
      }
      if (location) {
        const redirectUrl = location.startsWith("http")
          ? location
          : `${BASE_URL}${location}`;
        const followRes = await fetch(redirectUrl, {
          headers: { Cookie: this.getCookieHeader() },
          redirect: "manual",
        });
        this.updateCookies(followRes);
        const html = await followRes.text();
        this.lastResponseHtml = html;
        this.extractFormInfo(html);
        this.stateToken = this.extractStateToken(html);
        return html;
      }
    }

    const html = await res.text();
    this.lastResponseHtml = html;
    this.extractFormInfo(html);
    this.stateToken = this.extractStateToken(html);
    return html;
  }

  private buildPostUrl(path: string): string {
    const sessionId = this.cookies.get("JSESSIONID");
    // If path already has jsessionid, use it as-is
    if (path.includes("jsessionid")) {
      return path.startsWith("http") ? path : `${BASE_URL}${path}`;
    }
    const suffix = sessionId ? `;jsessionid=${sessionId}` : "";
    const cleanPath = path.split(";")[0]; // Remove any existing jsessionid
    return `${BASE_URL}${cleanPath}${suffix}`;
  }

  private buildFormData(fields: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      params.append(key, value);
    }
    return params;
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private updateCookies(response: Response): void {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const parts = cookie.split(";")[0];
      if (!parts) continue;
      const eqIdx = parts.indexOf("=");
      if (eqIdx === -1) continue;
      const name = parts.slice(0, eqIdx).trim();
      const value = parts.slice(eqIdx + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  private extractStateToken(html: string): number {
    const match = STATE_TOKEN_REGEX.exec(html);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
    // Fallback: just increment
    return this.stateToken + 1;
  }

  private extractFormInfo(html: string): void {
    // Extract form name from oracle.adf.faces.FORM hidden field
    const formNameMatch = FORM_NAME_REGEX.exec(html);
    if (formNameMatch?.[2]) {
      this.currentFormName = formNameMatch[2];
    }

    // Extract form action URL
    const actionMatch = FORM_ACTION_REGEX.exec(html);
    if (actionMatch?.[2]) {
      this.currentFormAction = actionMatch[2];
    }
  }

  private getTabSourceId(tabIndex: number): string {
    let ctx: keyof typeof TAB_SOURCES;
    if (
      this.pageContext === "applications" ||
      this.pageContext === "dust_application_search"
    ) {
      ctx = "applications";
    } else if (this.isOnCompliancePage()) {
      ctx = "compliance";
    } else {
      ctx = "home";
    }
    const { prefix, suffix } = TAB_SOURCES[ctx];
    return `${prefix}:${tabIndex}:${suffix}`;
  }

  /**
   * Dynamically discover tab source IDs from the current HTML.
   * Alt text format: "TabName: Select to go to this tab" or "TabName: Currently selected tab"
   */
  private findTabSourceId(tabName: string): string | null {
    const html = this.lastResponseHtml;
    if (!html) return null;

    const altTextMap: Record<string, string> = {
      home: "Home",
      facilities: "Facilities",
      companies: "Companies",
      complaints: "Complaints",
      correspondence: "Correspondence",
      applications: "Applications",
      compliance: "Compliance",
      permits: "Permits",
      emissions: "Emissions Inventories",
      invoices: "Invoices",
      reports: "Reports",
      monitors: "AQD Monitors",
    };

    const targetAlt = altTextMap[tabName];
    if (!targetAlt) return null;

    TAB_LINK_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAB_LINK_REGEX.exec(html)) !== null) {
      const sourceId = match[1];
      const altText = match[2];
      if (!altText || !sourceId) continue;
      // Match "Compliance: Select to go..." or exact "Compliance"
      if (
        altText.startsWith(`${targetAlt}:`) ||
        altText.trim() === targetAlt
      ) {
        return sourceId;
      }
    }

    return null;
  }

  /**
   * Find a sub-tab source ID by searching for its alt/title text in the HTML.
   */
  findSubTabSourceId(subTabName: string): string | null {
    const html = this.lastResponseHtml;
    if (!html) return null;

    TAB_LINK_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAB_LINK_REGEX.exec(html)) !== null) {
      const sourceId = match[1];
      const altText = match[2];
      if (!altText || !sourceId) continue;
      if (altText.toLowerCase().includes(subTabName.toLowerCase())) {
        return sourceId;
      }
    }

    return null;
  }

  private isOnCompliancePage(): boolean {
    return (
      this.pageContext === "compliance" ||
      this.pageContext === "inspection_search" ||
      this.pageContext === "compliance_report_search" ||
      this.pageContext === "enforcement_search" ||
      this.pageContext === "settlement_search" ||
      this.pageContext === "site_visit_search"
    );
  }
}
