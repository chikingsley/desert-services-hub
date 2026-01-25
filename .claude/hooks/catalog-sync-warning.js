#!/usr/bin/env node

/**
 * Hook: Warn when catalog files are edited
 * Reminds to keep pricing CSV and catalog.ts in sync
 */

const CATALOG_FILES = {
  csv: "docs/desert-services-2026-pricing.csv",
  ts: "services/quoting/catalog.ts",
};

// Read the tool result from stdin
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  try {
    const event = JSON.parse(input);
    const filePath = event.tool_input?.file_path || "";

    const editedCsv = filePath.includes(CATALOG_FILES.csv);
    const editedTs = filePath.includes(CATALOG_FILES.ts);

    if (editedCsv) {
      console.log(
        JSON.stringify({
          result: "continue",
          message: `Catalog CSV edited. Remember to also update: ${CATALOG_FILES.ts}`,
        })
      );
    } else if (editedTs) {
      console.log(
        JSON.stringify({
          result: "continue",
          message: `Catalog TS edited. Remember to also update: ${CATALOG_FILES.csv}`,
        })
      );
    }
  } catch {
    // Silent fail - don't block on parse errors
  }
});
