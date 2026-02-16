import { BASE_URL, DISCLAIMER, HOME, PAGES } from "@aqdata/constants";

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

/**
 * Low-level HTTP transport for Oracle ADF / JSF session management.
 * Handles cookies, form tokens, redirects, and POST mechanics.
 */
export class AQSessionTransport {
  debug = !!process.env.AQ_DEBUG;

  protected state: SessionState = "disconnected";
  protected pageContext: PageContext = "home";
  protected readonly cookies = new Map<string, string>();
  protected stateToken = 1;
  protected currentFormName = "";
  protected currentFormAction = "";
  protected lastResponseHtml = "";

  async connect(): Promise<void> {
    if (this.state !== "disconnected") {
      return;
    }

    const disclaimerUrl = `${BASE_URL}${PAGES.disclaimer}`;
    const getRes = await fetch(disclaimerUrl, { redirect: "manual" });
    this.updateCookies(getRes);
    const disclaimerHtml = await getRes.text();
    this.extractFormInfo(disclaimerHtml);
    this.stateToken = this.extractStateToken(disclaimerHtml);

    const postUrl = this.buildPostUrl(PAGES.disclaimer);
    const body = this.buildFormData({
      [DISCLAIMER.formField]: DISCLAIMER.formName,
      [DISCLAIMER.stateTokenField]: String(this.stateToken),
      source: DISCLAIMER.agreeBtn,
      event: "",
    });

    const postRes = await fetch(postUrl, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      method: "POST",
      redirect: "manual",
    });
    this.updateCookies(postRes);
    this.stateToken++;

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

  protected async followResponse(res: Response): Promise<string> {
    this.updateCookies(res);

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
        this.applyHtml(html);
        return html;
      }
    }

    const html = await res.text();
    this.applyHtml(html);
    return html;
  }

  protected async postCurrentForm(
    extraFields: Record<string, string>
  ): Promise<string> {
    const postUrl = this.buildPostUrl(this.currentFormAction || PAGES.home);
    const body = this.buildFormData({
      [DISCLAIMER.formField]: this.currentFormName || HOME.formName,
      [DISCLAIMER.stateTokenField]: String(this.stateToken),
      event: "",
      ...extraFields,
    });

    if (this.debug) {
      console.log(`  [client] POST ${postUrl}`);
      console.log(
        `  [client] form=${this.currentFormName} token=${this.stateToken} source=${extraFields.source ?? "none"}`
      );
    }

    const res = await fetch(postUrl, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      method: "POST",
      redirect: "manual",
    });

    if (this.debug) {
      console.log(`  [client] Response: ${res.status}`);
    }

    return this.followResponse(res);
  }

  protected async exportCurrentResults(
    exportBtnSource: string
  ): Promise<Buffer> {
    const postUrl = this.buildPostUrl(this.currentFormAction);
    const body = this.buildFormData({
      [DISCLAIMER.formField]: this.currentFormName,
      [DISCLAIMER.stateTokenField]: String(this.stateToken),
      source: exportBtnSource,
      event: "",
    });

    const res = await fetch(postUrl, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
      },
      method: "POST",
      redirect: "manual",
    });
    this.updateCookies(res);
    this.stateToken++;

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  protected getCookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private applyHtml(html: string): void {
    this.lastResponseHtml = html;
    this.extractFormInfo(html);
    this.stateToken = this.extractStateToken(html);
  }

  private buildPostUrl(path: string): string {
    const sessionId = this.cookies.get("JSESSIONID");
    if (path.includes("jsessionid")) {
      return path.startsWith("http") ? path : `${BASE_URL}${path}`;
    }
    const suffix = sessionId ? `;jsessionid=${sessionId}` : "";
    const cleanPath = path.split(";")[0];
    return `${BASE_URL}${cleanPath}${suffix}`;
  }

  private buildFormData(fields: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      params.append(key, value);
    }
    return params;
  }

  private updateCookies(response: Response): void {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const parts = cookie.split(";")[0];
      if (!parts) {
        continue;
      }
      const eqIdx = parts.indexOf("=");
      if (eqIdx === -1) {
        continue;
      }
      const name = parts.slice(0, eqIdx).trim();
      const value = parts.slice(eqIdx + 1).trim();
      if (name) {
        this.cookies.set(name, value);
      }
    }
  }

  private extractStateToken(html: string): number {
    const match = STATE_TOKEN_REGEX.exec(html);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
    return this.stateToken + 1;
  }

  private extractFormInfo(html: string): void {
    const formNameMatch = FORM_NAME_REGEX.exec(html);
    if (formNameMatch?.[2]) {
      this.currentFormName = formNameMatch[2];
    }

    const actionMatch = FORM_ACTION_REGEX.exec(html);
    if (actionMatch?.[2]) {
      this.currentFormAction = actionMatch[2];
    }
  }
}
