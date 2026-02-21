import type { EnforcementAction } from "../types";
import {
  extractCells,
  formatDate,
  nullStr,
  parseNumber,
  toBool,
} from "./shared";

const ACTION_ID_REGEX = /^ENF\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>ENF(?=\d)/i;

// Enforcement Action ID | Facility ID | Facility Name | Company ID |
// Company Name | Docket Number | Enforcement Action Type |
// Enforcement Action State | Potential Violation Start Date |
// Potential Violation End Date | SEP? | Penalty Amount | SEP Offset Amount
const COL = {
  ACTION_ID: 0,
  FACILITY_ID: 1,
  FACILITY_NAME: 2,
  COMPANY_ID: 3,
  COMPANY_NAME: 4,
  DOCKET_NUMBER: 5,
  ACTION_TYPE: 6,
  ACTION_STATE: 7,
  VIOLATION_START_DATE: 8,
  VIOLATION_END_DATE: 9,
  IS_SEP: 10,
  PENALTY_AMOUNT: 11,
  SEP_OFFSET_AMOUNT: 12,
} as const;

const MIN_CELLS = 8;

export function parseEnforcementActionExport(
  data: Buffer
): EnforcementAction[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: EnforcementAction[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const cells = extractCells(`<tr><td>ENF${chunk}`);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.ACTION_ID] ?? "";
    if (!ACTION_ID_REGEX.test(id)) {
      continue;
    }

    results.push({
      actionId: id,
      actionState: nullStr(cells[COL.ACTION_STATE]),
      actionType: nullStr(cells[COL.ACTION_TYPE]),
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      docketNumber: nullStr(cells[COL.DOCKET_NUMBER]),
      facilityId: nullStr(cells[COL.FACILITY_ID]),
      facilityName: nullStr(cells[COL.FACILITY_NAME]),
      isSep: toBool(cells[COL.IS_SEP]),
      penaltyAmount: parseNumber(cells[COL.PENALTY_AMOUNT]),
      potentialViolationEndDate: formatDate(cells[COL.VIOLATION_END_DATE]),
      potentialViolationStartDate: formatDate(cells[COL.VIOLATION_START_DATE]),
      sepOffsetAmount: parseNumber(cells[COL.SEP_OFFSET_AMOUNT]),
    });
  }

  return results;
}
