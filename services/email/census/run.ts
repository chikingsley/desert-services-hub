/**
 * Email Census - Main Orchestrator
 *
 * Runs the full email census pipeline:
 * 1. Sync emails from Graph API
 * 2. Classify emails (pattern + LLM)
 * 3. Extract tasks from actionable emails
 * 4. Link emails to Monday.com projects
 *
 * Usage:
 *   bun services/email/census/run.ts [command] [options]
 *
 * Commands:
 *   full          Run the full pipeline (default)
 *   sync          Only sync emails
 *   classify      Only classify emails
 *   tasks         Only extract tasks
 *   link          Only link to projects
 *   stats         Show current statistics
 *   reset         Reset all data (dangerous!)
 *
 * Options:
 *   --mailbox=<email>  Sync specific mailbox only
 *   --since=<date>     Sync emails since date (ISO format)
 *   --limit=<n>        Limit emails per stage
 *   --pattern-only     Skip LLM classification
 */

import { classifyAllEmails, printClassificationStats } from "./classify";
import {
  clearAllData,
  clearClassifications,
  clearProjectLinks,
  clearTasks,
  getAllMailboxes,
  getClassificationDistribution,
  getDateRange,
  getEmailCountByMailbox,
  getRecentEmails,
  getTotalEmailCount,
} from "./db";
import { extractAllTasks, printExtractionStats } from "./extract-tasks";
import { linkAllEmails, printLinkStats } from "./link-projects";
import { printSyncResults, syncEmails, TARGET_MAILBOXES } from "./sync";

// ============================================================================
// Stats Display
// ============================================================================

function showStats(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║       EMAIL CENSUS STATISTICS        ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Total emails
  const totalEmails = getTotalEmailCount();
  console.log(`Total emails: ${totalEmails.toLocaleString()}`);

  // Date range
  const dateRange = getDateRange();
  if (dateRange.earliest && dateRange.latest) {
    console.log(
      `Date range: ${dateRange.earliest.split("T")[0]} to ${dateRange.latest.split("T")[0]}`
    );
  }

  // Emails by mailbox
  console.log("\n── Emails by Mailbox ──");
  const byMailbox = getEmailCountByMailbox();
  for (const { email, count } of byMailbox) {
    const pct =
      totalEmails > 0 ? ((count / totalEmails) * 100).toFixed(1) : "0";
    console.log(`  ${email}: ${count.toLocaleString()} (${pct}%)`);
  }

  // Classification distribution
  console.log("\n── Classification Distribution ──");
  const distribution = getClassificationDistribution();
  for (const { classification, count } of distribution) {
    const label = classification ?? "UNCLASSIFIED";
    const pct =
      totalEmails > 0 ? ((count / totalEmails) * 100).toFixed(1) : "0";
    console.log(`  ${label}: ${count.toLocaleString()} (${pct}%)`);
  }

  // Mailbox sync status
  console.log("\n── Mailbox Sync Status ──");
  const mailboxes = getAllMailboxes();
  for (const mb of mailboxes) {
    const status = mb.lastSyncAt
      ? `synced ${mb.lastSyncAt.split("T")[0]}`
      : "never synced";
    console.log(`  ${mb.email}: ${mb.emailCount} emails (${status})`);
  }
}

// ============================================================================
// Pipeline Steps
// ============================================================================

async function runSync(options: {
  mailboxes?: string[];
  since?: Date;
  limit?: number;
}): Promise<void> {
  console.log("\n┌─────────────────────────────────────┐");
  console.log("│         STEP 1: SYNC EMAILS         │");
  console.log("└─────────────────────────────────────┘\n");

  const results = await syncEmails({
    mailboxes: options.mailboxes,
    since: options.since,
    maxPerMailbox: options.limit,
    onProgress: (p) => {
      if (p.phase === "fetching") {
        console.log(`[${p.mailbox}] Fetching emails...`);
      } else if (p.phase === "storing") {
        console.log(`[${p.mailbox}] Storing ${p.emailsFetched} emails...`);
      } else if (p.phase === "complete") {
        console.log(`[${p.mailbox}] ✓ ${p.emailsStored} emails stored`);
      } else if (p.phase === "error") {
        console.log(`[${p.mailbox}] ✗ Error: ${p.error}`);
      }
    },
  });

  printSyncResults(results);
}

async function runClassify(options: {
  limit?: number;
  patternOnly?: boolean;
}): Promise<void> {
  console.log("\n┌─────────────────────────────────────┐");
  console.log("│       STEP 2: CLASSIFY EMAILS       │");
  console.log("└─────────────────────────────────────┘\n");

  const stats = await classifyAllEmails({
    patternOnly: options.patternOnly,
    onProgress: (p) => {
      if (p.processed % 100 === 0) {
        console.log(
          `Progress: ${p.processed}/${p.total} (pattern: ${p.current?.method === "pattern" ? "✓" : "llm"})`
        );
      }
    },
  });

  printClassificationStats(stats);
}

async function runExtractTasks(options: { limit?: number }): Promise<void> {
  console.log("\n┌─────────────────────────────────────┐");
  console.log("│        STEP 3: EXTRACT TASKS        │");
  console.log("└─────────────────────────────────────┘\n");

  const stats = await extractAllTasks({
    limit: options.limit,
    onProgress: (p) => {
      if (p.processed % 50 === 0) {
        console.log(
          `Progress: ${p.processed}/${p.total} (${p.tasksExtracted} tasks)`
        );
      }
    },
  });

  printExtractionStats(stats);
}

