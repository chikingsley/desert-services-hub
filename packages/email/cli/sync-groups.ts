#!/usr/bin/env bun
/**
 * Manual M365 group conversation sync.
 */
import { ALL_GROUPS, MS_PER_DAY } from "@email/sync/config";
import {
  printGroupSyncSummary,
  showGroupStatus,
  syncAllGroups,
} from "@email/sync/groups";

interface GroupSyncOptions {
  since?: Date;
  groups?: string[];
  downloadAttachments?: boolean;
}

function getArgValue(args: string[], flag: string): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith(`--${flag}=`));
  if (equalsArg) {
    return equalsArg.split("=", 2)[1];
  }

  const index = args.indexOf(`--${flag}`);
  const value = args[index + 1];
  if (index === -1 || !value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

function parseArgs(args: string[]): GroupSyncOptions {
  const sinceArg = getArgValue(args, "since");
  const monthsArg = getArgValue(args, "months");
  const groupArg = getArgValue(args, "group");
  const noAttachments = args.includes("--no-attachments");
  const options: GroupSyncOptions = {
    downloadAttachments: !noAttachments,
  };

  if (sinceArg) {
    options.since = new Date(sinceArg);
  } else if (monthsArg) {
    const months = Number.parseInt(monthsArg, 10);
    if (!Number.isNaN(months)) {
      options.since = new Date(Date.now() - months * 30 * MS_PER_DAY);
    }
  }

  if (groupArg) {
    options.groups = groupArg.split(",").map((groupName) => groupName.trim());
  }

  return options;
}

function showHeader(options: GroupSyncOptions): void {
  console.log("=".repeat(60));
  console.log("M365 GROUP CONVERSATIONS SYNC");
  console.log("=".repeat(60));
  console.log(
    `Since: ${(options.since ?? new Date(Date.now() - 365 * MS_PER_DAY)).toISOString().split("T")[0]}`
  );
  console.log(
    `Groups: ${options.groups?.join(", ") ?? Object.keys(ALL_GROUPS).join(", ")}`
  );
  console.log(
    `Attachments: ${options.downloadAttachments ? "download enabled" : "metadata only (--no-attachments)"}`
  );
  console.log("(Auto-paginates to fetch all conversations)");
  console.log(`${"=".repeat(60)}\n`);
}

async function runGroupPostProcessing(): Promise<void> {
  const { processPlatformEmails } = await import(
    "@contract/db/lib/platform-extraction"
  );
  const { linkEmailsToAccounts } = await import(
    "@contract/db/lib/link-accounts"
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("EXTRACTING PLATFORM SENDERS");
  console.log(`${"=".repeat(60)}\n`);
  await processPlatformEmails();

  console.log(`\n${"=".repeat(60)}`);
  console.log("LINKING TO ACCOUNTS");
  console.log(`${"=".repeat(60)}\n`);
  const linkStats = await linkEmailsToAccounts();
  const totalLinked =
    linkStats.linkedByPlatformDomain +
    linkStats.linkedByForwardDomain +
    linkStats.linkedByDirectDomain +
    linkStats.linkedByNameLookup +
    linkStats.linkedByAlias +
    linkStats.linkedByConversation;
  console.log(`Newly linked: ${totalLinked}`);
  console.log(`Accounts created: ${linkStats.accountsCreated}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Email Group Sync CLI

Usage:
  bun packages/email/cli/sync-groups.ts [--since=2025-01-01] [--group=internalcontracts] [--months=6]
  bun packages/email/cli/sync-groups.ts status
    `);
    process.exit(0);
  }

  if (args.includes("status")) {
    await showGroupStatus();
    return;
  }

  const options = parseArgs(args);
  showHeader(options);

  const results = await syncAllGroups({
    ...options,
    onProgress: (p) => {
      let icon = "\u2192";
      if (p.phase === "complete") {
        icon = "\u2713";
      } else if (p.phase === "error") {
        icon = "\u2717";
      }

      if (p.phase === "fetching") {
        console.log(`${icon} [${p.group}] Fetching conversations...`);
      } else if (p.phase === "storing" && p.postsStored !== undefined) {
        console.log(
          `${icon} [${p.group}] Storing... ${p.postsStored} posts from ${p.conversationsFetched} conversations`
        );
      } else if (p.phase === "complete") {
        console.log(
          `${icon} [${p.group}] Done: ${p.postsStored} posts, ${p.attachmentsStored} attachments`
        );
      } else if (p.phase === "error") {
        console.log(`${icon} [${p.group}] Error: ${p.error}`);
      }
    },
  });

  printGroupSyncSummary(results);
  await runGroupPostProcessing();
  console.log(`\n${"=".repeat(60)}`);
  console.log("SYNC COMPLETE");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
