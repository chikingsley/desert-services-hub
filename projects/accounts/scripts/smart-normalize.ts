#!/usr/bin/env bun
/**
 * Smart contractor name normalizer with fuzzy matching
 * Detects when one name is a substring of another, merging them
 *
 * Usage: bun run smart-normalize.ts
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const RAW_DIR = "projects/accounts/data/raw";
const OUTPUT_DIR = "projects/accounts/data/canonical";

// Common suffixes to remove
const SUFFIXES_PATTERN =
  /,?\s*(inc\.?|llc\.?|corp\.?|co\.?|company|corporation|l\.l\.c\.?|incorporated|construction|builders?|contracting|contractor|general\s*contractors?|development|enterprises?|services?|group|holdings?)\.?$/gi;

// Normalize a contractor name for matching
function normalize(name: string): string {
  let n = name.toLowerCase().trim();

  // Remove common suffixes (multiple passes to catch nested ones)
  for (let i = 0; i < 3; i++) {
    n = n.replace(SUFFIXES_PATTERN, "").trim();
  }

  // Remove punctuation except spaces and hyphens
  n = n.replace(/[^\w\s-]/g, "");

  // Collapse multiple spaces
  n = n.replace(/\s+/g, " ").trim();

  return n;
}

// Common prefixes that shouldn't be used for matching on their own
const COMMON_PREFIXES = new Set([
  "desert",
  "arizona",
  "phoenix",
  "southwest",
  "western",
  "american",
  "national",
  "united",
  "premier",
  "valley",
  "sun",
  "first",
  "custom",
  "modern",
]);

// Check if name A is likely the same entity as name B
// VERY CONSERVATIVE: only exact substring matching with strict length requirements
function isSameEntity(a: string, b: string): boolean {
  if (a === b) return true;

  // Skip very short names (less than 5 chars)
  if (a.length < 5 || b.length < 5) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];

  // Don't match if the shorter name is just a common prefix
  if (COMMON_PREFIXES.has(shorter)) return false;

  // Only match if shorter is a substring at the START of longer
  // This catches: "willmeng" in "willmeng construction"
  // But NOT: "core" in "hardcore" or "scorecard"
  if (!longer.startsWith(shorter)) return false;

  // The character after the shorter string should be a space or end of string
  // This prevents "core" matching "coreconstruction" (no space)
  // but allows "core" matching "core construction" (has space)
  if (longer.length > shorter.length) {
    const nextChar = longer[shorter.length];
    if (nextChar !== " " && nextChar !== "-") return false;
  }

  // The shorter must be at least 50% of the longer's length,
  // and shorter must be at least 6 characters
  const ratio = shorter.length / longer.length;
  if (ratio >= 0.5 && shorter.length >= 6) {
    return true;
  }

  return false;
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

// Union-Find data structure for grouping
class UnionFind {
  parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX !== rootY) {
      // Prefer shorter name as root (it's more canonical)
      if (rootX.length <= rootY.length) {
        this.parent.set(rootY, rootX);
      } else {
        this.parent.set(rootX, rootY);
      }
    }
  }
}

// Main
console.log("=== SMART CONTRACTOR NAME NORMALIZATION ===\n");

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

// Group by normalized name first
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

console.log(`\nAfter basic normalization: ${byNormalized.size} unique names`);

// Now do smart grouping using Union-Find
const uf = new UnionFind();
const normalizedNames = Array.from(byNormalized.keys());

console.log("\nFinding similar names (this may take a moment)...");

let mergeCount = 0;
// Compare each pair of names
for (let i = 0; i < normalizedNames.length; i++) {
  for (let j = i + 1; j < normalizedNames.length; j++) {
    const nameA = normalizedNames[i];
    const nameB = normalizedNames[j];

    if (isSameEntity(nameA, nameB)) {
      uf.union(nameA, nameB);
      mergeCount++;
    }
  }
}

console.log(`Found ${mergeCount} name pairs to merge`);

// Group by canonical name (union-find root)
const canonical = new Map<
  string,
  {
    normalized: Set<string>;
    raw: Set<string>;
    sources: Set<string>;
    count: number;
  }
>();

for (const [normalized, data] of byNormalized) {
  const root = uf.find(normalized);

  const existing = canonical.get(root);
  if (existing) {
    existing.normalized.add(normalized);
    for (const r of data.raw) existing.raw.add(r);
    for (const s of data.sources) existing.sources.add(s);
    existing.count += data.count;
  } else {
    canonical.set(root, {
      normalized: new Set([normalized]),
      raw: new Set(data.raw),
      sources: new Set(data.sources),
      count: data.count,
    });
  }
}

console.log(`\nAfter smart grouping: ${canonical.size} unique contractors`);
console.log(
  `Reduction: ${byNormalized.size} → ${canonical.size} (${byNormalized.size - canonical.size} merged)`
);

// Find interesting merges (names that got grouped together)
const interestingMerges: {
  canonical: string;
  merged: string[];
  count: number;
}[] = [];

for (const [canonicalName, data] of canonical) {
  if (data.normalized.size > 1) {
    interestingMerges.push({
      canonical: canonicalName,
      merged: Array.from(data.normalized),
      count: data.count,
    });
  }
}

interestingMerges.sort((a, b) => b.count - a.count);

console.log(`\n=== TOP 30 MERGED GROUPS ===\n`);

for (const item of interestingMerges.slice(0, 30)) {
  console.log(`"${item.canonical}" (${item.count} records)`);
  console.log(`  Merged: ${item.merged.join(" | ")}`);
  console.log("");
}

// Write canonical accounts CSV
type CanonicalAccount = {
  id: number;
  canonical_name: string;
  display_name: string;
  normalized_variants: string;
  raw_variant_count: number;
  source_count: number;
  record_count: number;
};

const canonicalAccounts: CanonicalAccount[] = [];

let id = 1;
for (const [canonicalName, data] of canonical) {
  // Pick the most common raw name as display name
  const rawCounts = new Map<string, number>();
  for (const c of allContractors) {
    const root = uf.find(c.normalized);
    if (root === canonicalName) {
      rawCounts.set(c.raw, (rawCounts.get(c.raw) || 0) + 1);
    }
  }

  let displayName = canonicalName;
  let maxCount = 0;
  for (const [raw, count] of rawCounts) {
    if (count > maxCount) {
      maxCount = count;
      displayName = raw;
    }
  }

  canonicalAccounts.push({
    id: id++,
    canonical_name: canonicalName,
    display_name: displayName,
    normalized_variants: Array.from(data.normalized).join(" | "),
    raw_variant_count: data.raw.size,
    source_count: data.sources.size,
    record_count: data.count,
  });
}

// Sort by record count descending
canonicalAccounts.sort((a, b) => b.record_count - a.record_count);

// Reassign IDs after sort
for (const [i, a] of canonicalAccounts.entries()) {
  a.id = i + 1;
}

// Write CSV
const headers = [
  "id",
  "canonical_name",
  "display_name",
  "normalized_variants",
  "raw_variant_count",
  "source_count",
  "record_count",
];
const csvLines = [
  headers.join(","),
  ...canonicalAccounts.map((a) =>
    headers
      .map((h) => {
        const val = String(a[h as keyof CanonicalAccount] || "");
        return val.includes(",") || val.includes('"')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      })
      .join(",")
  ),
];

writeFileSync(join(OUTPUT_DIR, "accounts_smart.csv"), csvLines.join("\n"));
console.log(
  `\nWrote ${canonicalAccounts.length} canonical accounts to ${OUTPUT_DIR}/accounts_smart.csv`
);

// Summary stats
console.log("\n=== SUMMARY ===");
console.log(`Total records processed: ${allContractors.length}`);
console.log(`After basic normalization: ${byNormalized.size}`);
console.log(`After smart grouping: ${canonical.size}`);
console.log(`Groups with multiple variants: ${interestingMerges.length}`);
console.log(
  `Top contractor by records: "${canonicalAccounts[0]?.display_name}" (${canonicalAccounts[0]?.record_count} records)`
);
