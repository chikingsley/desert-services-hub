import type { AsbestosInvoice, AsbestosNotification } from "../types";
import {
  extractCells,
  extractNestedTable,
  formatDate,
  nullStr,
  parseNestedTableRows,
  parseNumber,
} from "./shared";

const NOTIFICATION_ID_REGEX = /^ASB\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>ASB(?=\d)/i;

// Notification Number | Facility ID | Facility Name | Company ID |
// Company Name | Status | Previous Notification Number | Created Date |
// Submitted Date | Removal Start Date | Removal End Date |
// Demolition Start Date | Demolition End Date | Expiration Date |
// Closed Date | Legacy ASB Number | Asbestos Zone | County |
// [Invoice — nested table with repeating (Invoice Number, Invoice Charges, Invoice Balance)]
const COL = {
  NOTIFICATION_NUMBER: 0,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  COMPANY_ID: 3,
  COMPANY_NAME: 4,
  STATUS: 5,
  PREVIOUS_NOTIFICATION: 6,
  CREATED_DATE: 7,
  SUBMITTED_DATE: 8,
  REMOVAL_START_DATE: 9,
  REMOVAL_END_DATE: 10,
  DEMOLITION_START_DATE: 11,
  DEMOLITION_END_DATE: 12,
  EXPIRATION_DATE: 13,
  CLOSED_DATE: 14,
  LEGACY_ASB_NUMBER: 15,
  ASBESTOS_ZONE: 16,
  COUNTY: 17,
} as const;

const MIN_CELLS = 6;

// Nested invoice table columns
const INV_COL = {
  INVOICE_NUMBER: 0,
  INVOICE_CHARGES: 1,
  INVOICE_BALANCE: 2,
} as const;

export function parseAsbestosNotificationExport(
  data: Buffer
): AsbestosNotification[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: AsbestosNotification[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const rowHtml = `<tr><td>ASB${chunk}`;
    const cells = extractCells(rowHtml);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.NOTIFICATION_NUMBER] ?? "";
    if (!NOTIFICATION_ID_REGEX.test(id)) {
      continue;
    }

    const nestedHtml = extractNestedTable(rowHtml);
    const invoices = parseInvoices(nestedHtml);

    results.push({
      asbestosZone: nullStr(cells[COL.ASBESTOS_ZONE]),
      closedDate: formatDate(cells[COL.CLOSED_DATE]),
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      county: nullStr(cells[COL.COUNTY]),
      createdDate: formatDate(cells[COL.CREATED_DATE]),
      demolitionEndDate: formatDate(cells[COL.DEMOLITION_END_DATE]),
      demolitionStartDate: formatDate(cells[COL.DEMOLITION_START_DATE]),
      expirationDate: formatDate(cells[COL.EXPIRATION_DATE]),
      facilityId: nullStr(cells[COL.FACILITY_ID]),
      facilityName: nullStr(cells[COL.FACILITY_NAME]),
      invoices,
      legacyAsbNumber: nullStr(cells[COL.LEGACY_ASB_NUMBER]),
      notificationNumber: id,
      previousNotificationNumber: nullStr(cells[COL.PREVIOUS_NOTIFICATION]),
      removalEndDate: formatDate(cells[COL.REMOVAL_END_DATE]),
      removalStartDate: formatDate(cells[COL.REMOVAL_START_DATE]),
      status: nullStr(cells[COL.STATUS]),
      submittedDate: formatDate(cells[COL.SUBMITTED_DATE]),
    });
  }

  return results;
}

function parseInvoices(nestedHtml: string): AsbestosInvoice[] {
  const rows = parseNestedTableRows(nestedHtml);
  const invoices: AsbestosInvoice[] = [];

  for (const row of rows) {
    const invoiceNumber = nullStr(row[INV_COL.INVOICE_NUMBER]);
    if (!invoiceNumber) {
      continue;
    }

    invoices.push({
      invoiceBalance: parseNumber(row[INV_COL.INVOICE_BALANCE]),
      invoiceCharges: parseNumber(row[INV_COL.INVOICE_CHARGES]),
      invoiceNumber,
    });
  }

  return invoices;
}
