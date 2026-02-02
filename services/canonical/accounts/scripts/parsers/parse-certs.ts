#!/usr/bin/env bun
/**
 * Parse insurance certificate filenames from a folder
 * Usage: bun run parse-certs.ts <folder_path> <output_csv>
 */

import { readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const folderPath = process.argv[2];
const outputPath = process.argv[3];

if (!(folderPath && outputPath)) {
  console.error("Usage: bun run parse-certs.ts <folder_path> <output_csv>");
  process.exit(1);
}

type CertRecord = {
  source: string;
  folder_type: string;
  contractor_name: string;
  project_name: string;
  has_wos: number;
  file_year: string;
  file_path: string;
};

function parseCertFilename(
  filename: string
): { contractor: string; project: string } | null {
  // Remove .pdf extension
  const name = filename.replace(/\.pdf$/i, "");

  // Remove duplicate suffixes like " 2", " (2)"
  const cleaned = name.replace(/\s*(\d|\(\d\))$/, "").trim();

  // Skip internal Desert Services documents (not contractor certs)
  const skipPatterns = [
    /desert services/i,
    /emod worksheet/i,
    /loss run/i,
    /emr cap letter/i,
  ];
  for (const pattern of skipPatterns) {
    if (pattern.test(cleaned)) return null;
  }

  // Split on " - " (space-dash-space)
  const parts = cleaned.split(" - ");

  if (parts.length === 0) return null;

  const contractor = parts[0].trim();
  const project = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";

  return { contractor, project };
}

function getFolderType(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.includes("/wos/")) return "WOS";
  if (lowerPath.includes("/non wos/") || lowerPath.includes("/non_wos/"))
    return "NON_WOS";
  if (lowerPath.includes("expired")) return "EXPIRED";
  return "UNKNOWN";
}

function getFileYear(path: string): string {
  // Look for year pattern in path
  const yearMatch = path.match(/\b(20\d{2})\b/);
  return yearMatch ? yearMatch[1] : "";
}

function walkDir(dir: string, results: CertRecord[] = []): CertRecord[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.toLowerCase().endsWith(".pdf")) {
      const parsed = parseCertFilename(entry);

      if (parsed && parsed.contractor) {
        results.push({
          source: "insurance_certs",
          folder_type: getFolderType(fullPath),
          contractor_name: parsed.contractor,
          project_name: parsed.project,
          has_wos: getFolderType(fullPath) === "WOS" ? 1 : 0,
          file_year: getFileYear(fullPath),
          file_path: fullPath,
        });
      }
    }
  }

  return results;
}

// Main execution
console.log(`Parsing certificates from: ${folderPath}`);
const records = walkDir(folderPath);

// Write CSV
const headers = [
  "source",
  "folder_type",
  "contractor_name",
  "project_name",
  "has_wos",
  "file_year",
  "file_path",
];
const csvLines = [
  headers.join(","),
  ...records.map((r) =>
    headers
      .map((h) => {
        const val = r[h as keyof CertRecord];
        // Escape commas and quotes in values
        const str = String(val ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  ),
];

writeFileSync(outputPath, csvLines.join("\n"));
console.log(`Wrote ${records.length} records to ${outputPath}`);
