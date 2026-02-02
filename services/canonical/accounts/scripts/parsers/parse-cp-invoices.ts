#!/usr/bin/env bun

/**
 * Parse CP Invoices / Credit Memos sheets (special format with header on row 3)
 * Usage: bun run parse-cp-invoices.ts <excel_path> <sheet_name> <output_csv>
 */

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";

const excelPath = process.argv[2];
const sheetName = process.argv[3];
const outputPath = process.argv[4];

if (!(excelPath && sheetName && outputPath)) {
  console.error(
    "Usage: bun run parse-cp-invoices.ts <excel_path> <sheet_name> <output_csv>"
  );
  process.exit(1);
}

type CPRecord = {
  source: string;
  source_table: string;
  contractor_name: string;
  invoice_number: string;
  amount: string;
  date: string;
  payment_num: string;
  status: string;
  notes: string;
};

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

// Main execution
console.log(`Parsing ${sheetName} from ${excelPath}`);

const wb = XLSX.readFile(excelPath);

if (!wb.SheetNames.includes(sheetName)) {
  console.error(`Sheet "${sheetName}" not found.`);
  process.exit(1);
}

const sheet = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

console.log(`Found ${data.length} rows`);

// Find the header row (look for "Type", "Date", "Num", "Name")
let headerRowIndex = -1;
for (let i = 0; i < Math.min(10, data.length); i++) {
  const row = data[i];
  if (Array.isArray(row) && row.includes("Name") && row.includes("Date")) {
    headerRowIndex = i;
    break;
  }
}

if (headerRowIndex === -1) {
  console.error("Could not find header row with 'Name' and 'Date'");
  process.exit(1);
}

const headerRow = data[headerRowIndex] as string[];
console.log(`Header row at index ${headerRowIndex}: ${headerRow.join(", ")}`);

// Find column indices
const nameIdx = headerRow.indexOf("Name");
const dateIdx = headerRow.indexOf("Date");
const numIdx = headerRow.indexOf("Num");
const amountIdx = headerRow.indexOf("Amount");
const invoiceIdx = headerRow.indexOf("Invoice #");
const statusIdx = headerRow.indexOf("Status");
const miscIdx = headerRow.indexOf("MISC");

const records: CPRecord[] = [];

for (let i = headerRowIndex + 1; i < data.length; i++) {
  const row = data[i] as unknown[];
  if (!Array.isArray(row) || row.length === 0) continue;

  const name = cleanValue(row[nameIdx]);
  if (!name) continue;

  // Skip rows that are just notes or headers
  if (name.startsWith("Using the date") || name === "Name") continue;

  records.push({
    source: "excel",
    source_table: sheetName,
    contractor_name: name,
    invoice_number: cleanValue(row[invoiceIdx]),
    amount: cleanValue(row[amountIdx]),
    date: cleanValue(row[dateIdx]),
    payment_num: cleanValue(row[numIdx]),
    status: cleanValue(row[statusIdx]),
    notes: cleanValue(row[miscIdx]),
  });
}

// Write CSV
const headers = [
  "source",
  "source_table",
  "contractor_name",
  "invoice_number",
  "amount",
  "date",
  "payment_num",
  "status",
  "notes",
];

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const csvLines = [
  headers.join(","),
  ...records.map((r) =>
    headers.map((h) => escapeCSV(r[h as keyof CPRecord] || "")).join(",")
  ),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Wrote ${records.length} records to ${outputPath}`);
