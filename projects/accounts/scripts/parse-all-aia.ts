#!/usr/bin/env bun
/**
 * Parse ALL AIA jobs folders
 * Usage: bun run parse-all-aia.ts <aia_jobs_path> <output_dir>
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, extname, join } from "path";

const aiaBasePath =
  process.argv[2] || "/Users/chiejimofor/Downloads/aia jobs/AIA JOBS";
const outputDir = process.argv[3] || "projects/accounts/data/raw";

type AIARecord = {
  source: string;
  contractor_name: string;
  project_name: string;
  billing_period: string;
  is_completed: number;
  file_type: string;
  file_path: string;
};

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
    const pattern = new RegExp(`${month}\\s*(\\d{2,4})`, "i");
    const match = nameWithoutExt.match(pattern);
    if (match) {
      const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
      let year = match[1];
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

function parseContractorFolder(
  basePath: string,
  contractorName: string
): AIARecord[] {
  const records: AIARecord[] = [];

  function walkDir(dir: string, currentProject: string | null = null) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        const isCompleted =
          entry.toLowerCase().startsWith("zzz") ||
          entry.toLowerCase().includes("completed");

        if (isCompleted) {
          // Look inside for actual projects
          const subEntries = readdirSync(fullPath).filter(
            (e) => !e.startsWith(".")
          );
          for (const sub of subEntries) {
            const subPath = join(fullPath, sub);
            const subStat = statSync(subPath);
            if (subStat.isDirectory()) {
              walkDir(subPath, sub);
            }
          }
        } else {
          // This is a project folder
          walkDir(fullPath, entry);
        }
      } else {
        const ext = extname(entry).toLowerCase().replace(".", "");
        if (!["xls", "xlsx", "pdf", "doc", "docx"].includes(ext)) continue;

        let projectName = currentProject || "";

        // If file is at contractor root (no project folder)
        if (!projectName && dirname(fullPath) === basePath) {
          projectName = "";
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

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// Main execution
console.log(`Scanning AIA JOBS from: ${aiaBasePath}`);

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const contractors = readdirSync(aiaBasePath).filter(
  (e) => !e.startsWith(".") && statSync(join(aiaBasePath, e)).isDirectory()
);

console.log(`Found ${contractors.length} contractor folders`);

const allRecords: AIARecord[] = [];

for (const contractor of contractors) {
  const contractorPath = join(aiaBasePath, contractor);
  const records = parseContractorFolder(contractorPath, contractor);
  allRecords.push(...records);
  console.log(`  ${contractor}: ${records.length} records`);
}

// Write combined CSV
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
  ...allRecords.map((r) =>
    headers
      .map((h) => escapeCSV(String(r[h as keyof AIARecord] ?? "")))
      .join(",")
  ),
];

const outputPath = join(outputDir, "aia_all.csv");
writeFileSync(outputPath, csvLines.join("\n"));
console.log(`\nWrote ${allRecords.length} total records to ${outputPath}`);
