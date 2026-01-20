#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

interface CanonicalAccount {
  id: string;
  canonical_name: string;
  display_name: string;
  normalized_variants: string;
  raw_variant_count: string;
  source_count: string;
  record_count: string;
}

interface SharePointContractor {
  id: number;
  name: string;
  folder: string;
}

interface MatchResult {
  canonical_name: string;
  display_name: string;
  record_count: string;
  sp_name: string | null;
  sp_id: number | null;
  sp_folder: string | null;
  match_type: "EXACT" | "STARTS_WITH" | "NONE";
}

function normalizeForComparison(str: string): string {
  return str.toLowerCase().trim();
}

function findMatch(
  canonical: CanonicalAccount,
  sharePointContractors: SharePointContractor[]
): MatchResult {
  const canonicalNormalized = normalizeForComparison(canonical.canonical_name);
  const displayNormalized = normalizeForComparison(canonical.display_name);

  // First try exact matches
  for (const sp of sharePointContractors) {
    const spNormalized = normalizeForComparison(sp.name);

    if (
      spNormalized === canonicalNormalized ||
      spNormalized === displayNormalized
    ) {
      return {
        canonical_name: canonical.canonical_name,
        display_name: canonical.display_name,
        record_count: canonical.record_count,
        sp_name: sp.name,
        sp_id: sp.id,
        sp_folder: sp.folder,
        match_type: "EXACT",
      };
    }
  }

  // Then try starts_with matches
  for (const sp of sharePointContractors) {
    const spNormalized = normalizeForComparison(sp.name);

    // SP name starts with canonical
    if (
      spNormalized.startsWith(canonicalNormalized) ||
      canonicalNormalized.startsWith(spNormalized)
    ) {
      return {
        canonical_name: canonical.canonical_name,
        display_name: canonical.display_name,
        record_count: canonical.record_count,
        sp_name: sp.name,
        sp_id: sp.id,
        sp_folder: sp.folder,
        match_type: "STARTS_WITH",
      };
    }

    // SP name starts with display_name
    if (
      spNormalized.startsWith(displayNormalized) ||
      displayNormalized.startsWith(spNormalized)
    ) {
      return {
        canonical_name: canonical.canonical_name,
        display_name: canonical.display_name,
        record_count: canonical.record_count,
        sp_name: sp.name,
        sp_id: sp.id,
        sp_folder: sp.folder,
        match_type: "STARTS_WITH",
      };
    }
  }

  // No match found
  return {
    canonical_name: canonical.canonical_name,
    display_name: canonical.display_name,
    record_count: canonical.record_count,
    sp_name: null,
    sp_id: null,
    sp_folder: null,
    match_type: "NONE",
  };
}

function parseCSVLine(line: string): string[] {
  const row: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      const isEscapedQuote = insideQuotes && nextChar === '"';
      if (isEscapedQuote) {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(currentField.trim());
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField) {
    row.push(currentField.trim());
  }

  return row;
}

function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split("\n").filter((line) => line.trim());
  return lines.map((line) => parseCSVLine(line));
}

function main(): void {
  const options = parseArgs({
    options: {
      canonical: { type: "string" },
      db: { type: "string" },
      output: { type: "string" },
    },
  });

  const canonicalPath =
    options.values.canonical ||
    "/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/data/canonical/accounts_smart.csv";
  const dbPath =
    options.values.db ||
    "/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/contractors.db";
  const outputPath =
    options.values.output ||
    "/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/data/links/sharepoint_matches.csv";

  // Read canonical accounts
  console.log(`Reading canonical accounts from ${canonicalPath}...`);
  const csvContent = readFileSync(canonicalPath, "utf-8");
  const rows = parseCSV(csvContent);

  if (rows.length < 1) {
    console.error("No data found in CSV");
    process.exit(1);
  }

  const headers = rows[0];
  const canonicalAccounts: CanonicalAccount[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length >= headers.length) {
      const account: CanonicalAccount = {
        id: row[0],
        canonical_name: row[1],
        display_name: row[2],
        normalized_variants: row[3],
        raw_variant_count: row[4],
        source_count: row[5],
        record_count: row[6],
      };
      canonicalAccounts.push(account);
    }
  }

  console.log(`Loaded ${canonicalAccounts.length} canonical accounts`);

  // Query SharePoint contractors
  console.log(`Querying SharePoint contractors from ${dbPath}...`);
  const db = new Database(dbPath);
  const sharePointStmt = db.prepare(
    "SELECT id, name, folder FROM contractors WHERE source='sharepoint' ORDER BY name"
  );
  const sharePointContractors = sharePointStmt.all() as SharePointContractor[];
  console.log(`Loaded ${sharePointContractors.length} SharePoint contractors`);

  // Perform matching
  console.log("Performing matches...");
  const matches: MatchResult[] = [];

  for (const canonical of canonicalAccounts) {
    const match = findMatch(canonical, sharePointContractors);
    matches.push(match);
  }

  // Generate CSV output
  console.log(`Writing results to ${outputPath}...`);

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const csvOutput = [
    "canonical_name,display_name,record_count,sp_name,sp_id,sp_folder,match_type",
    ...matches.map((m) => {
      const fields = [
        m.canonical_name,
        m.display_name,
        m.record_count,
        m.sp_name || "",
        m.sp_id ? String(m.sp_id) : "",
        m.sp_folder || "",
        m.match_type,
      ];
      return fields
        .map((f) => `"${(f as string).replace(/"/g, '""')}"`)
        .join(",");
    }),
  ].join("\n");

  writeFileSync(outputPath, csvOutput, "utf-8");

  // Print statistics
  const exactMatches = matches.filter((m) => m.match_type === "EXACT").length;
  const startsWithMatches = matches.filter(
    (m) => m.match_type === "STARTS_WITH"
  ).length;
  const noMatches = matches.filter((m) => m.match_type === "NONE").length;

  console.log("\n=== MATCHING RESULTS ===");
  console.log(`Total canonical accounts: ${matches.length}`);
  console.log(`Exact matches: ${exactMatches}`);
  console.log(`Starts with matches: ${startsWithMatches}`);
  console.log(`No matches: ${noMatches}`);
  console.log(
    `Match rate: ${(((exactMatches + startsWithMatches) / matches.length) * 100).toFixed(1)}%`
  );
  console.log(`\nOutput saved to: ${outputPath}`);

  db.close();
}

main();
