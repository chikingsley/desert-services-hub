/**
 * Maricopa Permit Parser
 *
 * Parses permit data from Maricopa County portal exports:
 * - Real Excel xlsx files (from sample data or manual exports)
 * - HTML-based exports (from portal "Export to Excel" button)
 *
 * @module src/db/sync/permit-parser
 */

import { readFile, utils } from "xlsx";

export interface PortalPermit {
  id: string;
  projectName: string | null;
  facilityId: string | null;
  companyId: string | null;
  companyName: string | null;
  status: string | null;
  submittedDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  closedDate: string | null;
  previousAppId: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  isBlockPermit: boolean;
  isAccelerated: boolean;
  invoiceNumber: string | null;
  invoiceCharges: number | null;
  invoiceBalance: number | null;
}

// Column indices for the xlsx/xls format
const COL = {
  ACCELERATED: 16,
  ADDRESS: 12,
  BLOCK_PERMIT: 15,
  CITY: 13,
  CLOSED_DATE: 8,
  COMPANY_ID: 2,
  COMPANY_NAME: 3,
  EFFECTIVE_DATE: 6,
  EXPIRATION_DATE: 7,
  ID: 0,
  INVOICE_BALANCE: 19,
  INVOICE_CHARGES: 18,
  INVOICE_NUMBER: 17,
  PARCEL: 14,
  PREVIOUS_APP_ID: 9,
  PROJECT_END_DATE: 11,
  PROJECT_NAME: 1,
  PROJECT_START_DATE: 10,
  STATUS: 4,
  SUBMITTED_DATE: 5,
} as const;

// Top-level regex patterns for performance
const TD_OPEN_REGEX = /<td[^>]*>/gi;
const TD_CLOSE_REGEX = /<\/td>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const CELL_REGEX = /<td[^>]*>([\s\S]*?)<\/td>/gi;
// Split pattern: <tr><td>D followed by digit (permit ID start)
const PERMIT_SPLIT_REGEX = /<tr><td>D(?=\d)/i;
// Invoice table: find data row with IV prefix (handles both with/without tbody)
const INVOICE_TABLE_REGEX =
  /<tr>\s*<td>(IV[^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/i;
const FACILITY_ID_REGEX = /^F\d{5,}$/i;

/**
 * Detects file format and parses accordingly.
 *
 * @param content - File content (string for HTML, or path for xlsx)
 * @param filePath - Optional file path for format detection
 * @returns Array of parsed permit objects
 */
export function parsePermitExport(
  content: string,
  filePath?: string
): PortalPermit[] {
  // Detect format: real xlsx starts with PK (ZIP header)
  const isRealXlsx =
    content.startsWith("PK") || filePath?.endsWith(".xlsx") === true;

  if (isRealXlsx) {
    return parseXlsxFile(filePath ?? content);
  }

  // Otherwise treat as HTML-based xls
  return parseHtmlExport(content);
}

/**
 * Parses a real Excel xlsx file using the xlsx library.
 */
export function parseXlsxFile(filePath: string): PortalPermit[] {
  const workbook = readFile(filePath);
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

  const permits: PortalPermit[] = [];
  let currentPermit: PortalPermit | null = null;

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) {
      continue;
    }

    const id = String(row[COL.ID] ?? "").trim();
    const invoiceCol = String(row[COL.INVOICE_NUMBER] ?? "").trim();

    // Check if this is a permit row (has ID starting with D)
    if (id.startsWith("D")) {
      // Save previous permit if exists
      if (currentPermit) {
        permits.push(currentPermit);
      }

      // Create new permit
      currentPermit = {
        address: nullIfEmpty(row[COL.ADDRESS]),
        city: nullIfEmpty(row[COL.CITY]),
        closedDate: formatDate(row[COL.CLOSED_DATE]),
        companyId: nullIfEmpty(row[COL.COMPANY_ID]),
        companyName: nullIfEmpty(row[COL.COMPANY_NAME]),
        effectiveDate: formatDate(row[COL.EFFECTIVE_DATE]),
        expirationDate: formatDate(row[COL.EXPIRATION_DATE]),
        facilityId: extractFacilityId(row),
        id,
        invoiceBalance: null,
        invoiceCharges: null,
        invoiceNumber: null,
        isAccelerated: String(row[COL.ACCELERATED]).toLowerCase() === "yes",
        isBlockPermit: String(row[COL.BLOCK_PERMIT]).toLowerCase() === "yes",
        parcel: nullIfEmpty(row[COL.PARCEL]),
        previousAppId: nullIfEmpty(row[COL.PREVIOUS_APP_ID]),
        projectEndDate: formatDate(row[COL.PROJECT_END_DATE]),
        projectName: nullIfEmpty(row[COL.PROJECT_NAME]),
        projectStartDate: formatDate(row[COL.PROJECT_START_DATE]),
        status: nullIfEmpty(row[COL.STATUS]),
        submittedDate: formatDate(row[COL.SUBMITTED_DATE]),
      };
    }
    // Check if this is an invoice row (no ID, invoice column starts with IV)
    else if (!id && invoiceCol.startsWith("IV") && currentPermit) {
      currentPermit.invoiceNumber = invoiceCol;
      currentPermit.invoiceCharges = parseNumber(row[COL.INVOICE_CHARGES]);
      currentPermit.invoiceBalance = parseNumber(row[COL.INVOICE_BALANCE]);
    }
  }

  // Don't forget the last permit
  if (currentPermit) {
    permits.push(currentPermit);
  }

  return permits;
}

