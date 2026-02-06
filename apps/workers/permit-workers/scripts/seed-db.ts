/**
 * Seed databases from CSV files
 *
 * Seeds:
 * - company-permits.sqlite (companies + permits) from dustApplications_cleaned.csv
 * - marketing-permits.sqlite (scraped_permits) from dustApplicationSearch_converted.csv
 *
 * Usage: bun scripts/seed-db.ts
 */

import { resolve } from "node:path";
import { db as companyDb, upsertPermit } from "@/db/company-permits";
import { upsertScrapedPermit } from "@/db/marketing-permits";

const DATA_DIR = resolve(import.meta.dir, "../data/samples");
const BOM_REGEX = /^\uFEFF/;

interface CsvRow {
  [key: string]: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split("\n");
  const firstLine = lines[0];
  if (!firstLine) {
    return [];
  }

  // Handle BOM if present
  const headerLine = firstLine.replace(BOM_REGEX, "");

  // Parse header - handle quoted values
  const headers = parseQuotedLine(headerLine);

  return lines.slice(1).map((line) => {
    const values = parseQuotedLine(line);
    const row: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (key) {
        row[key] = values[i] ?? "";
      }
    }
    return row;
  });
}

function parseQuotedLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Seed script has inherent complexity
async function seedCompanyPermits() {
  const csvPath = resolve(DATA_DIR, "dustApplications_cleaned.csv");
  const content = await Bun.file(csvPath).text();
  const rows = parseCsv(content);

  console.log(`[company-permits] Seeding ${rows.length} records...`);

  // Extract unique companies first
  const companies = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const companyId = row["Company ID"];
    const companyName = row["Company Name"];
    if (companyId && companyName && !companies.has(companyId)) {
      companies.set(companyId, { id: companyId, name: companyName });
    }
  }

  // Insert companies
  for (const company of companies.values()) {
    companyDb.run("INSERT OR IGNORE INTO companies (id, name) VALUES (?, ?)", [
      company.id,
      company.name,
    ]);
  }
  console.log(`[company-permits] Inserted ${companies.size} companies`);

  // Insert permits
  let permitCount = 0;
  for (const row of rows) {
    const id = row["Dust Application ID"];
    if (!id) {
      continue;
    }

    upsertPermit({
      id,
      projectName: row["Project Name"] || null,
      companyId: row["Company ID"] || null,
      companyName: row["Company Name"] || null,
      status: row.Status || null,
      submittedDate: row["Submitted Date"] || null,
      effectiveDate: row["Effective Date"] || null,
      expirationDate: row["Expiration Date"] || null,
      closedDate: row["Closed Date"] || null,
      previousAppId: row["Previous Dust Application No."] || null,
      projectStartDate: row["Project Start Date"] || null,
      projectEndDate: row["Project Completion Date"] || null,
      address: row["Project Address"] || null,
      city: row["Project City"] || null,
      parcel: row["Parcel No."] || null,
      isBlockPermit: row["Block Permit?"] === "Yes",
      isAccelerated: row["Accelerated?"] === "Yes",
    });
    permitCount++;
  }
  console.log(`[company-permits] Inserted ${permitCount} permits`);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Seed script has inherent complexity
async function seedMarketingPermits() {
  const csvPath = resolve(DATA_DIR, "dustApplicationSearch_converted.csv");
  const content = await Bun.file(csvPath).text();
  const rows = parseCsv(content);

  console.log(`[marketing-permits] Seeding ${rows.length} records...`);

  let count = 0;
  for (const row of rows) {
    const id = row["Dust Application ID"];
    if (!id) {
      continue;
    }

    upsertScrapedPermit({
      id,
      projectName: row["Project Name"] || null,
      companyId: row["Company ID"] || null,
      companyName: row["Company Name"] || null,
      status: row.Status || null,
      submittedDate: row["Submitted Date"] || null,
      effectiveDate: row["Effective Date"] || null,
      expirationDate: row["Expiration Date"] || null,
      closedDate: row["Closed Date"] || null,
      previousAppId: row["Previous Dust Application No."] || null,
      projectStartDate: row["Project Start Date"] || null,
      projectEndDate: row["Project Completion Date"] || null,
      address: row["Project Address"] || null,
      city: row["Project City"] || null,
      parcel: row["Parcel No."] || null,
      isBlockPermit: row["Block Permit?"] === "Yes",
      isAccelerated: row["Accelerated?"] === "Yes",
      invoiceNumber: row["Invoice Number"] || null,
      invoiceCharges: row["Invoice Charges"]
        ? Number.parseFloat(row["Invoice Charges"])
        : null,
      invoiceBalance: row["Invoice Balance"]
        ? Number.parseFloat(row["Invoice Balance"])
        : null,
    });
    count++;
  }
  console.log(`[marketing-permits] Inserted ${count} scraped permits`);
}

async function main() {
  console.log("Starting database seed...\n");

  await seedCompanyPermits();
  console.log();
  await seedMarketingPermits();

  console.log("\nSeed complete!");
}

main().catch(console.error);
