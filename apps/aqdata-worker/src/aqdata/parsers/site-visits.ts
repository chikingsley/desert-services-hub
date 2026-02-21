import type { SiteVisit } from "../types";
import { extractCells, formatDate, nullStr } from "./shared";

const VISIT_ID_REGEX = /^SITE\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>SITE(?=\d)/i;

// Site Visit ID | Facility ID | Facility Name | Facility Class |
// Facility Type | Company ID | Company Name | Operating Status |
// Visit Date | Visit Type | Compliance Issue | Evaluator(s) | Inspection ID
const COL = {
  VISIT_ID: 0,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  FACILITY_CLASS: 3,
  FACILITY_TYPE: 4,
  COMPANY_ID: 5,
  COMPANY_NAME: 6,
  OPERATING_STATUS: 7,
  VISIT_DATE: 8,
  VISIT_TYPE: 9,
  COMPLIANCE_ISSUE: 10,
  EVALUATORS: 11,
  INSPECTION_ID: 12,
} as const;

const MIN_CELLS = 9;

export function parseSiteVisitExport(data: Buffer): SiteVisit[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: SiteVisit[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const cells = extractCells(`<tr><td>SITE${chunk}`);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.VISIT_ID] ?? "";
    if (!VISIT_ID_REGEX.test(id)) {
      continue;
    }

    results.push({
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      complianceIssue: nullStr(cells[COL.COMPLIANCE_ISSUE]),
      evaluators: nullStr(cells[COL.EVALUATORS]),
      facilityClass: nullStr(cells[COL.FACILITY_CLASS]),
      facilityId: nullStr(cells[COL.FACILITY_ID]),
      facilityName: nullStr(cells[COL.FACILITY_NAME]),
      facilityType: nullStr(cells[COL.FACILITY_TYPE]),
      inspectionId: nullStr(cells[COL.INSPECTION_ID]),
      operatingStatus: nullStr(cells[COL.OPERATING_STATUS]),
      visitDate: formatDate(cells[COL.VISIT_DATE]),
      visitId: id,
      visitType: nullStr(cells[COL.VISIT_TYPE]),
    });
  }

  return results;
}
