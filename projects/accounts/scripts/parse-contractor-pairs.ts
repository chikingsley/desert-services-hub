#!/usr/bin/env bun

/**
 * Parse sheets with contractor/project pairs in columns (no headers)
 * Columns: 0=Contractor1, 1=Project1, 2=null, 3=Contractor2, 4=Project2
 * Usage: bun run parse-contractor-pairs.ts <excel_path> <sheet_name> <output_csv>
 */

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";

const excelPath = process.argv[2];
const sheetName = process.argv[3];
const outputPath = process.argv[4];

if (!(excelPath && sheetName && outputPath)) {
  console.error(
    "Usage: bun run parse-contractor-pairs.ts <excel_path> <sheet_name> <output_csv>"
  );
  process.exit(1);
}

type PairRecord = {
  source: string;
  source_table: string;
  contractor_name: string;
  project_name: string;
};

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

console.log(`Parsing ${sheetName} from ${excelPath}`);

const wb = XLSX.readFile(excelPath);
const sheet = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

console.log(`Found ${data.length} rows`);

const records: PairRecord[] = [];

for (const row of data) {
  if (!Array.isArray(row) || row.length === 0) continue;

  // First pair: columns 0 and 1
  const contractor1 = cleanValue(row[0]);
  const project1 = cleanValue(row[1]);
  if (contractor1) {
    records.push({
      source: "excel",
      source_table: sheetName,
      contractor_name: contractor1,
      project_name: project1,
    });
  }

  // Second pair: columns 3 and 4
  const contractor2 = cleanValue(row[3]);
  const project2 = cleanValue(row[4]);
  if (contractor2) {
    records.push({
      source: "excel",
      source_table: sheetName,
      contractor_name: contractor2,
      project_name: project2,
    });
  }
}

const headers = ["source", "source_table", "contractor_name", "project_name"];

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const csvLines = [
  headers.join(","),
  ...records.map((r) =>
    headers.map((h) => escapeCSV(r[h as keyof PairRecord] || "")).join(",")
  ),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Wrote ${records.length} records to ${outputPath}`);
