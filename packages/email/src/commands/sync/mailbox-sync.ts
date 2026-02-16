import { ALL_MAILBOXES, MS_PER_DAY } from "@email/sync/config";
import { showGroupStatus, syncAllGroups } from "@email/sync/groups";
import {
  printSyncSummary,
  showSyncStatus as showMailboxSyncStatus,
  syncAllMailboxes,
} from "@email/sync/mailboxes";
import { runPostProcessing } from "./post-processing";
import { formatGroupProgress, formatMailboxProgress } from "./progress";
import type { MailboxSyncOptions } from "./types";

const DEFAULT_DAYS_AGO = 365;

function getArgValue(args: string[], flag: string): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith(`--${flag}=`));
  if (equalsArg) {
    return equalsArg.split("=", 2)[1];
  }
  const argIndex = args.indexOf(`--${flag}`);
  const value = args[argIndex + 1];
  if (argIndex === -1 || !value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

function parseSinceArg(sinceValue: string): Date {
  if (sinceValue === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  if (sinceValue === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  return new Date(sinceValue);
}

function parseNumericArg(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseArgs(args: string[]): MailboxSyncOptions {
  const mailboxValue = getArgValue(args, "mailbox");
  const sinceValue = getArgValue(args, "since");
  const beforeValue = getArgValue(args, "before");
  const monthsValue = getArgValue(args, "months");
  const limitValue = getArgValue(args, "limit");
  const concurrencyValue = getArgValue(args, "concurrency");
  const fullSync = args.includes("--full");
  const includeGroups = args.includes("--include-groups");
  const skipPost = args.includes("--no-post");
  const noBodies = args.includes("--no-bodies");
  const noAttachments = args.includes("--no-attachments");

  const options: MailboxSyncOptions = {
    fetchAttachments: !noAttachments,
    fetchBodies: !noBodies,
    includeGroups,
    incremental: !fullSync,
    skipPost,
  };

  if (mailboxValue) {
    options.mailboxes = mailboxValue
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  }

  if (sinceValue) {
    options.since = parseSinceArg(sinceValue);
  } else if (monthsValue) {
    const months = parseNumericArg(monthsValue);
    if (months !== undefined) {
      options.since = new Date(Date.now() - months * 30 * MS_PER_DAY);
    }
  }

  if (beforeValue) {
    options.before = new Date(beforeValue);
  }

  options.maxPerMailbox = parseNumericArg(limitValue);
  const concurrency = parseNumericArg(concurrencyValue);
  options.concurrency = concurrency && concurrency > 0 ? concurrency : 3;

  return options;
}

function printHelp(): void {
  console.log(`
Email Mailbox Sync

Usage:
  bun packages/email/cli/cli.ts sync-mailboxes [options]
  bun packages/email/cli/cli.ts sync-mailboxes status

Options:
  --mailbox <list>     Specific mailbox(es) to sync (comma-separated)
  --since <date>       Sync emails since date (YYYY-MM-DD, "today", "yesterday")
  --before <date>      Sync emails before date (YYYY-MM-DD)
  --months <n>         Sync last N months of email
  --limit <n>          Max emails per mailbox
  --concurrency <n>    Parallel mailbox syncs (default: 3)
  --full               Full sync (disable incremental)
  --include-groups     Also sync M365 groups after mailboxes
  --no-post            Skip post-processing
  --no-bodies          Skip fetching email bodies
  --no-attachments     Skip fetching attachments
`);
}

function printSummaryHeader(options: MailboxSyncOptions): void {
  const sinceDate =
    options.since ?? new Date(Date.now() - DEFAULT_DAYS_AGO * MS_PER_DAY);
  console.log("=".repeat(60));
  console.log("COMPREHENSIVE EMAIL SYNC");
  console.log("=".repeat(60));
  console.log(
    `Since: ${options.incremental ? "last sync per mailbox" : sinceDate.toISOString().split("T")[0]}`
  );
  console.log(
    `Before: ${options.before ? options.before.toISOString().split("T")[0] : "none"}`
  );
  console.log(
    `Mailboxes: ${(options.mailboxes ?? ALL_MAILBOXES).length} mailbox(es)`
  );
  console.log(`Max per mailbox: ${options.maxPerMailbox ?? 50_000}`);
  console.log(`Concurrency: ${options.concurrency ?? 3}`);
  console.log(
    `Incremental: ${options.incremental ? "enabled" : "disabled (--full)"}`
  );
  console.log(`Include M365 Groups: ${options.includeGroups}`);
  console.log(
    `Post-processing: ${options.skipPost ? "SKIP (--no-post)" : "run"}`
  );
  console.log(
    `Fetch bodies: ${options.fetchBodies ? "yes" : "no (--no-bodies)"}`
  );
  console.log(
    `Fetch attachments: ${options.fetchAttachments ? "yes" : "no (--no-attachments)"}`
  );
  console.log("=".repeat(60));
}

async function runSync(options: MailboxSyncOptions): Promise<void> {
  const results = await syncAllMailboxes({
    ...options,
    onProgress: (progress) => {
      const line = formatMailboxProgress({
        mailbox: progress.mailbox,
        progress,
      });
      if (line) {
        console.log(line);
      }
    },
  });

  printSyncSummary(results);

  if (options.skipPost) {
    console.log("\nNote: Skipping post-processing (--no-post).");
    return;
  }

  if (!options.includeGroups) {
    await runPostProcessing();
    return;
  }

  const groupResults = await syncAllGroups({
    onProgress: (progress) => {
      const line = formatGroupProgress({
        group: progress.group,
        progress,
      });
      if (line) {
        console.log(line);
      }
    },
    since: options.since,
  });

  const totalPosts = groupResults.reduce((sum, r) => sum + r.postsStored, 0);
  const totalAttachments = groupResults.reduce(
    (sum, r) => sum + r.attachmentsStored,
    0
  );
  console.log(
    `\nGroup sync: ${groupResults.length} groups, ${totalPosts} posts, ${totalAttachments} attachments`
  );

  await runPostProcessing();
}

async function showStatus(): Promise<void> {
  await showMailboxSyncStatus();
  console.log(`\n${"=".repeat(60)}`);
  console.log("M365 GROUP STATUS");
  console.log(`${"=".repeat(60)}\n`);
  await showGroupStatus();
}

export async function handleMailboxSync(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("status")) {
    await showStatus();
    return;
  }

  const options = parseArgs(args);
  printSummaryHeader(options);
  await runSync(options);
}
