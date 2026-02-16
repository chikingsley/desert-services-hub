import { ALL_GROUPS, MS_PER_DAY } from "@email/sync/config";
import {
  printGroupSyncSummary,
  showGroupStatus,
  syncAllGroups,
} from "@email/sync/groups";
import { runPostProcessing } from "./post-processing";

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
    options.groups = groupArg.split(",").map((g) => g.trim());
  }

  return options;
}

function printHelp(): void {
  console.log(`
M365 Group Conversations Sync

Usage:
  bun packages/email/cli/cli.ts sync-groups [options]
  bun packages/email/cli/cli.ts sync-groups status

Options:
  --since <date>        Sync conversations since date (YYYY-MM-DD)
  --months <n>          Sync last N months
  --group <list>        Specific group(s) (comma-separated)
  --no-attachments      Skip downloading attachments
`);
}

function printHeader(options: GroupSyncOptions): void {
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
    `Attachments: ${options.downloadAttachments ? "download enabled" : "metadata only"}`
  );
  console.log(`${"=".repeat(60)}\n`);
}

export async function handleGroupSync(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("status")) {
    await showGroupStatus();
    return;
  }

  const options = parseArgs(args);
  printHeader(options);

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
  await runPostProcessing();
  console.log(`\n${"=".repeat(60)}`);
  console.log("SYNC COMPLETE");
  console.log("=".repeat(60));
}
