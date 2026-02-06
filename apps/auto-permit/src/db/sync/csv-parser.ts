/**
 * CSV Parser for Permit Data
 *
 * Parses CSV exports from Maricopa County and converts them to PermitRow format.
 *
 * @module src/db/sync/csv-parser
 */

/**
 * Internal representation of a permit row for database operations.
 * Matches the schema of both company-permits and marketing-permits tables.
 */
export interface PermitRow {
  id: string;
  project_name: string | null;
  company_id: string | null;
  company_name: string | null;
  status: string | null;
  submitted_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  closed_date: string | null;
  previous_app_id: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  is_block_permit: number;
  is_accelerated: number;
  invoice_number: string | null;
  invoice_charges: number | null;
  invoice_balance: number | null;
}

function stripQuotes(str: string): string {
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Parse CSV content into an array of row objects.
 */
export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length === 0) {
    return [];
  }

  const headerLine = lines[0];
  if (!headerLine) {
    return [];
  }
  const headers = headerLine.split(",").map((h) => stripQuotes(h.trim()));

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => stripQuotes(v.trim()));
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (header !== undefined) {
        row[header] = values[i] ?? "";
      }
    }
    return row;
  });
}

/**
 * Format a date string to ISO format (YYYY-MM-DD).
 */
export function formatDate(value: string | undefined): string | null {
  if (!value || value === "NaT" || value === "") {
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString().split("T")[0] ?? null;
}

/**
 * Normalize status strings to valid status values.
 */
export function normalizeStatus(
  rawStatus: string | undefined,
  submittedDate: string | null,
  effectiveDate: string | null
): string | null {
  if (submittedDate && !effectiveDate) {
    return "Submitted";
  }

  if (!rawStatus) {
    return null;
  }

  const normalized =
    rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();

  const validStatuses = [
    "Draft",
    "Submitted",
    "Active",
    "Superseded",
    "Closed",
    "Rejected",
    "Pending Payment",
  ];

  if (rawStatus === "Pending Payment") {
    return "Pending Payment";
  }

  return validStatuses.includes(normalized) ? normalized : rawStatus;
}

/**
 * Convert a raw CSV row to a PermitRow.
 */
export function toPermitRow(raw: Record<string, string>): PermitRow {
  const submittedDate = formatDate(raw["Submitted Date"]);
  const effectiveDate = formatDate(raw["Effective Date"]);

  return {
    id: raw["Dust Application ID"] ?? "",
    project_name: raw["Project Name"] ?? null,
    company_id: raw["Company ID"] ?? null,
    company_name: raw["Company Name"] ?? null,
    status: normalizeStatus(raw.Status, submittedDate, effectiveDate),
    submitted_date: submittedDate,
    effective_date: effectiveDate,
    expiration_date: formatDate(raw["Expiration Date"]),
    closed_date: formatDate(raw["Closed Date"]),
    previous_app_id: raw["Previous Dust Application No."] ?? null,
    project_start_date: formatDate(raw["Project Start Date"]),
    project_end_date: formatDate(raw["Project Completion Date"]),
    address: raw["Project Address"] ?? null,
    city: raw["Project City"] ?? null,
    parcel: raw["Parcel No."] ?? null,
    is_block_permit: raw["Block Permit?"] === "Yes" ? 1 : 0,
    is_accelerated: raw["Accelerated?"] === "Yes" ? 1 : 0,
    invoice_number: raw["Invoice Number"] || null,
    invoice_charges: raw["Invoice Charges"]
      ? Number.parseFloat(raw["Invoice Charges"])
      : null,
    invoice_balance: raw["Invoice Balance"]
      ? Number.parseFloat(raw["Invoice Balance"])
      : null,
  };
}