async function runLinkProjects(options: { limit?: number }): Promise<void> {
  console.log("\n┌─────────────────────────────────────┐");
  console.log("│       STEP 4: LINK TO PROJECTS      │");
  console.log("└─────────────────────────────────────┘\n");

  const stats = await linkAllEmails({
    limit: options.limit,
    onProgress: (p) => {
      if (p.processed % 25 === 0) {
        console.log(`Progress: ${p.processed}/${p.total} (${p.linked} linked)`);
      }
    },
  });

  printLinkStats(stats);
}

// ============================================================================
// Reset Functions
// ============================================================================

function handleReset(args: string[]): void {
  const resetType = args.find((a) => a.startsWith("--type="))?.split("=")[1];

  console.log("\n⚠️  RESET OPERATIONS ⚠️\n");

  if (!resetType) {
    console.log("Available reset types:");
    console.log(
      "  --type=all           Reset ALL data (emails, classifications, tasks, links)"
    );
    console.log("  --type=classifications  Reset classifications only");
    console.log("  --type=tasks         Reset extracted tasks only");
    console.log("  --type=links         Reset project links only");
    return;
  }

  // Require confirmation
  const confirmArg = args.includes("--confirm");
  if (!confirmArg) {
    console.log(`To reset ${resetType}, add --confirm to the command.`);
    console.log(
      `Example: bun services/email/census/run.ts reset --type=${resetType} --confirm`
    );
    return;
  }

  switch (resetType) {
    case "all":
      clearAllData();
      console.log("✓ All data cleared (emails, classifications, tasks, links)");
      break;
    case "classifications":
      clearClassifications();
      console.log("✓ Classifications cleared");
      break;
    case "tasks":
      clearTasks();
      console.log("✓ Extracted tasks cleared");
      break;
    case "links":
      clearProjectLinks();
      console.log("✓ Project links cleared");
      break;
    default:
      console.log(`Unknown reset type: ${resetType}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "full";

  // Parse options
  const mailboxArg = args.find((a) => a.startsWith("--mailbox="));
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const patternOnly = args.includes("--pattern-only");

  const mailbox = mailboxArg?.split("=")[1];
  const since = sinceArg ? new Date(sinceArg.split("=")[1]) : undefined;
  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : undefined;

  console.log("╔══════════════════════════════════════╗");
  console.log("║          EMAIL CENSUS SYSTEM         ║");
  console.log("╚══════════════════════════════════════╝");

  switch (command) {
    case "full": {
      console.log("\nRunning full pipeline...\n");
      console.log(`Mailboxes: ${mailbox ?? TARGET_MAILBOXES.join(", ")}`);
      console.log(`Since: ${since?.toISOString() ?? "6 months ago"}`);
      console.log(`Limit per stage: ${limit ?? "unlimited"}`);
      console.log(`Pattern-only: ${patternOnly}`);

      const syncOptions = {
        mailboxes: mailbox ? [mailbox] : undefined,
        since,
        limit: limit ?? 10_000,
      };

      // Run pipeline
      await runSync(syncOptions);
      await runClassify({ limit, patternOnly });
      await runExtractTasks({ limit });
      await runLinkProjects({ limit });

      console.log("\n✓ Pipeline complete!");
      showStats();
      break;
    }

    case "sync":
      await runSync({
        mailboxes: mailbox ? [mailbox] : undefined,
        since,
        limit: limit ?? 10_000,
      });
      break;

    case "classify":
      await runClassify({ limit, patternOnly });
      break;

    case "tasks":
      await runExtractTasks({ limit });
      break;

    case "link":
      await runLinkProjects({ limit });
      break;

    case "stats":
      showStats();
      break;

    case "view": {
      const viewLimit = limit ?? 5;
      const emails = getRecentEmails(viewLimit);
      console.log(`\nShowing ${emails.length} most recent emails:\n`);
      for (const email of emails) {
        console.log(`─── ${email.subject ?? "(no subject)"} ───`);
        console.log(`From: ${email.fromName ?? email.fromEmail}`);
        console.log(`Date: ${email.receivedAt}`);
        console.log(`Class: ${email.classification ?? "unclassified"}`);
        console.log(`\n${email.bodyPreview ?? "(no preview)"}\n`);
      }
      break;
    }

    case "reset":
      handleReset(args);
      break;

    default:
      console.log(`
Usage: bun services/email/census/run.ts [command] [options]

Commands:
  full          Run the full pipeline (default)
  sync          Only sync emails
  classify      Only classify emails
  tasks         Only extract tasks
  link          Only link to projects
  stats         Show current statistics
  view          View recent emails with body previews
  reset         Reset data (requires --type and --confirm)

Options:
  --mailbox=<email>  Sync specific mailbox only
  --since=<date>     Sync emails since date (ISO format)
  --limit=<n>        Limit emails per stage
  --pattern-only     Skip LLM classification

Examples:
  bun services/email/census/run.ts full
  bun services/email/census/run.ts sync --mailbox=chi@desertservices.com
  bun services/email/census/run.ts classify --pattern-only
  bun services/email/census/run.ts stats
`);
  }
}

main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
