#!/usr/bin/env bun

import { runExtractProcurement } from "./extract-procurement/main";

export { runExtractProcurement } from "./extract-procurement/main";

if (import.meta.main) {
  runExtractProcurement(process.argv.includes("--dry-run")).catch((error) => {
    console.error("Extraction failed:", error);
    process.exit(1);
  });
}
