import { showGroupStatus, syncAllGroups } from "@email/sync/groups";
import {
  printSyncSummary,
  showSyncStatus as showMailboxSyncStatus,
  syncAllMailboxes,
} from "@email/sync/mailboxes";
import { runPostProcessing } from "./post-processing";
import { formatGroupProgress, formatMailboxProgress } from "./progress";
import type { MailboxSyncOptions } from "./types";

export async function runMailboxSync(
  options: MailboxSyncOptions
): Promise<void> {
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

  const totalGroups = groupResults.length;
  const totalPosts = groupResults.reduce(
    (sum, result) => sum + result.postsStored,
    0
  );
  const totalAttachments = groupResults.reduce(
    (sum, result) => sum + result.attachmentsStored,
    0
  );
  console.log(
    `\nGroup sync: ${totalGroups} groups, ${totalPosts} posts, ${totalAttachments} attachments`
  );

  await runPostProcessing();
}

export async function showSyncStatus(): Promise<void> {
  await showMailboxSyncStatus();
  console.log(`\n${"=".repeat(60)}`);
  console.log("M365 GROUP STATUS");
  console.log(`${"=".repeat(60)}\n`);
  await showGroupStatus();
}
