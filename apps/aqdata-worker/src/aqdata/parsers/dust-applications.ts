import { read, utils } from "xlsx";
import type { DustApplication } from "../types";

const DUST_APPLICATION_ID_REGEX = /^D\d+$/i;
const HTML_TABLE_REGEX = /<table\b/i;
const HTML_ROW_REGEX = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const HTML_CELL_REGEX = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const WHITESPACE_REGEX = /\s+/g;

// Column indices — refined from actual export structure.
// The AQ Data portal "Export to Excel" produces HTML-table-as-XLS.
// These indices will be validated/updated by spike test 6.
const COL = {
  APPLICATION_ID: 0,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  PROJECT_NAME: 3,
  COMPANY_ID: 4,
  COMPANY_NAME: 5,
  STATUS: 6,
  SUBMITTED_DATE: 7,
  EFFECTIVE_DATE: 8,
  EXPIRATION_DATE: 9,
  CLOSED_DATE: 10,
  PREVIOUS_APP_ID: 11,
  PROJECT_START_DATE: 12,
  PROJECT_COMPLETION_DATE: 13,
  ADDRESS: 14,
  CITY: 15,
  PARCEL: 16,
  BLOCK_PERMIT: 17,
  ACCELERATED: 18,
  // Invoice columns may be in a nested sub-table or separate columns
  INVOICE_NUMBER: 19,
  INVOICE_CHARGES: 20,
  INVOICE_BALANCE: 21,
} as const;

export function parseDustApplicationExport(data: Buffer): DustApplication[] {
  const asText = data.toString("utf8");
  const workbook = read(data, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("No sheets found in workbook");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Sheet not found");
  }

  const rows = utils.sheet_to_json<(string | number | null)[]>(sheet, {
    defval: null,
    header: 1,
    raw: false,
  });

  // Log header row for discovery
  if (rows[0]) {
    console.log("  [parser] Header row:", rows[0]);
    console.log(`  [parser] Total rows (incl header): ${rows.length}`);
  }

  const results = parseRowArray(rows);
  if (results.length > 100 || !HTML_TABLE_REGEX.test(asText)) {
    return results;
  }

  // Large AQ exports are HTML-table-as-XLS; xlsx can under-parse these.
  const htmlResults = parseHtmlTableExport(asText);
  if (htmlResults.length > results.length) {
    console.log(
      `  [parser] HTML fallback used: ${results.length} -> ${htmlResults.length}`
    );
    return htmlResults;
  }

  return results;
}

function parseRowArray(
  rows: Array<Array<string | number | null>>
): DustApplication[] {
  const results: DustApplication[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) {
      continue;
    }

    const appId = str(row[COL.APPLICATION_ID]);
    if (!isDustApplicationId(appId)) {
      continue;
    }

    results.push({
      address: nullStr(row[COL.ADDRESS]),
      applicationId: appId,
      city: nullStr(row[COL.CITY]),
      closedDate: formatDate(row[COL.CLOSED_DATE]),
      companyId: nullStr(row[COL.COMPANY_ID]),
      companyName: nullStr(row[COL.COMPANY_NAME]),
      effectiveDate: formatDate(row[COL.EFFECTIVE_DATE]),
      expirationDate: formatDate(row[COL.EXPIRATION_DATE]),
      facilityId: nullStr(row[COL.FACILITY_ID]),
      facilityName: nullStr(row[COL.FACILITY_NAME]),
      invoiceBalance: parseNumber(row[COL.INVOICE_BALANCE]),
      invoiceCharges: parseNumber(row[COL.INVOICE_CHARGES]),
      invoiceNumber: nullStr(row[COL.INVOICE_NUMBER]),
      isAccelerated: toBool(row[COL.ACCELERATED]),
      isBlockPermit: toBool(row[COL.BLOCK_PERMIT]),
      parcel: nullStr(row[COL.PARCEL]),
      previousAppId: nullStr(row[COL.PREVIOUS_APP_ID]),
      projectCompletionDate: formatDate(row[COL.PROJECT_COMPLETION_DATE]),
      projectName: nullStr(row[COL.PROJECT_NAME]),
      projectStartDate: formatDate(row[COL.PROJECT_START_DATE]),
      status: nullStr(row[COL.STATUS]),
      submittedDate: formatDate(row[COL.SUBMITTED_DATE]),
    });
  }
  return results;
}

