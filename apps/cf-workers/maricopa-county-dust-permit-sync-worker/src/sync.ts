const AQDATA_BASE_URL = "https://aqdata.maricopa.gov";
const DISCLAIMER_PATH = "/disclaimer.jsf";
const DUST_APPLICATION_SEARCH_PATH = "/applications/dustApplicationSearch.jsf";

const FORM_FIELD = "oracle.adf.faces.FORM";
const STATE_TOKEN_FIELD = "oracle.adf.faces.STATE_TOKEN";

const DISCLAIMER_FORM_NAME = "_idJsp0";
const DISCLAIMER_AGREE_BUTTON = "_idJsp1:agreeBtn";

const DUST_APPLICATION_STATUS_FIELD = "_idJsp6:dcpStateCds";
const DUST_APPLICATION_SUBMIT_BUTTON = "_idJsp6:dustAppSearch_SubmitBtn";
const DUST_APPLICATION_EXPORT_BUTTON = "_idJsp6:dcpSearchTable:_idJsp72";
const DUST_APPLICATION_STATUS_VALUES = ["0", "1", "2", "3", "4"] as const;

const STATE_TOKEN_REGEX =
  /name="oracle\.adf\.faces\.STATE_TOKEN"\s+value="([^"]+)"/i;
const FORM_NAME_REGEX = /name="oracle\.adf\.faces\.FORM"\s+value="([^"]+)"/i;
const FORM_ACTION_REGEX = /<form[^>]+action="([^"]+)"[^>]*>/i;

const PERMIT_SPLIT_REGEX = /<tr><td>D(?=\d)/i;
const CELL_REGEX = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const INVOICE_ROW_REGEX =
  /<tr>\s*<td>(IV[^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/i;

const HTML_TAG_REGEX = /<[^>]+>/g;
const MIN_MAIN_CELLS = 17;

const UPSERT_BATCH_SIZE = 100;

const COL = {
  ACCELERATED: 18,
  ADDRESS: 14,
  APPLICATION_ID: 0,
  BLOCK_PERMIT: 17,
  CITY: 15,
  CLOSED_DATE: 10,
  COMPANY_ID: 4,
  COMPANY_NAME: 5,
  EFFECTIVE_DATE: 8,
  EXPIRATION_DATE: 9,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  PARCEL: 16,
  PREVIOUS_APP_ID: 11,
  PROJECT_COMPLETION_DATE: 13,
  PROJECT_NAME: 3,
  PROJECT_START_DATE: 12,
  STATUS: 6,
  SUBMITTED_DATE: 7,
} as const;

interface AQDataSession {
  cookies: Map<string, string>;
  currentFormAction: string;
  currentFormName: string;
  stateToken: string;
}

interface DustApplicationExportRecord {
  address: string | null;
  applicationId: string;
  city: string | null;
  closedDate: string | null;
  companyId: string | null;
  companyName: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  facilityId: string | null;
  facilityName: string | null;
  invoiceBalance: number | null;
  invoiceCharges: number | null;
  invoiceNumber: string | null;
  isAccelerated: boolean;
  isBlockPermit: boolean;
  parcel: string | null;
  previousAppId: string | null;
  projectCompletionDate: string | null;
  projectName: string | null;
  projectStartDate: string | null;
  status: string | null;
  submittedDate: string | null;
}

export interface MaricopaCountyDustPermitSyncResult {
  stats: {
    durationMs: number;
    finishedAt: string;
    startedAt: string;
    totalRecords: number;
    upsertedRecords: number;
  };
  success: true;
}

const normalizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text === "" ? null : text;
};

const normalizeBoolean = (value: unknown): boolean => {
  const text = normalizeText(value)?.toLowerCase();
  return text === "yes" || text === "true" || text === "y" || text === "1";
};

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const stripped = String(value).replaceAll(/[$,\s]/g, "");
  if (stripped === "") {
    return null;
  }

  const num = Number.parseFloat(stripped);
  return Number.isNaN(num) ? null : num;
};

