#!/usr/bin/env bun
/**
 * Parse customer sign PDFs from Downloads folder
 * Pattern: {Contractor Name} - {Project Reference}.pdf
 * Usage: bun run parse-signs.ts <output_csv>
 */

import { readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const outputPath = process.argv[2] || "projects/accounts/data/raw/signs.csv";
const downloadsPath = "/Users/chiejimofor/Downloads";

type SignRecord = {
  source: string;
  contractor_name: string;
  project_reference: string;
  file_name: string;
  file_path: string;
};

function parseSignFilename(
  filename: string
): { contractor: string; project: string } | null {
  // Remove .pdf extension
  const name = filename.replace(/\.pdf$/i, "");

  // Remove duplicate suffixes like " (2)", " 2"
  const cleaned = name
    .replace(/\s*\(\d+\)$/, "")
    .replace(/\s+\d+$/, "")
    .trim();

  // Split on " - " (space-dash-space)
  const parts = cleaned.split(" - ");

  if (parts.length < 2) return null;

  const contractor = parts[0].trim();
  const project = parts.slice(1).join(" - ").trim();

  // Filter out non-sign files
  const skipPatterns = [
    /^desert services/i,
    /^construction contract/i,
    /^subcontract/i,
    /loss run/i,
    /emod/i,
    /emr/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(contractor) || pattern.test(filename)) {
      return null;
    }
  }

  return { contractor, project };
}

// Main execution
console.log(`Scanning Downloads for sign PDFs: ${downloadsPath}`);

const records: SignRecord[] = [];

// Get PDFs directly in Downloads (not in subfolders)
const entries = readdirSync(downloadsPath);

for (const entry of entries) {
  if (!entry.toLowerCase().endsWith(".pdf")) continue;

  const fullPath = join(downloadsPath, entry);
  const stat = statSync(fullPath);

  if (!stat.isFile()) continue;

  const parsed = parseSignFilename(entry);

  if (parsed && parsed.contractor && parsed.project) {
    records.push({
      source: "customer_signs",
      contractor_name: parsed.contractor,
      project_reference: parsed.project,
      file_name: entry,
      file_path: fullPath,
    });
  }
}

// Write CSV
const headers = [
  "source",
  "contractor_name",
  "project_reference",
  "file_name",
  "file_path",
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
    headers.map((h) => escapeCSV(r[h as keyof SignRecord] || "")).join(",")
  ),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Found ${records.length} sign PDFs`);
console.log(`Wrote to ${outputPath}`);
