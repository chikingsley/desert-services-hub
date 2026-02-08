import type { DustApplication } from "@aqdata/types";
import { read, utils } from "xlsx";

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
    header: 1,
    raw: false,
    defval: null,
  });

  // Log header row for discovery
  if (rows[0]) {
    console.log("  [parser] Header row:", rows[0]);
    console.log(`  [parser] Total rows (incl header): ${rows.length}`);
  }

  const results: DustApplication[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) {
      continue;
    }

    const appId = str(row[COL.APPLICATION_ID]);
    if (!appId) {
      continue;
    }

    results.push({
      applicationId: appId,
      facilityId: nullStr(row[COL.FACILITY_ID]),
      facilityName: nullStr(row[COL.FACILITY_NAME]),
      projectName: nullStr(row[COL.PROJECT_NAME]),
      companyId: nullStr(row[COL.COMPANY_ID]),
      companyName: nullStr(row[COL.COMPANY_NAME]),
      status: nullStr(row[COL.STATUS]),
      submittedDate: formatDate(row[COL.SUBMITTED_DATE]),
      effectiveDate: formatDate(row[COL.EFFECTIVE_DATE]),
      expirationDate: formatDate(row[COL.EXPIRATION_DATE]),
      closedDate: formatDate(row[COL.CLOSED_DATE]),
      previousAppId: nullStr(row[COL.PREVIOUS_APP_ID]),
      projectStartDate: formatDate(row[COL.PROJECT_START_DATE]),
      projectCompletionDate: formatDate(row[COL.PROJECT_COMPLETION_DATE]),
      address: nullStr(row[COL.ADDRESS]),
      city: nullStr(row[COL.CITY]),
      parcel: nullStr(row[COL.PARCEL]),
      isBlockPermit: toBool(row[COL.BLOCK_PERMIT]),
      isAccelerated: toBool(row[COL.ACCELERATED]),
      invoiceNumber: nullStr(row[COL.INVOICE_NUMBER]),
      invoiceCharges: parseNumber(row[COL.INVOICE_CHARGES]),
      invoiceBalance: parseNumber(row[COL.INVOICE_BALANCE]),
    });
  }

  return results;
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
  return s === "" || s === "&nbsp;" ? null : s;
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
    .replace(/[$,\s]/g, "")
    .trim();
  if (s === "") {
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
