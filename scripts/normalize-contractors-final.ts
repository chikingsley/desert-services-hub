import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFileSync, writeFileSync } from "fs";

interface SmartRecord {
  id: string;
  canonical_name: string;
  display_name: string;
  normalized_variants: string;
  raw_variant_count: string;
  source_count: string;
  record_count: string;
}

interface NormalizedContractor {
  id: string;
  base_name: string;
  display_name: string;
  total_records: number;
  variant_count: number;
  source_count: number;
  all_variants_pipe_separated: string;
}

function extractCoreCompanyName(
  canonicalName: string,
  _displayName: string,
  variants: string
): string {
  // Start with canonical name
  let core = canonicalName.trim().toLowerCase();

  // Remove all job references
  core = core.replace(/\s*job\s+[\w-]+\s*/gi, " ");

  // Remove email references (e.g., "cor to email@domain")
  core = core.replace(/\s*cor\s+to\s+[\w.@-]+\s*/gi, " ");
  core = core.replace(/\s*[\w.@-]+@[\w.@-]+\s*/gi, " ");

  // Remove phone numbers (various formats)
  core = core.replace(/\s*\(?[\d\s\-.)]+\s*/g, " ");

  // Remove common billing/instruction notes
  core = core.replace(/\s*\(\s*need\s+po[\w\s'#]*\s*\)\s*/gi, " ");
  core = core.replace(/\s*need\s+po[\w\s'#]*\s*/gi, " ");
  core = core.replace(/\s*send\s+tickets\s*/gi, " ");
  core = core.replace(/\s*need\s+name\s+called\s+in\s*/gi, " ");
  core = core.replace(/\s*might\s+not\s+inspect\s*/gi, " ");

  // Remove time minimums and similar instructions
  core = core.replace(/\s*\d+\s*hr\s*min[\w\s]*\s*/gi, " ");
  core = core.replace(/\s*\d+\s*hour\s+min[\w\s]*\s*/gi, " ");
  core = core.replace(/\s*3\s*hour[\w\s]*\s*/gi, " ");

  // Remove address references (common suffixes)
  core = core.replace(/\s+\d+\s+\w+\s+\w+\s+ave.*$/i, " ");
  core = core.replace(/\s+\d+\s+s\s+\w+\s+ave.*$/i, " ");

  // Remove trailing suffixes
  core = core.replace(/\s+-\s*bd\s*$/i, " ");
  core = core.replace(/\s+-\s*[a-z0-9]+\s*$/i, " ");
  core = core.replace(/\s+cor\s*$/i, " ");

  // Extract additional variants to find common base
  if (variants) {
    const variantList = variants.split("|").map((v) => v.trim().toLowerCase());

    // Find common prefix among all variants
    if (variantList.length > 0) {
      const minLength = Math.min(
        ...variantList.map((v) => v.split(/\s+/)[0].length)
      );
      const firstWords = variantList.map((v) => v.split(/\s+/)[0]);

      // Find the longest common prefix
      let commonPrefix = firstWords[0].substring(0, minLength);
      for (const word of firstWords) {
        let i = 0;
        while (
          i < commonPrefix.length &&
          i < word.length &&
          commonPrefix[i] === word[i]
        ) {
          i++;
        }
        commonPrefix = commonPrefix.substring(0, i);
      }

      if (commonPrefix.length >= 3) {
        core = commonPrefix;
      }
    }
  }

  // Normalize whitespace and clean up
  core = core.replace(/\s+/g, " ").trim().toLowerCase();

  return core || canonicalName.toLowerCase();
}

function cleanDisplayName(displayName: string): string {
  // Get the base company name first - take the first meaningful part
  let clean = displayName.trim();

  // Extract just the company name portion by taking up to the first parenthesis or special marker
  const baseMatch = clean.match(/^([^(]+?)(?:\s*\(|$)/);
  if (baseMatch) {
    clean = baseMatch[1].trim();
  }

  // Remove any remaining job references
  clean = clean.replace(/\s*job[\w\s\-#']*$/gi, "");

  // Remove any remaining contact info
  clean = clean.replace(/\s*[\w\s]+\s+\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\s*$/gi, "");

  // Clean up extra whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  return clean || displayName;
}

function extractAllVariants(variants: string): string[] {
  if (!variants) return [];

  return variants
    .split("|")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

async function main() {
  // Read the CSV file
  const filePath =
    "/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/data/canonical/accounts_smart.csv";
  const fileContent = readFileSync(filePath, "utf-8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  }) as SmartRecord[];

  // Group by cleaned base name
  const groupedMap = new Map<string, NormalizedContractor>();

  for (const record of records) {
    const baseName = extractCoreCompanyName(
      record.canonical_name,
      record.display_name,
      record.normalized_variants
    );

    // Collect all variants for this record
    const variants = extractAllVariants(record.normalized_variants);
    const recordCount = Number.parseInt(record.record_count, 10) || 0;
    const sourceCount = Number.parseInt(record.source_count, 10) || 0;

    if (groupedMap.has(baseName)) {
      // Merge with existing entry
      const existing = groupedMap.get(baseName)!;
      existing.total_records += recordCount;
      existing.source_count = Math.max(existing.source_count, sourceCount);

      // Merge variants - deduplicate
      const existingVariants = existing.all_variants_pipe_separated
        .split(" | ")
        .map((v) => v.trim());
      const allVariants = new Set([...existingVariants, ...variants]);
      existing.all_variants_pipe_separated =
        Array.from(allVariants).join(" | ");
      existing.variant_count = allVariants.size;

      // Update display name to use the longest/most complete one
      if (record.display_name.length > existing.display_name.length) {
        existing.display_name = record.display_name;
      }
    } else {
      // Create new entry
      groupedMap.set(baseName, {
        id: record.id,
        base_name: baseName,
        display_name: record.display_name,
        total_records: recordCount,
        variant_count: variants.length,
        source_count: sourceCount,
        all_variants_pipe_separated: variants.join(" | "),
      });
    }
  }

  // Convert map to array and sort by total_records descending
  const normalized = Array.from(groupedMap.values()).sort(
    (a, b) => b.total_records - a.total_records
  );

  // Clean up display names
  for (const contractor of normalized) {
    contractor.display_name = cleanDisplayName(contractor.display_name);
  }

  // Assign sequential IDs
  for (let i = 0; i < normalized.length; i++) {
    normalized[i].id = String(i + 1);
  }

  // Write output CSV
  const outputPath =
    "/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/data/canonical/accounts_final.csv";

  const csv = stringify(normalized, {
    header: true,
    columns: [
      "id",
      "base_name",
      "display_name",
      "total_records",
      "variant_count",
      "source_count",
      "all_variants_pipe_separated",
    ],
  });

  writeFileSync(outputPath, csv);

  console.log(`
Processing Complete!
- Input records: ${records.length}
- Unique contractors (after merging): ${normalized.length}
- Reduction: ${records.length - normalized.length} entries merged
- Output: ${outputPath}

Top 15 contractors by record count:
${normalized
  .slice(0, 15)
  .map(
    (c, i) =>
      `  ${i + 1}. ${c.display_name} (${c.total_records} records, ${c.variant_count} variants)`
  )
  .join("\n")}
  `);
}

main().catch(console.error);
