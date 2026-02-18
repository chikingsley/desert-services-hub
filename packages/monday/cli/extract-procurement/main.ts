import { Database } from "bun:sqlite";
import {
  extractBidsSent,
  extractChecklist,
  extractDustPermits,
  extractInspections,
  extractOpenBids,
  extractSignage,
  extractSwpppMaster,
} from "./extractors";
import { BOARDS, DB_PATH } from "./schema";
import { createTables } from "./tables";

interface Counts {
  [key: string]: number;
}

export async function runExtractProcurement(dryRun: boolean): Promise<void> {
  console.log("=".repeat(60));
  console.log("PROCUREMENT WORKSPACE EXTRACTION");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Output: ${DB_PATH}`);
  console.log();

  if (dryRun) {
    console.log("Dry run - would extract from these boards:");
    for (const [name, id] of Object.entries(BOARDS)) {
      console.log(`  - ${name} (${id})`);
    }
    return;
  }

  const db = new Database(DB_PATH);
  console.log("Creating tables...");
  createTables(db);

  const counts: Counts = {};
  counts.open_bids = await extractOpenBids(db);
  counts.bids_sent = await extractBidsSent(db);
  counts.checklist = await extractChecklist(db);
  counts.dust_permits = await extractDustPermits(db);
  counts.signage = await extractSignage(db);
  counts.swppp_master = await extractSwpppMaster(db);
  counts.inspections = await extractInspections(db);

  db.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log("EXTRACTION COMPLETE");
  console.log("=".repeat(60));
  console.log();

  let total = 0;
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count.toLocaleString()} items`);
    total += count;
  }

  console.log(`  ${"─".repeat(30)}`);
  console.log(`  TOTAL: ${total.toLocaleString()} items`);
  console.log();
  console.log(`Database saved to: ${DB_PATH}`);
  console.log();
  console.log("Query examples:");
  console.log(`  sqlite3 ${DB_PATH} "SELECT COUNT(*) FROM bids_sent"`);
  console.log(
    `  sqlite3 ${DB_PATH} "SELECT name, email, phone FROM open_bids WHERE email IS NOT NULL LIMIT 10"`
  );
}

if (import.meta.main) {
  runExtractProcurement(process.argv.includes("--dry-run")).catch((error) => {
    console.error("Extraction failed:", error);
    process.exit(1);
  });
}
