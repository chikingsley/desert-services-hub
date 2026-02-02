#!/usr/bin/env bun

/**
 * Parse Credit Memos sheet
 * Usage: bun run parse-credit-memos.ts <output_csv>
 */

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";

const excelPath =
  "/Users/chiejimofor/Downloads/Customer Rental Master 3-7-18.xlsx";
const outputPath =
  process.argv[2] || "projects/accounts/data/raw/excel_credit_memos.csv";

type CMRecord = {
  source: string;
  source_table: string;
  contractor_name: string;
  credit_memo_number: string;
  amount: string;
  date: string;
};

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

console.log(`Parsing Credit Memos from ${excelPath}`);

const wb = XLSX.readFile(excelPath);
const sheet = wb.Sheets["Credit Memos"];
const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

console.log(`Found ${data.length} rows`);

// Header is at row 2 (index 2): Customer, Date, Credit Memo #, Amount
const records: CMRecord[] = [];

for (let i = 3; i < data.length; i++) {
  const row = data[i] as unknown[];
  if (!Array.isArray(row) || row.length === 0) continue;

  const name = cleanValue(row[0]);
  if (!name) continue;

  records.push({
    source: "excel",
    source_table: "Credit Memos",
    contractor_name: name,
    credit_memo_number: cleanValue(row[2]),
    amount: cleanValue(row[3]),
    date: cleanValue(row[1]),
  });
}

const headers = [
  "source",
  "source_table",
  "contractor_name",
  "credit_memo_number",
  "amount",
  "date",
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
    headers.map((h) => escapeCSV(r[h as keyof CMRecord] || "")).join(",")
  ),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Wrote ${records.length} records to ${outputPath}`);
