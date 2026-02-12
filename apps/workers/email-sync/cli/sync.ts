#!/usr/bin/env bun

/**
 * Email Sync — Poll Loop
 *
 * Polls Microsoft Graph API for new emails across all mailboxes,
 * syncs into Supabase Postgres, and runs enrichment pipeline.
 *
 * Usage:
 *   bun cli/sync.ts                    # Continuous polling (5min default)
 *   bun cli/sync.ts --once             # Single sync then exit
 *   bun cli/sync.ts --interval=60000   # Custom interval (ms)
 *   bun cli/sync.ts --no-groups        # Skip M365 group sync
 */

import { syncAll } from "@/apps/workers/email-sync/lib/sync";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const args = process.argv.slice(2);
const once = args.includes("--once");
const noGroups = args.includes("--no-groups");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const interval = intervalArg
  ? Number.parseInt(
      intervalArg.split("=")[1] ?? String(DEFAULT_INTERVAL_MS),
      10
    )
  : DEFAULT_INTERVAL_MS;

async function run(): Promise<void> {
  console.log(`[Email Sync] ${new Date().toISOString()}`);

  try {
    const summary = await syncAll({ includeGroups: !noGroups });

    console.log(
      `  Mailboxes: ${summary.mailboxResults.length} (${summary.errors} errors)`
    );
    console.log(
      `  Emails: ${summary.totalEmails}, Attachments: ${summary.totalAttachments}`
    );
    console.log(
      `  Groups: ${summary.groups.synced} synced, ${summary.groups.posts} posts`
    );
    console.log(
      `  Enrichment: ${summary.enrichment.accountsLinked} linked, ${summary.enrichment.accountsCreated} accounts created`
    );
    console.log(`  Duration: ${summary.duration}ms`);
  } catch (err) {
    console.error("[Email Sync] Error:", err);
  }
}

console.log(
  `[Email Sync] Starting. Interval: ${interval}ms, Once: ${once}, Groups: ${!noGroups}`
);

if (once) {
  await run();
} else {
  while (true) {
    await run();
    console.log(
      `[Email Sync] Next sync at ${new Date(Date.now() + interval).toISOString()}\n`
    );
    await Bun.sleep(interval);
  }
}