const normalizeDate = (value: unknown): string | null => {
  const text = normalizeText(value);
  if (!text || text === "NaT") {
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
};

const extractStateToken = (html: string, fallback: string): string => {
  const stateTokenMatch = html.match(STATE_TOKEN_REGEX);
  if (!stateTokenMatch) {
    return fallback;
  }

  const [, stateToken] = stateTokenMatch;
  return stateToken ?? fallback;
};

const buildHeaders = (session: AQDataSession, form?: boolean): HeadersInit => {
  const headers: Record<string, string> = {};
  const cookie = [...session.cookies.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  return headers;
};

const updateCookies = (session: AQDataSession, response: Response): void => {
  for (const setCookie of response.headers.getSetCookie()) {
    const [pair] = setCookie.split(";");
    if (!pair) {
      continue;
    }

    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (name) {
      session.cookies.set(name, value);
    }
  }
};

const buildSessionUrl = (session: AQDataSession, path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const sessionId = session.cookies.get("JSESSIONID");
  if (path.includes("jsessionid") || !sessionId) {
    return `${AQDATA_BASE_URL}${path}`;
  }

  const [cleanPath = path] = path.split(";");
  return `${AQDATA_BASE_URL}${cleanPath};jsessionid=${sessionId}`;
};

const applyPageState = (session: AQDataSession, html: string): void => {
  const formNameMatch = html.match(FORM_NAME_REGEX);
  if (!formNameMatch) {
    throw new Error("AQData response did not include a form name.");
  }

  const [, formName] = formNameMatch;
  if (!formName) {
    throw new Error("AQData response did not include a form name.");
  }

  const formActionMatch = html.match(FORM_ACTION_REGEX);
  if (!formActionMatch) {
    throw new Error("AQData response did not include a form action.");
  }

  const [, formAction] = formActionMatch;
  if (!formAction) {
    throw new Error("AQData response did not include a form action.");
  }

  session.currentFormName = formName;
  session.currentFormAction = formAction;
  session.stateToken = extractStateToken(html, session.stateToken);
};

const requestHtml = async (
  session: AQDataSession,
  path: string,
  formData?: URLSearchParams
): Promise<string> => {
  const response = await fetch(buildSessionUrl(session, path), {
    ...(formData ? { body: formData, method: "POST" } : {}),
    headers: buildHeaders(session, Boolean(formData)),
    redirect: "manual",
  });

  updateCookies(session, response);

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("AQData redirect response did not include a location.");
    }

    return requestHtml(session, location);
  }

  if (!response.ok) {
    throw new Error(`AQData request failed with status ${response.status}.`);
  }

  const html = await response.text();
  applyPageState(session, html);
  return html;
};

const acceptDisclaimer = async (session: AQDataSession): Promise<void> => {
  const disclaimerResponse = await fetch(
    `${AQDATA_BASE_URL}${DISCLAIMER_PATH}`,
    {
      redirect: "manual",
    }
  );
  updateCookies(session, disclaimerResponse);

  const disclaimerHtml = await disclaimerResponse.text();
  session.stateToken = extractStateToken(disclaimerHtml, session.stateToken);

  const formData = new URLSearchParams();
  formData.set(FORM_FIELD, DISCLAIMER_FORM_NAME);
  formData.set(STATE_TOKEN_FIELD, session.stateToken);
  formData.set("event", "");
  formData.set("source", DISCLAIMER_AGREE_BUTTON);

  const acceptResponse = await fetch(
    buildSessionUrl(session, DISCLAIMER_PATH),
    {
      body: formData,
      headers: buildHeaders(session, true),
      method: "POST",
      redirect: "manual",
    }
  );
  updateCookies(session, acceptResponse);

  if (!acceptResponse.ok && acceptResponse.status !== 302) {
    throw new Error(
      `AQData disclaimer request failed with status ${acceptResponse.status}.`
    );
  }
};

const searchAllDustApplications = async (
  session: AQDataSession
): Promise<void> => {
  const formData = new URLSearchParams();
  formData.set(FORM_FIELD, session.currentFormName);
  formData.set(STATE_TOKEN_FIELD, session.stateToken);
  formData.set("event", "");
  formData.set("source", DUST_APPLICATION_SUBMIT_BUTTON);

  for (const status of DUST_APPLICATION_STATUS_VALUES) {
    formData.append(DUST_APPLICATION_STATUS_FIELD, status);
  }

  await requestHtml(session, session.currentFormAction, formData);
};

