#!/usr/bin/env bun
/**
 * Parse Excel sheets that have NO header row (data starts at row 1)
 * Usage: bun run parse-excel-noheader.ts <excel_path> <sheet_name> <output_csv> <column_mapping_json>
 *
 * Column mapping example for Location Completed:
 * {"0":"inspector","1":"contractor_name","2":"project_name","7":"building_number","8":"street_name","9":"city","10":"state","11":"zip","14":"contact_phone","15":"contact_name","16":"contact_email","17":"azcon_number"}
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";

const excelPath = process.argv[2];
const sheetName = process.argv[3];
const outputPath = process.argv[4];
const columnMappingJson = process.argv[5];

if (!excelPath || !sheetName || !outputPath || !columnMappingJson) {
  console.error("Usage: bun run parse-excel-noheader.ts <excel_path> <sheet_name> <output_csv> <column_mapping_json>");
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
  inspector: string;
  raw_json: string;
};

const columnMapping: Record<string, string> = JSON.parse(columnMappingJson);

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

// Main execution
console.log(`Parsing ${sheetName} from ${excelPath} (no header mode)`);

const wb = XLSX.readFile(excelPath);

if (!wb.SheetNames.includes(sheetName)) {
  console.error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}

const sheet = wb.Sheets[sheetName];
// Get as array of arrays (no headers)
const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

console.log(`Found ${data.length} rows`);

const records: ExcelRecord[] = [];

for (const row of data) {
  if (!Array.isArray(row) || row.length === 0) continue;

  const record: ExcelRecord = {
    source: "excel",
    source_table: sheetName,
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
    inspector: "",
    raw_json: "",
  };

  // Apply column mapping
  for (const [colIndex, fieldName] of Object.entries(columnMapping)) {
    const idx = parseInt(colIndex);
    const val = cleanValue(row[idx]);

    if (fieldName === "building_number" || fieldName === "street_name") {
      // Combine into address
      record.address = record.address ? `${record.address} ${val}` : val;
    } else if (fieldName in record) {
      (record as any)[fieldName] = val;
    }
  }

  // Store raw JSON
  record.raw_json = JSON.stringify(row);

  // Skip rows without contractor name
  if (!record.contractor_name) continue;

  records.push(record);
}

// Write CSV
const headers = [
  "source", "source_table", "contractor_name", "project_name", "job_id",
  "azcon_number", "swppp_number", "contact_name", "contact_phone", "contact_email",
  "address", "city", "state", "zip", "inspector", "raw_json",
];

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const csvLines = [
  headers.join(","),
  ...records.map(r => headers.map(h => escapeCSV(r[h as keyof ExcelRecord] || "")).join(",")),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Wrote ${records.length} records to ${outputPath}`);