/**
 * Parses HTML-based .xls content.
 * The portal exports HTML tables disguised as .xls files.
 *
 * Note: Standard row regex doesn't work because nested tables have their own
 * <tr>/<td> tags. We split by permit ID pattern instead.
 */
export function parseHtmlExport(content: string): PortalPermit[] {
  const permits: PortalPermit[] = [];

  // Split by permit ID pattern: <tr><td>D followed by digits
  // This gives us chunks where each chunk is a complete permit row including nested tables
  const chunks = content.split(PERMIT_SPLIT_REGEX);

  // Skip first chunk (before first permit)
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    // Reconstruct the full chunk (we split on "<tr><td>D" so need to add it back)
    const permitChunk = `<tr><td>D${chunk}`;

    // Extract first 17 cells from main row (not from nested tables)
    // First, get content before the nested invoice table
    const mainRowEnd = permitChunk.indexOf("<table");
    const mainRowContent =
      mainRowEnd > 0 ? permitChunk.slice(0, mainRowEnd) : permitChunk;

    // Extract cells from main row
    const cellMatches = mainRowContent.match(CELL_REGEX) ?? [];
    const cells: string[] = [];

    for (const cellHtml of cellMatches) {
      const cellContent = cellHtml
        .replace(TD_OPEN_REGEX, "")
        .replace(TD_CLOSE_REGEX, "")
        .replace(HTML_TAG_REGEX, "")
        .replaceAll(/&nbsp;/g, " ")
        .trim();
      cells.push(cellContent);
    }

    // Need at least 17 cells for a valid permit row
    if (cells.length < 17) {
      continue;
    }

    const permit: PortalPermit = {
      address: nullIfEmpty(cells[12]),
      city: nullIfEmpty(cells[13]),
      closedDate: formatDate(cells[8]),
      companyId: nullIfEmpty(cells[2]),
      companyName: nullIfEmpty(cells[3]),
      effectiveDate: formatDate(cells[6]),
      expirationDate: formatDate(cells[7]),
      facilityId: extractFacilityId(cells),
      id: cells[0] ?? "",
      invoiceBalance: null,
      invoiceCharges: null,
      invoiceNumber: null,
      isAccelerated: cells[16]?.toLowerCase() === "yes",
      isBlockPermit: cells[15]?.toLowerCase() === "yes",
      parcel: nullIfEmpty(cells[14]),
      previousAppId: nullIfEmpty(cells[9]),
      projectEndDate: formatDate(cells[11]),
      projectName: nullIfEmpty(cells[1]),
      projectStartDate: formatDate(cells[10]),
      status: nullIfEmpty(cells[4]),
      submittedDate: formatDate(cells[5]),
    };

    // Check for invoice in nested table (search full chunk)
    const invoiceMatch = permitChunk.match(INVOICE_TABLE_REGEX);
    if (invoiceMatch) {
      permit.invoiceNumber = invoiceMatch[1]?.trim() ?? null;
      permit.invoiceCharges = parseNumber(invoiceMatch[2]);
      permit.invoiceBalance = parseNumber(invoiceMatch[3]);
    }

    permits.push(permit);
  }

  return permits;
}

/**
 * Returns null if the value is empty, otherwise returns trimmed string.
 */
function nullIfEmpty(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  if (
    str === "" ||
    str === "Invoice Number" ||
    str === "Invoice Charges" ||
    str === "Invoice Balance"
  ) {
    return null;
  }
  return str;
}

/**
 * Parses a number from string, handling currency formatting.
 */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value)
    .replaceAll(/[$,\s]/g, "")
    .trim();
  if (str === "" || str === "Invoice Charges" || str === "Invoice Balance") {
    return null;
  }
  const num = Number.parseFloat(str);
  return Number.isNaN(num) ? null : num;
}

function extractFacilityId(values: readonly unknown[]): string | null {
  for (const value of values) {
    const str = String(value ?? "").trim();
    if (FACILITY_ID_REGEX.test(str)) {
      return str.toUpperCase();
    }
  }
  return null;
}

/**
 * Normalizes date strings to ISO format (YYYY-MM-DD).
 */
function formatDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  if (str === "" || str === "NaT" || str === "&nbsp;") {
    return null;
  }

  // Handle Excel serial date numbers
  const maybeSerial = Number.parseFloat(str);
  if (
    !Number.isNaN(maybeSerial) &&
    maybeSerial > 30_000 &&
    maybeSerial < 60_000
  ) {
    // Excel serial date (days since 1900-01-01, with the 1900 leap year bug)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const date = new Date(excelEpoch.getTime() + maybeSerial * 86_400_000);
    return date.toISOString().split("T")[0] ?? null;
  }

  // Handle various date formats
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString().split("T")[0] ?? null;
}