const exportDustApplications = async (
  session: AQDataSession
): Promise<Uint8Array> => {
  const formData = new URLSearchParams();
  formData.set(FORM_FIELD, session.currentFormName);
  formData.set(STATE_TOKEN_FIELD, session.stateToken);
  formData.set("event", "");
  formData.set("source", DUST_APPLICATION_EXPORT_BUTTON);

  const response = await fetch(
    buildSessionUrl(session, session.currentFormAction),
    {
      body: formData,
      headers: buildHeaders(session, true),
      method: "POST",
      redirect: "manual",
    }
  );
  updateCookies(session, response);

  if (!response.ok) {
    throw new Error(
      `AQData export request failed with status ${response.status}.`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
};

const parseDustApplicationExport = (
  exportBytes: Uint8Array
): DustApplicationExportRecord[] => {
  const exportText = new TextDecoder().decode(exportBytes);
  const chunks = exportText.split(PERMIT_SPLIT_REGEX);
  const records: DustApplicationExportRecord[] = [];

  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }

    const permitChunk = `<tr><td>D${chunk}`;
    const nestedTableStart = permitChunk.indexOf("<table");
    const mainRowContent =
      nestedTableStart === -1
        ? permitChunk
        : permitChunk.slice(0, nestedTableStart);

    const cells: string[] = [];
    for (const cellHtml of mainRowContent.match(CELL_REGEX) ?? []) {
      cells.push(
        cellHtml
          .replace(HTML_TAG_REGEX, "")
          .replaceAll("&nbsp;", " ")
          .replaceAll("&amp;", "&")
          .replaceAll("&quot;", '"')
          .replaceAll("&#39;", "'")
          .trim()
      );
    }

    if (cells.length < MIN_MAIN_CELLS) {
      continue;
    }

    const applicationId = cells[COL.APPLICATION_ID] ?? "";
    if (!/^D\d+$/i.test(applicationId)) {
      continue;
    }

    const record: DustApplicationExportRecord = {
      address: normalizeText(cells[COL.ADDRESS]),
      applicationId,
      city: normalizeText(cells[COL.CITY]),
      closedDate: normalizeDate(cells[COL.CLOSED_DATE]),
      companyId: normalizeText(cells[COL.COMPANY_ID]),
      companyName: normalizeText(cells[COL.COMPANY_NAME]),
      effectiveDate: normalizeDate(cells[COL.EFFECTIVE_DATE]),
      expirationDate: normalizeDate(cells[COL.EXPIRATION_DATE]),
      facilityId: normalizeText(cells[COL.FACILITY_ID]),
      facilityName: normalizeText(cells[COL.FACILITY_NAME]),
      invoiceBalance: null,
      invoiceCharges: null,
      invoiceNumber: null,
      isAccelerated: normalizeBoolean(cells[COL.ACCELERATED]),
      isBlockPermit: normalizeBoolean(cells[COL.BLOCK_PERMIT]),
      parcel: normalizeText(cells[COL.PARCEL]),
      previousAppId: normalizeText(cells[COL.PREVIOUS_APP_ID]),
      projectCompletionDate: normalizeDate(cells[COL.PROJECT_COMPLETION_DATE]),
      projectName: normalizeText(cells[COL.PROJECT_NAME]),
      projectStartDate: normalizeDate(cells[COL.PROJECT_START_DATE]),
      status: normalizeText(cells[COL.STATUS]),
      submittedDate: normalizeDate(cells[COL.SUBMITTED_DATE]),
    };

    const invoiceMatch = permitChunk.match(INVOICE_ROW_REGEX);
    if (invoiceMatch) {
      const [, invoiceNumber, invoiceCharges, invoiceBalance] = invoiceMatch;
      record.invoiceNumber = normalizeText(invoiceNumber);
      record.invoiceCharges = normalizeNumber(invoiceCharges);
      record.invoiceBalance = normalizeNumber(invoiceBalance);
    }

    records.push(record);
  }

  return records;
};

