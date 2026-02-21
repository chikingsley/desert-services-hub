import { read, utils } from "xlsx";
import type { DustApplication } from "../types";

const DUST_APPLICATION_ID_REGEX = /^D\d+$/i;
const HTML_TABLE_REGEX = /<table\b/i;

// Split-based regex: splits on <tr><td>D followed by a digit (permit ID start).
// This is the same approach as permit-parser.ts — much more memory efficient
// than matchAll() on the entire document because it processes one permit at a time.
const PERMIT_SPLIT_REGEX = /<tr><td>D(?=\d)/i;

// Cell extraction and cleaning (used per-chunk, not on entire document)
const CELL_REGEX = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const TD_OPEN_REGEX = /<td[^>]*>/gi;
const TD_CLOSE_REGEX = /<\/td>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;

// Invoice row in nested sub-table: <tr><td>IV...</td><td>charges</td><td>balance</td>
const INVOICE_ROW_REGEX =
  /<tr>\s*<td>(IV[^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/i;

// Column indices — match the AQ Data portal "Export to Excel" HTML-as-XLS format.
// Header: Dust Application ID | Facility ID | Facility Name | Project Name |
//         Company ID | Company Name | Status | Submitted Date | Effective Date |
//         Expiration Date | Closed Date | Previous Dust Application No. |
//         Project Start Date | Project Completion Date | Project Address |
//         Project City | Parcel No. | Block Permit? | Accelerated? | Invoice
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
  INVOICE_NUMBER: 19,
  INVOICE_CHARGES: 20,
  INVOICE_BALANCE: 21,
} as const;

// Minimum number of cells in the main permit row (before nested invoice table).
// The export has 19 main columns (index 0-18) plus the Invoice nested table cell.
const MIN_MAIN_CELLS = 17;

export function parseDustApplicationExport(data: Buffer): DustApplication[] {
  const asText = data.toString("utf8");

  // If it looks like HTML-as-XLS (which the AQ portal always produces),
  // go straight to the split-based HTML parser.
  if (HTML_TABLE_REGEX.test(asText)) {
    const results = parseHtmlExport(asText);
    if (results.length > 0) {
      console.log(
        `  [parser] Parsed ${results.length} permits from HTML export`
      );
      return results;
    }
  }

  // Fallback: try xlsx library for genuine binary XLSX files
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

  return parseRowArray(rows);
}

/**
 * Split-based HTML parser (adapted from permit-parser.ts).
 *
 * Instead of matchAll() on the entire document (which creates 755K+ match
 * objects for a full AQ export), this splits the HTML into one chunk per
 * permit on the `<tr><td>D\d` boundary. Each chunk is processed independently
 * so memory pressure stays low.
 */
export function parseHtmlExport(content: string): DustApplication[] {
  const permits: DustApplication[] = [];
  const chunks = content.split(PERMIT_SPLIT_REGEX);

  // First chunk is everything before the first permit row (header, etc.)
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    // Reconstruct the full permit chunk (split consumed the <tr><td>D prefix)
    const permitChunk = `<tr><td>D${chunk}`;

    // Extract main row cells — stop before any nested <table> (invoice table)
    const nestedTableStart = permitChunk.indexOf("<table");
    const mainRowContent =
      nestedTableStart > 0
        ? permitChunk.slice(0, nestedTableStart)
        : permitChunk;

    const cellMatches = mainRowContent.match(CELL_REGEX) ?? [];
    const cells: string[] = [];

    for (const cellHtml of cellMatches) {
      const cellContent = cellHtml
        .replace(TD_OPEN_REGEX, "")
        .replace(TD_CLOSE_REGEX, "")
        .replace(HTML_TAG_REGEX, "")
        .replaceAll("&nbsp;", " ")
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .trim();
      cells.push(cellContent);
    }

    if (cells.length < MIN_MAIN_CELLS) {
      continue;
    }

    const appId = cells[COL.APPLICATION_ID] ?? "";
    if (!isDustApplicationId(appId)) {
      continue;
    }

    const permit: DustApplication = {
      address: nullStr(cells[COL.ADDRESS]),
      applicationId: appId,
      city: nullStr(cells[COL.CITY]),
      closedDate: formatDate(cells[COL.CLOSED_DATE]),
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      effectiveDate: formatDate(cells[COL.EFFECTIVE_DATE]),
      expirationDate: formatDate(cells[COL.EXPIRATION_DATE]),
      facilityId: nullStr(cells[COL.FACILITY_ID]),
      facilityName: nullStr(cells[COL.FACILITY_NAME]),
      invoiceBalance: null,
      invoiceCharges: null,
      invoiceNumber: null,
      isAccelerated: toBool(cells[COL.ACCELERATED]),
      isBlockPermit: toBool(cells[COL.BLOCK_PERMIT]),
      parcel: nullStr(cells[COL.PARCEL]),
      previousAppId: nullStr(cells[COL.PREVIOUS_APP_ID]),
      projectCompletionDate: formatDate(cells[COL.PROJECT_COMPLETION_DATE]),
      projectName: nullStr(cells[COL.PROJECT_NAME]),
      projectStartDate: formatDate(cells[COL.PROJECT_START_DATE]),
      status: nullStr(cells[COL.STATUS]),
      submittedDate: formatDate(cells[COL.SUBMITTED_DATE]),
    };

    // Extract invoice from nested sub-table (if present)
    const invoiceMatch = permitChunk.match(INVOICE_ROW_REGEX);
    if (invoiceMatch) {
      permit.invoiceNumber = invoiceMatch[1]?.trim() ?? null;
      permit.invoiceCharges = parseNumber(invoiceMatch[2]);
      permit.invoiceBalance = parseNumber(invoiceMatch[3]);
    }

    permits.push(permit);
  }

  return permits;
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

// ---------------------------------------------------------------------------
// Helpers
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
