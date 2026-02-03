/**
 * Unified Sync Pipeline
 * 
 * Runs the complete data flow in order:
 * 1. Sync estimates from Monday → creates/updates projects
 * 2. Sync emails from Outlook mailboxes
 * 3. Link emails to projects using FTS5
 * 4. Rebuild FTS index if needed
 * 
 * Usage:
 *   bun services/contract/census/sync/pipeline.ts           # Full sync
 *   bun services/contract/census/sync/pipeline.ts --quick   # Skip email sync (just relink)
 *   bun services/contract/census/sync/pipeline.ts --cron    # For scheduled runs (quieter output)
 * 
 * For cron (hourly):
 *   0 * * * * cd /path/to/desert-services-hub && bun services/contract/census/sync/pipeline.ts --cron
 */

import { db } from "../db/connection";
import "../db/schema";

// ============================================
// Pipeline Steps
// ============================================

interface PipelineResult {
  step: string;
  success: boolean;
  duration: number;
  details: string;
}

const results: PipelineResult[] = [];
const startTime = Date.now();
const args = process.argv.slice(2);
const quickMode = args.includes("--quick");
const cronMode = args.includes("--cron");

function log(msg: string) {
  if (!cronMode) {
    console.log(msg);
  }
}

function logStep(step: string) {
  if (!cronMode) {
    console.log("\n" + "=".repeat(60));
    console.log(`STEP: ${step}`);
    console.log("=".repeat(60) + "\n");
  }
}

async function runStep(name: string, fn: () => Promise<string>): Promise<void> {
  const stepStart = Date.now();
  try {
    const details = await fn();
    results.push({
      step: name,
      success: true,
      duration: Date.now() - stepStart,
      details,
    });
  } catch (error) {
    results.push({
      step: name,
      success: false,
      duration: Date.now() - stepStart,
      details: error instanceof Error ? error.message : String(error),
    });
    log(`ERROR in ${name}: ${error}`);
  }
}

// ============================================
// Step 1: Sync Estimates from Monday
// ============================================

async function syncEstimates(): Promise<string> {
  logStep("Syncing Estimates from Monday");
  
  const proc = Bun.spawn(
    ["bun", "services/contract/census/sync/estimates.ts"],
    {
      cwd: process.cwd(),
      stdout: cronMode ? "ignore" : "inherit",
      stderr: cronMode ? "ignore" : "inherit",
      env: process.env,
    }
  );
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Estimates sync failed with exit code ${exitCode}`);
  }
  
  const count = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM estimates").get();
  return `${count?.c ?? 0} estimates in database`;
}

// ============================================
// Step 2: Sync Emails from Outlook
// ============================================

async function syncEmails(): Promise<string> {
  logStep("Syncing Emails from Outlook");
  
  const beforeCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails").get()?.c ?? 0;
  
  const proc = Bun.spawn(
    ["bun", "services/contract/census/sync/all.ts"],
    {
      cwd: process.cwd(),
      stdout: cronMode ? "ignore" : "inherit",
      stderr: cronMode ? "ignore" : "inherit",
      env: process.env,
    }
  );
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Email sync failed with exit code ${exitCode}`);
  }
  
  const afterCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails").get()?.c ?? 0;
  const newEmails = afterCount - beforeCount;
  
  return `${afterCount} total emails (${newEmails} new)`;
}

// ============================================
// Step 3: Update FTS Index for new emails
// ============================================

async function updateFtsIndex(): Promise<string> {
  logStep("Updating FTS Index");
  
  // Count emails not in FTS
  const emailCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails").get()?.c ?? 0;
  const ftsCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails_fts").get()?.c ?? 0;
  
  if (ftsCount < emailCount) {
    const missing = emailCount - ftsCount;
    log(`Adding ${missing} emails to FTS index...`);
    
    // Insert missing emails into FTS
    db.run(`
      INSERT INTO emails_fts(email_id, subject, body_preview)
      SELECT id, COALESCE(subject, ''), COALESCE(body_preview, '')
      FROM emails
      WHERE id NOT IN (SELECT CAST(email_id AS INTEGER) FROM emails_fts)
    `);
    
    return `Added ${missing} emails to FTS index`;
  }
  
  return `FTS index up to date (${ftsCount} entries)`;
}

// ============================================
// Step 4: Link Emails to Projects
// ============================================

async function linkEmails(): Promise<string> {
  logStep("Linking Emails to Projects");
  
  const beforeLinked = db.query<{ c: number }, []>(
    "SELECT COUNT(*) as c FROM emails WHERE project_id IS NOT NULL"
  ).get()?.c ?? 0;
  
  const proc = Bun.spawn(
    ["bun", "services/contract/census/link/emails-to-projects.ts"],
    {
      cwd: process.cwd(),
      stdout: cronMode ? "ignore" : "inherit",
      stderr: cronMode ? "ignore" : "inherit",
      env: process.env,
    }
  );
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Email linking failed with exit code ${exitCode}`);
  }
  
  const afterLinked = db.query<{ c: number }, []>(
    "SELECT COUNT(*) as c FROM emails WHERE project_id IS NOT NULL"
  ).get()?.c ?? 0;
  
  const totalEmails = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails").get()?.c ?? 0;
  const newlyLinked = afterLinked - beforeLinked;
  const pct = ((afterLinked / totalEmails) * 100).toFixed(1);
  
  return `${afterLinked} linked (${pct}%), ${newlyLinked} newly linked`;
}

// ============================================
// Step 5: Checkpoint WAL
// ============================================

async function checkpointWal(): Promise<string> {
  logStep("Checkpointing Database");
  
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  return "WAL checkpointed";
}

// ============================================
// Main Pipeline
// ============================================

async function main() {
  log("=".repeat(60));
  log("CENSUS SYNC PIPELINE");
  log("=".repeat(60));
  log(`Mode: ${quickMode ? "Quick (skip email sync)" : "Full"}`);
  log(`Started: ${new Date().toISOString()}`);
  
  // Step 1: Sync estimates (creates/updates projects)
  await runStep("Sync Estimates", syncEstimates);
  
  // Step 2: Sync emails (skip in quick mode)
  if (!quickMode) {
    await runStep("Sync Emails", syncEmails);
  }
  
  // Step 3: Update FTS index
  await runStep("Update FTS Index", updateFtsIndex);
  
  // Step 4: Link emails to projects
  await runStep("Link Emails", linkEmails);
  
  // Step 5: Checkpoint WAL
  await runStep("Checkpoint WAL", checkpointWal);
  
  // Summary
  const totalDuration = Date.now() - startTime;
  const allSuccess = results.every((r) => r.success);
  
  log("\n" + "=".repeat(60));
  log("PIPELINE SUMMARY");
  log("=".repeat(60) + "\n");
  
  for (const r of results) {
    const status = r.success ? "✓" : "✗";
    const duration = (r.duration / 1000).toFixed(1);
    log(`${status} ${r.step.padEnd(20)} ${duration}s - ${r.details}`);
  }
  
  log(`\nTotal time: ${(totalDuration / 1000).toFixed(1)}s`);
  log(`Status: ${allSuccess ? "SUCCESS" : "FAILED"}`);
  
  // For cron, just output final status
  if (cronMode) {
    const linkedPct = db.query<{ c: number }, []>(
      "SELECT ROUND(COUNT(CASE WHEN project_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1) as c FROM emails"
    ).get()?.c ?? 0;
    console.log(`[${new Date().toISOString()}] Pipeline ${allSuccess ? "OK" : "FAILED"} - ${linkedPct}% emails linked`);
  }
  
  process.exit(allSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error("Pipeline failed:", error);
  process.exit(1);
});
