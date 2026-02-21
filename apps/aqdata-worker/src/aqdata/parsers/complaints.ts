import type { Complaint, ComplaintFacility } from "../types";
import {
  extractCells,
  extractNestedTable,
  formatDate,
  nullStr,
  parseNestedTableRows,
} from "./shared";

const COMPLAINT_ID_REGEX = /^CMPL\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>CMPL(?=\d)/i;

// Complaint ID | Complaint State | Complaint Received Date |
// Complaint Activity Date | Complaint Entered Date | Complaint Closed Date |
// Complaint Inspection Zone | Complaint Map Square |
// Investigation Category | Investigation Subcategory |
// [Investigation Facility — nested table with repeating (Facility ID, Facility Name, Company Name)]
const COL = {
  COMPLAINT_ID: 0,
  STATE: 1,
  RECEIVED_DATE: 2,
  ACTIVITY_DATE: 3,
  ENTERED_DATE: 4,
  CLOSED_DATE: 5,
  INSPECTION_ZONE: 6,
  MAP_SQUARE: 7,
  INVESTIGATION_CATEGORY: 8,
  INVESTIGATION_SUBCATEGORY: 9,
} as const;

const MIN_CELLS = 8;

// Nested facility table columns
const FAC_COL = {
  FACILITY_ID: 0,
  FACILITY_NAME: 1,
  COMPANY_NAME: 2,
} as const;

export function parseComplaintExport(data: Buffer): Complaint[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: Complaint[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const rowHtml = `<tr><td>CMPL${chunk}`;
    const cells = extractCells(rowHtml);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.COMPLAINT_ID] ?? "";
    if (!COMPLAINT_ID_REGEX.test(id)) {
      continue;
    }

    const nestedHtml = extractNestedTable(rowHtml);
    const facilities = parseFacilities(nestedHtml);

    results.push({
      activityDate: formatDate(cells[COL.ACTIVITY_DATE]),
      closedDate: formatDate(cells[COL.CLOSED_DATE]),
      complaintId: id,
      enteredDate: formatDate(cells[COL.ENTERED_DATE]),
      facilities,
      inspectionZone: nullStr(cells[COL.INSPECTION_ZONE]),
      investigationCategory: nullStr(cells[COL.INVESTIGATION_CATEGORY]),
      investigationSubcategory: nullStr(cells[COL.INVESTIGATION_SUBCATEGORY]),
      mapSquare: nullStr(cells[COL.MAP_SQUARE]),
      receivedDate: formatDate(cells[COL.RECEIVED_DATE]),
      state: nullStr(cells[COL.STATE]),
    });
  }

  return results;
}

function parseFacilities(nestedHtml: string): ComplaintFacility[] {
  const rows = parseNestedTableRows(nestedHtml);
  const facilities: ComplaintFacility[] = [];

  for (const row of rows) {
    const facilityId = nullStr(row[FAC_COL.FACILITY_ID]);
    const facilityName = nullStr(row[FAC_COL.FACILITY_NAME]);
    const companyName = nullStr(row[FAC_COL.COMPANY_NAME]);

    // Skip empty facility rows
    if (!(facilityId || facilityName || companyName)) {
      continue;
    }

    facilities.push({ companyName, facilityId, facilityName });
  }

  return facilities;
}
