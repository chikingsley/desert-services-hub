import { ALL_MAILBOXES, MS_PER_DAY } from "@email/sync/config";
import type { MailboxSyncOptions } from "./types";

const DEFAULT_DAYS_AGO = 365;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getArgValue(args: string[], flag: string): string | undefined {
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

function parseConcurrency(
  rawConcurrency: string | undefined
): number | undefined {
  if (!rawConcurrency) {
    return undefined;
  }

  const parsed = Number.parseInt(rawConcurrency, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseNumericArg(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function buildDefaultSince(options: MailboxSyncOptions): Date {
  if (options.since) {
    return options.since;
  }
  return new Date(Date.now() - DEFAULT_DAYS_AGO * MS_PER_DAY);
}

function printUsageAndExit(code: number): never {
  console.log(`
Email Mailbox Sync CLI

Usage:
  bun packages/email/cli/sync-mailboxes.ts [--full] [--include-groups]
`);
  process.exit(code);
}

export function parseArgs(args: string[]): MailboxSyncOptions {
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
      .map((mailbox) => mailbox.trim())
      .filter(Boolean);
  }

  if (sinceValue) {
    options.since = parseSinceArg(sinceValue);
  } else if (monthsValue) {
    const months = parseNumericArg(monthsValue);
    if (months !== undefined) {
      options.since = new Date(Date.now() - months * 30 * DAY_IN_MS);
    }
  }

  if (beforeValue) {
    options.before = new Date(beforeValue);
  }

  if (limitValue) {
    const maxPerMailbox = parseNumericArg(limitValue);
    if (maxPerMailbox !== undefined) {
      options.maxPerMailbox = maxPerMailbox;
    }
  }

  if (concurrencyValue) {
    const concurrency = parseConcurrency(concurrencyValue);
    if (concurrency !== undefined) {
      options.concurrency = concurrency;
    }
  }

  if (
    !Number.isFinite(options.concurrency ?? 0) ||
    (options.concurrency ?? 1) <= 0
  ) {
    options.concurrency = 3;
  }

  return options;
}

export function printSummaryHeader(options: MailboxSyncOptions): void {
  const optionsDate = buildDefaultSince(options);
  console.log("=".repeat(60));
  console.log("COMPREHENSIVE EMAIL SYNC");
  console.log("=".repeat(60));
  console.log(
    `Since: ${options.incremental ? "last sync per mailbox" : optionsDate.toISOString().split("T")[0]}`
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
    `Incremental: ${options.incremental ? "enabled" : "disabled (--full to disable)"}`
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

export function printHelp(): never {
  printUsageAndExit(0);
}
