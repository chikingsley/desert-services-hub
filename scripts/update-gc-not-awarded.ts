#!/usr/bin/env bun
/**
 * Update GC Not Awarded Script
 *
 * This script updates estimates to "GC Not Awarded" status when another contractor
 * has won the same project.
 *
 * Usage:
 *   bun scripts/update-gc-not-awarded.ts                     # Interactive mode
 *   bun scripts/update-gc-not-awarded.ts --project "Name"    # Filter to exact project name
 *
 * The script will:
 * 1. Show you the WON estimate(s) for each project
 * 2. Show you which estimates will be marked as "GC Not Awarded"
 * 3. Ask for confirmation before updating each project
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { updateItem } from "../workers/ds-estimates-sync-worker/monday/client";
import {
  BOARD_IDS,
  ESTIMATING_COLUMNS,
} from "../workers/ds-estimates-sync-worker/monday/types";

// Parse CLI args
const args = process.argv.slice(2);
const projectArg = args.find((a) => a.startsWith("--project"));
const projectFilter = projectArg
  ? projectArg.split("=")[1] || args[args.indexOf("--project") + 1]
  : null;

// Open database
const dbPath = resolve(
  import.meta.dirname,
  "../apps/contract-ui/contract/census/hub.db"
);
const db = new Database(dbPath, { readonly: true });

// Status column ID for ESTIMATING board
const BID_STATUS_COLUMN_ID = ESTIMATING_COLUMNS.BID_STATUS.id; // "deal_stage"
const TARGET_STATUS = "GC Not Awarded";

console.log(
  "================================================================================"
);
console.log("GC NOT AWARDED UPDATE SCRIPT (Interactive Mode)");
console.log(
  "================================================================================"
);
console.log();
if (projectFilter) {
  console.log(`Project filter: "${projectFilter}"`);
  console.log();
}

// Get projects with discrepancies
const projectQuery = `
  SELECT DISTINCT p.id, p.name
  FROM projects p
  JOIN estimates e ON e.project_id = p.id
  WHERE p.id IN (
    SELECT project_id FROM estimates WHERE bid_status = 'Won' AND project_id IS NOT NULL
  )
  AND EXISTS (
    SELECT 1 FROM estimates e2 
    WHERE e2.project_id = p.id 
    AND e2.bid_status IN ('Bid Sent', 'New', 'Yet to Bid', 'Pending Won', 'Add to Projects')
  )
  ${projectFilter ? `AND p.name = '${projectFilter}'` : ""}
  ORDER BY p.name
`;

const projects = db.query(projectQuery).all() as { id: number; name: string }[];

console.log(`Found ${projects.length} projects with status discrepancies`);
console.log();

let totalUpdated = 0;
let totalSkipped = 0;
let projectsProcessed = 0;

for (const project of projects) {
  // Get all estimates for this project
  const estimates = db
    .query(`
    SELECT 
      monday_item_id,
      name,
      contractor,
      bid_status,
      bid_value
    FROM estimates 
    WHERE project_id = ?
    ORDER BY 
      CASE bid_status 
        WHEN 'Won' THEN 1 
        ELSE 2 
      END,
      contractor
  `)
    .all(project.id) as {
    monday_item_id: string;
    name: string;
    contractor: string | null;
    bid_status: string;
    bid_value: number | null;
  }[];

  const wonEstimates = estimates.filter((e) => e.bid_status === "Won");
  const toUpdate = estimates.filter((e) =>
    [
      "Bid Sent",
      "New",
      "Yet to Bid",
      "Pending Won",
      "Add to Projects",
    ].includes(e.bid_status)
  );

  if (toUpdate.length === 0) {
    continue;
  }

  console.log(
    "--------------------------------------------------------------------------------"
  );
  console.log(`PROJECT: ${project.name}`);
  console.log(
    "--------------------------------------------------------------------------------"
  );
  console.log();

  // Show WON estimates
  console.log("WON BY:");
  for (const won of wonEstimates) {
    console.log(
      `  ✅ ${won.contractor || "Unknown"} - $${won.bid_value?.toLocaleString() || "N/A"}`
    );
    console.log(`     Item: ${won.monday_item_id}`);
  }
  console.log();

  // Show estimates to update
  console.log(`TO BE MARKED AS "${TARGET_STATUS}" (${toUpdate.length} items):`);
  for (const est of toUpdate) {
    console.log(`  ⚠️  ${est.contractor || "Unknown"} - ${est.bid_status}`);
    console.log(
      `     Item: ${est.monday_item_id} | $${est.bid_value?.toLocaleString() || "N/A"}`
    );
  }
  console.log();

  // Ask for confirmation
  process.stdout.write("Update this project? [y/n/q(uit)]: ");

  const response = await new Promise<string>((resolve) => {
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim().toLowerCase());
    });
  });

  if (response === "q" || response === "quit") {
    console.log("\nQuitting...");
    break;
  }

  if (response !== "y" && response !== "yes") {
    console.log("  Skipped.\n");
    totalSkipped += toUpdate.length;
    continue;
  }

  // Update each estimate
  for (const est of toUpdate) {
    try {
      process.stdout.write(
        `  Updating ${est.monday_item_id} (${est.contractor || "Unknown"})...`
      );

      await updateItem({
        boardId: BOARD_IDS.ESTIMATING,
        itemId: est.monday_item_id,
        columnValues: {
          [BID_STATUS_COLUMN_ID]: { label: TARGET_STATUS },
        },
      });

      console.log(" ✅");
      totalUpdated++;

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.log(` ❌ ${error instanceof Error ? error.message : error}`);
    }
  }

  projectsProcessed++;
  console.log();
}

console.log(
  "================================================================================"
);
console.log("SUMMARY");
console.log(
  "================================================================================"
);
console.log();
console.log(`Projects processed: ${projectsProcessed}`);
console.log(`Items updated: ${totalUpdated}`);
console.log(`Items skipped: ${totalSkipped}`);
console.log();

db.close();
process.exit(0);
