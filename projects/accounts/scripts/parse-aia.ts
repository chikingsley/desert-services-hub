#!/usr/bin/env bun
/**
 * Parse AIA jobs folder structure
 * Usage: bun run parse-aia.ts <folder_path> <output_csv>
 */

import { readdirSync, statSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";

const folderPath = process.argv[2];
const outputPath = process.argv[3];

if (!(folderPath && outputPath)) {
  console.error("Usage: bun run parse-aia.ts <folder_path> <output_csv>");
  process.exit(1);
}

type AIARecord = {
  source: string;
  contractor_name: string;
  project_name: string;
  billing_period: string;
  is_completed: number;
  file_type: string;
  file_path: string;
};

// Months for billing period detection
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function parseBillingPeriod(filename: string): string {
  const lower = filename.toLowerCase();
  const nameWithoutExt = lower.replace(/\.\w+$/, "");

  for (const month of MONTHS) {
    // Match patterns like "March 2021" or "march2021" or "march 21"
    const pattern = new RegExp(`${month}\\s*(\\d{2,4})`, "i");
    const match = nameWithoutExt.match(pattern);
    if (match) {
      const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
      let year = match[1];
      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        year = Number.parseInt(year) > 50 ? `19${year}` : `20${year}`;
      }
      return `${monthCap} ${year}`;
    }
  }

  return "";
}

function isCompletedFolder(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes("zzz") || lower.includes("completed");
}

function parseAIAFolder(basePath: string, contractorName: string): AIARecord[] {
  const records: AIARecord[] = [];

  function walkDir(dir: string, currentProject: string | null = null) {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      // Skip hidden files
      if (entry.startsWith(".")) continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // This is a project folder (or completed jobs folder)
        const projectName =
          entry.startsWith("zzz") || entry.toLowerCase().includes("completed")
            ? null // Completed jobs container, look inside for actual projects
            : entry;

        if (projectName) {
          // This is an actual project folder
          walkDir(fullPath, projectName);
        } else {
          // This is a "completed" container, recurse into it
          walkDir(fullPath, currentProject);
        }
      } else {
        // This is a file
        const ext = extname(entry).toLowerCase().replace(".", "");

        // Skip non-relevant files
        if (!["xls", "xlsx", "pdf", "doc", "docx"].includes(ext)) continue;

        // Determine project name
        let projectName = currentProject || "";

        // If no project from folder, try to get it from parent folder
        if (!projectName) {
          const parentDir = dirname(fullPath);
          const parentName = basename(parentDir);
          // Check if parent is the contractor folder
          if (
            parentName !== contractorName &&
            !parentName.toLowerCase().includes("zzz")
          ) {
            projectName = parentName;
          }
        }

        records.push({
          source: "aia_jobs",
          contractor_name: contractorName,
          project_name: projectName,
          billing_period: parseBillingPeriod(entry),
          is_completed: isCompletedFolder(fullPath) ? 1 : 0,
          file_type: ext,
          file_path: fullPath,
        });
      }
    }
  }

  walkDir(basePath);
  return records;
}

// Main execution
console.log(`Parsing AIA jobs from: ${folderPath}`);
const contractorName = basename(folderPath);
const records = parseAIAFolder(folderPath, contractorName);

// Write CSV
const headers = [
  "source",
  "contractor_name",
  "project_name",
  "billing_period",
  "is_completed",
  "file_type",
  "file_path",
];
const csvLines = [
  headers.join(","),
  ...records.map((r) =>
    headers
      .map((h) => {
        const val = r[h as keyof AIARecord];
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
