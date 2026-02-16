/**
 * SWPPP Master worksheet parser.
 *
 * Pure data transform: converts raw 2D worksheet data into typed SwpppProject arrays.
 * Handles different column layouts per worksheet (Billing Verification, Need to Schedule,
 * Confirmed Schedule).
 */

import type { SwpppProject } from "@sharepoint/swppp/client";
import type { WorksheetName } from "@sharepoint/swppp/config";
import { COLUMNS, WORKSHEETS } from "@sharepoint/swppp/config";

function getString(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) {
    return "";
  }
  const val = row[idx];
  return val === null || val === undefined ? "" : String(val);
}

function getDateOrNull(
  row: unknown[],
  idx: number | undefined
): number | string | null {
  if (idx === undefined) {
    return null;
  }
  const val = row[idx];
  if (val === null || val === undefined || val === "") {
    return null;
  }
  return val as number | string;
}

function parseBillingVerification(
  row: unknown[],
  index: number,
  worksheet: WorksheetName
): SwpppProject {
  const cols = COLUMNS[
    worksheet
  ] as (typeof COLUMNS)[typeof WORKSHEETS.BILLING_VERIFICATION];
  return {
    address: "",
    comments: getString(row, cols.COMMENTS),
    contact: getString(row, cols.CONTACT),
    contractor: getString(row, cols.CONTRACTOR),
    date: getDateOrNull(row, cols.INSTALL_DATE),
    dateEntered: getDateOrNull(row, cols.DATE_ENTERED),
    invoice: getString(row, cols.INVOICE),
    jobName: getString(row, cols.JOB_NAME),
    phone: getString(row, cols.PHONE),
    rowNumber: index + 2,
    workCompleted: getString(row, cols.WORK_COMPLETED),
    workDescription: getString(row, cols.WORK_DESCRIPTION),
    worksheet,
  };
}

function parseNeedToSchedule(
  row: unknown[],
  index: number,
  worksheet: WorksheetName
): SwpppProject {
  const cols = COLUMNS[
    worksheet
  ] as (typeof COLUMNS)[typeof WORKSHEETS.NEED_TO_SCHEDULE];
  return {
    address: getString(row, cols.ADDRESS),
    comments: getString(row, cols.COMMENTS),
    contact: getString(row, cols.CONTACT),
    contractor: getString(row, cols.CONTRACTOR),
    date: getDateOrNull(row, cols.DATE),
    dateEntered: getDateOrNull(row, cols.DATE_CONFIRMED),
    invoice: getString(row, cols.INVOICE),
    jobName: getString(row, cols.JOB_NAME),
    phone: getString(row, cols.PHONE),
    rowNumber: index + 2,
    workCompleted: getString(row, cols.WORK_COMPLETED),
    workDescription: getString(row, cols.WORK_DESCRIPTION),
    worksheet,
  };
}

function parseConfirmedSchedule(
  row: unknown[],
  index: number,
  worksheet: WorksheetName
): SwpppProject {
  const cols = COLUMNS[
    worksheet
  ] as (typeof COLUMNS)[typeof WORKSHEETS.CONFIRMED_SCHEDULE];
  return {
    address: getString(row, cols.ADDRESS),
    comments: getString(row, cols.COMMENTS),
    contact: getString(row, cols.CONTACT),
    contractor: getString(row, cols.CONTRACTOR),
    date: getDateOrNull(row, cols.DATE),
    dateEntered: getDateOrNull(row, cols.DATE_ENTERED),
    invoice: getString(row, cols.INVOICE),
    jobName: getString(row, cols.JOB_NAME),
    phone: getString(row, cols.PHONE),
    rowNumber: index + 2,
    workCompleted: "",
    workDescription: getString(row, cols.JOB_DESCRIPTION),
    worksheet,
  };
}

/**
 * Parse raw worksheet data (2D array from Graph API) into typed SwpppProject array.
 * Skips the header row and maps columns based on worksheet type.
 */
export function parseWorksheet(
  worksheet: WorksheetName,
  data: unknown[][]
): SwpppProject[] {
  const rows = data.slice(1);

  return rows.map((row, index) => {
    if (worksheet === WORKSHEETS.BILLING_VERIFICATION) {
      return parseBillingVerification(row, index, worksheet);
    }
    if (worksheet === WORKSHEETS.NEED_TO_SCHEDULE) {
      return parseNeedToSchedule(row, index, worksheet);
    }
    return parseConfirmedSchedule(row, index, worksheet);
  });
}
