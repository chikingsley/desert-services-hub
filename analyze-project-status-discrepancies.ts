#!/usr/bin/env bun
/**
 * Project Status Discrepancy Analysis
 *
 * This script identifies projects where one contractor has "Won" the project
 * but other contractors still have the project in active/submitted status.
 *
 * Run: bun analyze-project-status-discrepancies.ts
 */

import { Database } from "bun:sqlite";
import { resolve } from "path";

// Open the census database
const dbPath = resolve(
  import.meta.dirname,
  "./apps/contract-ui/contract/census/hub.db"
);
const db = new Database(dbPath);

// Status categories
const ACTIVE_STATUSES = [
  "New",
  "Yet to Bid",
  "Bid Sent",
  "Pending Won",
  "Add to Projects",
];
const WON_STATUSES = ["Won"];
const LOST_STATUSES = ["Lost", "Duplicates", "GC Not Awarded"];

console.log("=".repeat(80));
console.log("PROJECT STATUS DISCREPANCY ANALYSIS");
console.log("=".repeat(80));
console.log();

// Query 1: Find all projects with mixed statuses (one won, others active)
const mixedStatusProjects = db
  .query(`
  SELECT 
    p.id as project_id,
    p.name as project_name,
    COUNT(e.id) as estimate_count,
    SUM(CASE WHEN e.bid_status = 'Won' THEN 1 ELSE 0 END) as won_count,
    SUM(CASE WHEN e.bid_status IN ('New', 'Yet to Bid', 'Bid Sent', 'Pending Won', 'Add to Projects') THEN 1 ELSE 0 END) as active_count,
    SUM(CASE WHEN e.bid_status IN ('Lost', 'Duplicates', 'GC Not Awarded') THEN 1 ELSE 0 END) as lost_count
  FROM projects p
  JOIN estimates e ON e.project_id = p.id
  GROUP BY p.id, p.name
  HAVING won_count > 0 AND active_count > 0
  ORDER BY won_count DESC, active_count DESC
`)
  .all();

console.log(
  "📊 FOUND " +
    mixedStatusProjects.length +
    " PROJECTS WITH STATUS DISCREPANCIES"
);
console.log(
  '   (Projects where one contractor "Won" but others are still "Active")'
);
console.log();

if (mixedStatusProjects.length === 0) {
  console.log(
    '✅ No discrepancies found! All projects with a "Won" estimate have other estimates marked as "Lost" or "GC Not Awarded".'
  );
  process.exit(0);
}

// Query 2: Get detailed breakdown for each project
console.log("DETAILED BREAKDOWN:");
console.log("-".repeat(80));

let totalEstimatesToUpdate = 0;

for (const project of mixedStatusProjects) {
  console.log();
  console.log("🏗️  " + project.project_name);
  console.log("   Project ID: " + project.project_id);
  console.log(
    "   Total Estimates: " +
      project.estimate_count +
      " | Won: " +
      project.won_count +
      " | Active: " +
      project.active_count +
      " | Lost: " +
      project.lost_count
  );
  console.log();

  // Get all estimates for this project
  const estimates = db
    .query(`
    SELECT 
      e.id,
      e.name,
      e.contractor,
      e.bid_status,
      e.monday_item_id,
      e.monday_url,
      e.bid_value
    FROM estimates e
    WHERE e.project_id = ?
    ORDER BY 
      CASE e.bid_status
        WHEN 'Won' THEN 1
        WHEN 'Pending Won' THEN 2
        WHEN 'Add to Projects' THEN 3
        WHEN 'Bid Sent' THEN 4
        WHEN 'Yet to Bid' THEN 5
        WHEN 'New' THEN 6
        WHEN 'Lost' THEN 7
        WHEN 'Duplicates' THEN 8
        WHEN 'GC Not Awarded' THEN 9
        ELSE 10
      END,
      e.contractor
  `)
    .all(project.project_id);

  for (const est of estimates) {
    const statusIcon = WON_STATUSES.includes(est.bid_status)
      ? "✅"
      : ACTIVE_STATUSES.includes(est.bid_status)
        ? "⚠️"
        : LOST_STATUSES.includes(est.bid_status)
          ? "❌"
          : "❓";

    const needsUpdate = ACTIVE_STATUSES.includes(est.bid_status);
    if (needsUpdate) totalEstimatesToUpdate++;

    console.log("   " + statusIcon + " " + (est.contractor || "Unknown GC"));
    console.log(
      "      Status: " +
        est.bid_status +
        (needsUpdate ? " ← NEEDS TO BE MARKED AS LOST" : "")
    );
    console.log("      Value: $" + (est.bid_value?.toLocaleString() || "N/A"));
    console.log(
      "      Monday: " +
        (est.monday_url ||
          "https://desertservices.monday.com/boards/123456789/pulses/" +
            est.monday_item_id)
    );
    console.log();
  }

  console.log("-".repeat(80));
}

// Summary statistics
console.log();
console.log("=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log();
console.log("📈 Projects with discrepancies: " + mixedStatusProjects.length);
console.log('🎯 Estimates needing "Lost" status: ' + totalEstimatesToUpdate);
console.log();

// Show breakdown by status
const statusBreakdown = db
  .query(`
  SELECT e.bid_status, COUNT(*) as count
  FROM estimates e
  JOIN (
    SELECT DISTINCT project_id
    FROM estimates
    WHERE bid_status = 'Won' AND project_id IS NOT NULL
  ) won_projects ON won_projects.project_id = e.project_id
  WHERE e.bid_status != 'Won'
  GROUP BY e.bid_status
  ORDER BY count DESC
`)
  .all();

console.log(
  "Current status breakdown for non-winning estimates on won projects:"
);
for (const row of statusBreakdown) {
  console.log("   " + row.bid_status + ": " + row.count);
}

console.log();
console.log("=".repeat(80));
console.log("NEXT STEPS");
console.log("=".repeat(80));
console.log();
console.log('To update these estimates to "Lost" status:');
console.log();
console.log("Option 1 - Manual Monday.com updates:");
console.log(
  '   Click each Monday.com link above and update the BID_STATUS column to "Lost"'
);
console.log();
console.log("Option 2 - Bulk update script (use with caution):");
console.log(
  '   Create an update script that marks all active estimates on won projects as "Lost"'
);
console.log();
console.log("Option 3 - Automated sync (recommended for future):");
console.log(
  "   Add logic to the estimates sync worker to automatically mark other"
);
console.log(
  '   contractors\' estimates as "GC Lost" when one contractor wins.'
);
console.log();

// Generate actionable Monday.com item IDs
console.log("=".repeat(80));
console.log("MONDAY.COM ITEM IDs FOR BULK ACTIONS");
console.log("=".repeat(80));
console.log();

const itemsToUpdate = db
  .query(`
  SELECT 
    e.monday_item_id,
    p.name as project_name,
    e.contractor,
    e.bid_status as current_status
  FROM estimates e
  JOIN projects p ON p.id = e.project_id
  WHERE e.project_id IN (
    SELECT DISTINCT project_id
    FROM estimates
    WHERE bid_status = 'Won' AND project_id IS NOT NULL
  )
  AND e.bid_status IN ('New', 'Yet to Bid', 'Bid Sent', 'Pending Won', 'Add to Projects')
  ORDER BY p.name, e.contractor
`)
  .all();

console.log(
  "Found " +
    itemsToUpdate.length +
    " Monday.com items that need status update:\n"
);
for (const item of itemsToUpdate) {
  console.log(
    item.monday_item_id +
      " | " +
      item.project_name +
      " | " +
      item.contractor +
      " | " +
      item.current_status
  );
}

db.close();
