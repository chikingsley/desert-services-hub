import type { Invoice } from "../types";
import { extractCells, formatDate, nullStr, parseNumber } from "./shared";

const INVOICE_ID_REGEX = /^IV\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>IV(?=\d)/i;

// Invoice ID | Facility ID | Facility Name | Company ID | Company Name |
// Invoice Type | Reference Number | Invoice Status | Created Date |
// Due Date | Total Charges | Total Payments | Total Credits | Balance
const COL = {
  INVOICE_ID: 0,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  COMPANY_ID: 3,
  COMPANY_NAME: 4,
  INVOICE_TYPE: 5,
  REFERENCE_NUMBER: 6,
  INVOICE_STATUS: 7,
  CREATED_DATE: 8,
  DUE_DATE: 9,
  TOTAL_CHARGES: 10,
  TOTAL_PAYMENTS: 11,
  TOTAL_CREDITS: 12,
  BALANCE: 13,
} as const;

const MIN_CELLS = 10;

export function parseInvoiceExport(data: Buffer): Invoice[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: Invoice[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const cells = extractCells(`<tr><td>IV${chunk}`);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.INVOICE_ID] ?? "";
    if (!INVOICE_ID_REGEX.test(id)) {
      continue;
    }

    results.push({
      balance: parseNumber(cells[COL.BALANCE]),
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      createdDate: formatDate(cells[COL.CREATED_DATE]),
      dueDate: formatDate(cells[COL.DUE_DATE]),
      facilityId: nullStr(cells[COL.FACILITY_ID]),
      facilityName: nullStr(cells[COL.FACILITY_NAME]),
      invoiceId: id,
      invoiceStatus: nullStr(cells[COL.INVOICE_STATUS]),
      invoiceType: nullStr(cells[COL.INVOICE_TYPE]),
      referenceNumber: nullStr(cells[COL.REFERENCE_NUMBER]),
      totalCharges: parseNumber(cells[COL.TOTAL_CHARGES]),
      totalCredits: parseNumber(cells[COL.TOTAL_CREDITS]),
      totalPayments: parseNumber(cells[COL.TOTAL_PAYMENTS]),
    });
  }

  return results;
}