const upsertMaricopaCountyDustPermits = async (
  db: D1Database,
  records: readonly DustApplicationExportRecord[]
): Promise<number> => {
  const sql = `
		INSERT INTO maricopa_county_dust_permits (
			id,
			facility_id,
			facility_name,
			project_name,
			county_company_id,
			company_name,
			status,
			submitted_date,
			effective_date,
			expiration_date,
			closed_date,
			previous_app_id,
			project_start_date,
			project_end_date,
			address,
			city,
			parcel,
			latitude,
			longitude,
			is_block_permit,
			is_accelerated,
			invoice_number,
			invoice_charges,
			invoice_balance,
			source_system,
			synced_at,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aqdata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			facility_id = excluded.facility_id,
			facility_name = excluded.facility_name,
			project_name = excluded.project_name,
			county_company_id = excluded.county_company_id,
			company_name = excluded.company_name,
			status = excluded.status,
			submitted_date = excluded.submitted_date,
			effective_date = excluded.effective_date,
			expiration_date = excluded.expiration_date,
			closed_date = excluded.closed_date,
			previous_app_id = excluded.previous_app_id,
			project_start_date = excluded.project_start_date,
			project_end_date = excluded.project_end_date,
			address = excluded.address,
			city = excluded.city,
			parcel = excluded.parcel,
			latitude = excluded.latitude,
			longitude = excluded.longitude,
			is_block_permit = excluded.is_block_permit,
			is_accelerated = excluded.is_accelerated,
			invoice_number = excluded.invoice_number,
			invoice_charges = excluded.invoice_charges,
			invoice_balance = excluded.invoice_balance,
			source_system = 'aqdata',
			synced_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
	`;

  for (let offset = 0; offset < records.length; offset += UPSERT_BATCH_SIZE) {
    const chunk = records.slice(offset, offset + UPSERT_BATCH_SIZE);
    await db.batch(
      chunk.map((record) =>
        db
          .prepare(sql)
          .bind(
            record.applicationId,
            record.facilityId,
            record.facilityName,
            record.projectName,
            record.companyId,
            record.companyName,
            record.status,
            record.submittedDate,
            record.effectiveDate,
            record.expirationDate,
            record.closedDate,
            record.previousAppId,
            record.projectStartDate,
            record.projectCompletionDate,
            record.address,
            record.city,
            record.parcel,
            null,
            null,
            record.isBlockPermit ? 1 : 0,
            record.isAccelerated ? 1 : 0,
            record.invoiceNumber,
            record.invoiceCharges,
            record.invoiceBalance
          )
      )
    );
  }

  return records.length;
};

const PERMIT_ID_FIELD = "_idJsp6:dcpNumber";
const FILESTORE_PDF_REGEX = /href="([^"]*\/filestore\/[^"]*\.pdf[^"]*)"/i;

export const getPermitPdfUrl = async (
  permitId: string
): Promise<string | null> => {
  const session: AQDataSession = {
    cookies: new Map(),
    currentFormAction: "",
    currentFormName: "",
    stateToken: "1",
  };

  await acceptDisclaimer(session);
  await requestHtml(session, DUST_APPLICATION_SEARCH_PATH);
  const searchForm = new URLSearchParams();
  searchForm.set(FORM_FIELD, session.currentFormName);
  searchForm.set(STATE_TOKEN_FIELD, session.stateToken);
  searchForm.set("event", "");
  searchForm.set("source", DUST_APPLICATION_SUBMIT_BUTTON);
  searchForm.set(PERMIT_ID_FIELD, permitId);
  for (const status of DUST_APPLICATION_STATUS_VALUES) {
    searchForm.append(DUST_APPLICATION_STATUS_FIELD, status);
  }

  const searchHtml = await requestHtml(
    session,
    session.currentFormAction,
    searchForm
  );

  const escaped = permitId.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sourceMatch = searchHtml.match(
    new RegExp(`source:'([^']+)'[^>]*>\\s*${escaped}\\s*</a>`, "i")
  );
  if (!sourceMatch?.[1]) {
    return null;
  }

  const detailForm = new URLSearchParams();
  detailForm.set(FORM_FIELD, session.currentFormName);
  detailForm.set(STATE_TOKEN_FIELD, session.stateToken);
  detailForm.set("event", "");
  detailForm.set("source", sourceMatch[1]);

  const detailHtml = await requestHtml(
    session,
    session.currentFormAction,
    detailForm
  );

  const pdfMatch = detailHtml.match(FILESTORE_PDF_REGEX);
  if (!pdfMatch?.[1]) {
    return null;
  }

  const href = pdfMatch[1].replaceAll("&amp;", "&");
  return href.startsWith("http") ? href : `${AQDATA_BASE_URL}${href}`;
};

export const runMaricopaCountyDustPermitSync = async (
  db: D1Database
): Promise<MaricopaCountyDustPermitSyncResult> => {
  const startedAt = new Date();
  const session: AQDataSession = {
    cookies: new Map(),
    currentFormAction: "",
    currentFormName: "",
    stateToken: "1",
  };

  await acceptDisclaimer(session);
  await requestHtml(session, DUST_APPLICATION_SEARCH_PATH);
  await searchAllDustApplications(session);

  const exportBytes = await exportDustApplications(session);
  const records = parseDustApplicationExport(exportBytes);

  if (records.length === 0) {
    throw new Error("AQData dust application export returned no records.");
  }

  const upsertedRecords = await upsertMaricopaCountyDustPermits(db, records);
  const finishedAt = new Date();

  return {
    stats: {
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      finishedAt: finishedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      totalRecords: records.length,
      upsertedRecords,
    },
    success: true,
  };
};