function parseHtmlTableExport(html: string): DustApplication[] {
  const rows: string[][] = [];
  for (const rowMatch of html.matchAll(HTML_ROW_REGEX)) {
    const row = rowMatch[1] ?? "";
    const cells: string[] = [];
    for (const cellMatch of row.matchAll(HTML_CELL_REGEX)) {
      const cell = cleanHtmlCell(cellMatch[1] ?? "");
      cells.push(cell);
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  const parsed: DustApplication[] = [];
  for (const row of rows) {
    const appId = row[COL.APPLICATION_ID] ?? "";
    if (!isDustApplicationId(appId)) {
      continue;
    }

    parsed.push({
      address: nullStr(row[COL.ADDRESS]),
      applicationId: appId,
      city: nullStr(row[COL.CITY]),
      closedDate: formatDate(row[COL.CLOSED_DATE]),
      companyId: nullStr(row[COL.COMPANY_ID]),
      companyName: nullStr(row[COL.COMPANY_NAME]),
      effectiveDate: formatDate(row[COL.EFFECTIVE_DATE]),
      expirationDate: formatDate(row[COL.EXPIRATION_DATE]),
      facilityId: nullStr(row[COL.FACILITY_ID]),
      facilityName: nullStr(row[COL.FACILITY_NAME]),
      invoiceBalance: parseNumber(row[COL.INVOICE_BALANCE]),
      invoiceCharges: parseNumber(row[COL.INVOICE_CHARGES]),
      invoiceNumber: nullStr(row[COL.INVOICE_NUMBER]),
      isAccelerated: toBool(row[COL.ACCELERATED]),
      isBlockPermit: toBool(row[COL.BLOCK_PERMIT]),
      parcel: nullStr(row[COL.PARCEL]),
      previousAppId: nullStr(row[COL.PREVIOUS_APP_ID]),
      projectCompletionDate: formatDate(row[COL.PROJECT_COMPLETION_DATE]),
      projectName: nullStr(row[COL.PROJECT_NAME]),
      projectStartDate: formatDate(row[COL.PROJECT_START_DATE]),
      status: nullStr(row[COL.STATUS]),
      submittedDate: formatDate(row[COL.SUBMITTED_DATE]),
    });
  }

  return parsed;
}

function cleanHtmlCell(value: string): string {
  return value
    .replace(HTML_TAG_REGEX, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(WHITESPACE_REGEX, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Helpers (same pattern as permit-parser.ts)
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function nullStr(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value).trim();
  return s === "" ||
    s === "&nbsp;" ||
    s === "Invoice Number" ||
    s === "Invoice Charges" ||
    s === "Invoice Balance"
    ? null
    : s;
}

function toBool(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const s = String(value).trim().toLowerCase();
  return s === "yes" || s === "true" || s === "y" || s === "1";
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value)
    .replaceAll(/[$,\s]/g, "")
    .trim();
  if (s === "" || s === "InvoiceCharges" || s === "InvoiceBalance") {
    return null;
  }
  const num = Number.parseFloat(s);
  return Number.isNaN(num) ? null : num;
}

function formatDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value).trim();
  if (s === "" || s === "&nbsp;" || s === "NaT") {
    return null;
  }

  // Handle Excel serial date numbers
  const maybeSerial = Number.parseFloat(s);
  if (
    !Number.isNaN(maybeSerial) &&
    maybeSerial > 30_000 &&
    maybeSerial < 60_000
  ) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + maybeSerial * 86_400_000);
    return date.toISOString().split("T")[0] ?? null;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString().split("T")[0] ?? null;
}

function isDustApplicationId(value: string): boolean {
  return DUST_APPLICATION_ID_REGEX.test(value);
}
