#!/usr/bin/env bun
/**
 * Simple contractor name normalizer
 * Reads all CSVs, extracts contractor names, normalizes them, groups by normalized name
 *
 * Usage: bun run normalize-contractors.ts
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const RAW_DIR = "projects/accounts/data/raw";
const OUTPUT_DIR = "projects/accounts/data/canonical";

// Normalize a contractor name for matching
function normalize(name: string): string {
  let n = name.toLowerCase().trim();

  // Remove common suffixes
  n = n.replace(
    /,?\s*(inc\.?|llc\.?|corp\.?|co\.?|company|corporation|l\.l\.c\.?|incorporated)\.?$/gi,
    ""
  );

  // Remove "construction", "builders", "contracting" etc (but keep as variant)
  // Actually, let's keep these for now to avoid over-normalizing

  // Remove punctuation except spaces and hyphens
  n = n.replace(/[^\w\s-]/g, "");

  // Collapse multiple spaces
  n = n.replace(/\s+/g, " ").trim();

  return n;
}

// Parse a CSV file and extract contractor names
function extractContractors(
  filePath: string
): { source: string; raw: string; normalized: string }[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const contractorIdx = headers.findIndex(
    (h) => h === "contractor_name" || h === "name" || h === "customer"
  );

  if (contractorIdx === -1) return [];

  const source = filePath.split("/").pop()?.replace(".csv", "") || "unknown";
  const results: { source: string; raw: string; normalized: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);
    const raw = fields[contractorIdx]?.trim();
    if (raw) {
      results.push({
        source,
        raw,
        normalized: normalize(raw),
      });
    }
  }

  return results;
}

// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
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
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// Main
console.log("=== CONTRACTOR NAME NORMALIZATION ===\n");

// Collect all contractors from all CSVs
const allContractors: { source: string; raw: string; normalized: string }[] =
  [];

const csvFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith(".csv"));
console.log(`Found ${csvFiles.length} CSV files\n`);

for (const file of csvFiles) {
  const filePath = join(RAW_DIR, file);
  const contractors = extractContractors(filePath);
  allContractors.push(...contractors);
  console.log(`  ${file}: ${contractors.length} contractor records`);
}

console.log(`\nTotal contractor records: ${allContractors.length}`);

// Group by normalized name
const byNormalized = new Map<
  string,
  { raw: Set<string>; sources: Set<string>; count: number }
>();

for (const c of allContractors) {
  if (!c.normalized) continue;

  const existing = byNormalized.get(c.normalized);
  if (existing) {
    existing.raw.add(c.raw);
    existing.sources.add(c.source);
    existing.count++;
  } else {
    byNormalized.set(c.normalized, {
      raw: new Set([c.raw]),
      sources: new Set([c.source]),
      count: 1,
    });
  }
}

console.log(`Unique normalized names: ${byNormalized.size}`);

// Find names with multiple spellings (interesting cases)
const multipleSpellings: {
  normalized: string;
  variants: string[];
  sources: string[];
  count: number;
}[] = [];

for (const [normalized, data] of byNormalized) {
  if (data.raw.size > 1) {
    multipleSpellings.push({
      normalized,
      variants: Array.from(data.raw),
      sources: Array.from(data.sources),
      count: data.count,
    });
  }
}

multipleSpellings.sort((a, b) => b.count - a.count);

console.log(`\nNames with multiple spellings: ${multipleSpellings.length}`);
console.log("\n=== TOP 20 NAMES WITH VARIANT SPELLINGS ===\n");

for (const item of multipleSpellings.slice(0, 20)) {
  console.log(
    `"${item.normalized}" (${item.count} records across ${item.sources.length} sources)`
  );
  console.log(
    `  Variants: ${item.variants.slice(0, 5).join(" | ")}${item.variants.length > 5 ? ` ... +${item.variants.length - 5} more` : ""}`
  );
  console.log("");
}

// Write canonical accounts CSV
const canonicalAccounts: {
  id: number;
  normalized_name: string;
  display_name: string;
  variant_count: number;
  source_count: number;
  record_count: number;
}[] = [];

let id = 1;
for (const [normalized, data] of byNormalized) {
  // Pick the most common raw name as display name
  const rawCounts = new Map<string, number>();
  for (const c of allContractors) {
    if (c.normalized === normalized) {
      rawCounts.set(c.raw, (rawCounts.get(c.raw) || 0) + 1);
    }
  }
  let displayName = normalized;
  let maxCount = 0;
  for (const [raw, count] of rawCounts) {
    if (count > maxCount) {
      maxCount = count;
      displayName = raw;
    }
  }

  canonicalAccounts.push({
    id: id++,
    normalized_name: normalized,
    display_name: displayName,
    variant_count: data.raw.size,
    source_count: data.sources.size,
    record_count: data.count,
  });
}

// Sort by record count descending
canonicalAccounts.sort((a, b) => b.record_count - a.record_count);

// Reassign IDs after sort
canonicalAccounts.forEach((a, i) => (a.id = i + 1));

// Write CSV
const headers = [
  "id",
  "normalized_name",
  "display_name",
  "variant_count",
  "source_count",
  "record_count",
];
const csvLines = [
  headers.join(","),
  ...canonicalAccounts.map((a) =>
    headers
      .map((h) => {
        const val = String(a[h as keyof typeof a] || "");
        return val.includes(",") || val.includes('"')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      })
      .join(",")
  ),
];

writeFileSync(join(OUTPUT_DIR, "accounts.csv"), csvLines.join("\n"));
console.log(
  `\nWrote ${canonicalAccounts.length} canonical accounts to ${OUTPUT_DIR}/accounts.csv`
);

// Summary stats
console.log("\n=== SUMMARY ===");
console.log(`Total records processed: ${allContractors.length}`);
console.log(`Unique contractors (normalized): ${byNormalized.size}`);
console.log(`With multiple spellings: ${multipleSpellings.length}`);
console.log(
  `Top contractor by records: "${canonicalAccounts[0]?.display_name}" (${canonicalAccounts[0]?.record_count} records)`
);
