#!/usr/bin/env bun
/**
 * Parse Excel sheets and extract contractor/project data
 * Usage: bun run parse-excel.ts <excel_path> <sheet_name> <output_csv>
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";

const excelPath = process.argv[2];
const sheetName = process.argv[3];
const outputPath = process.argv[4];

if (!excelPath || !sheetName || !outputPath) {
  console.error("Usage: bun run parse-excel.ts <excel_path> <sheet_name> <output_csv>");
  process.exit(1);
}

type ExcelRecord = {
  source: string;
  source_table: string;
  contractor_name: string;
  project_name: string;
  job_id: string;
  azcon_number: string;
  swppp_number: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  raw_json: string;
};

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function mapRow(row: Record<string, unknown>, sourceTable: string): ExcelRecord | null {
  const record: ExcelRecord = {
    source: "excel",
    source_table: sourceTable,
    contractor_name: "",
    project_name: "",
    job_id: "",
    azcon_number: "",
    swppp_number: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    raw_json: "",
  };

  // Map based on source table
  if (sourceTable === "Rental items" || sourceTable === "Rental B & V") {
    record.contractor_name = cleanValue(row["Name"]);
    record.project_name = cleanValue(row["Location "] || row["Location"]);
    record.job_id = cleanValue(row["Job ID"]);
  } else if (sourceTable === "SWPPP #s") {
    record.swppp_number = cleanValue(row["SWPPP Number"]);
    record.contractor_name = cleanValue(row["Contractor"]);
    record.project_name = cleanValue(row["Job"]);
  } else if (
    sourceTable === "Need to Schedule" ||
    sourceTable === "Confirmed Schedule" ||
    sourceTable === "SWPPP B & V"
  ) {
    record.contractor_name = cleanValue(row["OWNER/ CONTRACTOR"]);
    record.project_name = cleanValue(row["JOB NAME"]);
    // Address might be in ADDRESS or __EMPTY column depending on sheet
    record.address = cleanValue(row["ADDRESS"] || row["__EMPTY"]);
    record.contact_name = cleanValue(row["CONTACT"]);
    record.contact_phone = cleanValue(row["PHONE #"]);
  } else if (sourceTable === "WT & SW 2018") {
    record.job_id = cleanValue(row["Job ID"]);
    record.contractor_name = cleanValue(row["Customer"]);
    record.project_name = cleanValue(row["Location "] || row["Location"]);
  } else if (
    sourceTable === "Uploads" ||
    sourceTable === "Completed" ||
    sourceTable === "Need to Start"
  ) {
    record.contractor_name = cleanValue(row["Company Name"]);
    record.project_name = cleanValue(row["Job Name"]);
    record.azcon_number = cleanValue(row["AZCON #"]);
    record.contact_name = cleanValue(row["Main Site Contact"]);
    record.contact_phone = cleanValue(row["Phone"]);
    record.contact_email = cleanValue(row["Site Contact Email"]);

    // Combine address parts
    const building = cleanValue(row["Building/House Number"]);
    const street = cleanValue(row["Street Name"]);
    record.address = [building, street].filter(Boolean).join(" ");

    record.city = cleanValue(row["City"]);
    record.state = cleanValue(row["State/Region"]);
    record.zip = cleanValue(row["Postal"]);
  } else {
    // Generic mapping - try common column names
    record.contractor_name =
      cleanValue(row["Name"]) ||
      cleanValue(row["Customer"]) ||
      cleanValue(row["Company Name"]) ||
      cleanValue(row["OWNER/ CONTRACTOR"]) ||
      cleanValue(row["Contractor"]);
    record.project_name =
      cleanValue(row["Location"]) ||
      cleanValue(row["Location "]) ||
      cleanValue(row["Job Name"]) ||
      cleanValue(row["JOB NAME"]) ||
      cleanValue(row["Job"]);
  }

  // Store raw JSON for traceability (limited to avoid huge files)
  const rawObj: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (val !== null && val !== undefined && val !== "") {
      rawObj[key] = val;
    }
  }
  record.raw_json = JSON.stringify(rawObj);

  // Skip rows without contractor name
  if (!record.contractor_name) return null;

  return record;
}

// Main execution
console.log(`Parsing ${sheetName} from ${excelPath}`);

const wb = XLSX.readFile(excelPath);

if (!wb.SheetNames.includes(sheetName)) {
  console.error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}

const sheet = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

console.log(`Found ${data.length} rows`);

const records: ExcelRecord[] = [];
for (const row of data) {
  const mapped = mapRow(row, sheetName);
  if (mapped) {
    records.push(mapped);
  }
}

// Write CSV
const headers = [
  "source",
  "source_table",
  "contractor_name",
  "project_name",
  "job_id",
  "azcon_number",
  "swppp_number",
  "contact_name",
  "contact_phone",
  "contact_email",
  "address",
  "city",
  "state",
  "zip",
  "raw_json",
];

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const csvLines = [
  headers.join(","),
  ...records.map((r) => headers.map((h) => escapeCSV(r[h as keyof ExcelRecord] || "")).join(",")),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Wrote ${records.length} records to ${outputPath}`);
