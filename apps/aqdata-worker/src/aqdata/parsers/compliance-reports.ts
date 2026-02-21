import type { ComplianceReport } from "../types";
import { extractCells, formatDate, nullStr } from "./shared";

const REPORT_ID_REGEX = /^CRPT\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>CRPT(?=\d)/i;

// Report ID | Facility ID | Facility Name | Facility Class | Facility Type |
// Company ID | Company Name | Report Type | Category | Description |
// Received Date | Reviewed Date | Accepted | Previous Report ID | Comments
const COL = {
  REPORT_ID: 0,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  FACILITY_CLASS: 3,
  FACILITY_TYPE: 4,
  COMPANY_ID: 5,
  COMPANY_NAME: 6,
  REPORT_TYPE: 7,
  CATEGORY: 8,
  DESCRIPTION: 9,
  RECEIVED_DATE: 10,
  REVIEWED_DATE: 11,
  ACCEPTED: 12,
  PREVIOUS_REPORT_ID: 13,
  COMMENTS: 14,
} as const;

const MIN_CELLS = 10;

export function parseComplianceReportExport(data: Buffer): ComplianceReport[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: ComplianceReport[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const cells = extractCells(`<tr><td>CRPT${chunk}`);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.REPORT_ID] ?? "";
    if (!REPORT_ID_REGEX.test(id)) {
      continue;
    }

    results.push({
      accepted: nullStr(cells[COL.ACCEPTED]),
      category: nullStr(cells[COL.CATEGORY]),
      comments: nullStr(cells[COL.COMMENTS]),
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      description: nullStr(cells[COL.DESCRIPTION]),
      facilityClass: nullStr(cells[COL.FACILITY_CLASS]),
      facilityId: nullStr(cells[COL.FACILITY_ID]),
      facilityName: nullStr(cells[COL.FACILITY_NAME]),
      facilityType: nullStr(cells[COL.FACILITY_TYPE]),
      previousReportId: nullStr(cells[COL.PREVIOUS_REPORT_ID]),
      receivedDate: formatDate(cells[COL.RECEIVED_DATE]),
      reportId: id,
      reportType: nullStr(cells[COL.REPORT_TYPE]),
      reviewedDate: formatDate(cells[COL.REVIEWED_DATE]),
    });
  }

  return results;
}
