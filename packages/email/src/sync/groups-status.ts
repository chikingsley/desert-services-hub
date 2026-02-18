/**
 * M365 group sync summaries and status reporting.
 */
import { ALL_GROUPS } from "@email/sync/config";
import { db } from "@lib/db/hub";

import type { GroupSyncResult } from "./groups-core/sync-group";

export function printGroupSyncSummary(results: GroupSyncResult[]): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("GROUP SYNC SUMMARY");
  console.log("=".repeat(60));

  let totalConversations = 0;
  let totalPosts = 0;
  let totalAttachments = 0;
  let totalFiles = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`[ERROR] ${result.group}: ${result.error}`);
      errorCount++;
      continue;
    }

    console.log(
      `[OK] ${result.group}: ${result.conversationsProcessed} conversations, ${result.postsStored} posts, ${result.attachmentsStored} attachments, ${result.filesDownloaded} files downloaded`
    );
    totalConversations += result.conversationsProcessed;
    totalPosts += result.postsStored;
    totalAttachments += result.attachmentsStored;
    totalFiles += result.filesDownloaded;
    successCount++;
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Groups: ${successCount}/${results.length} successful`);
  console.log(`Total conversations: ${totalConversations.toLocaleString()}`);
  console.log(`Total posts: ${totalPosts.toLocaleString()}`);
  console.log(`Total attachments: ${totalAttachments.toLocaleString()}`);
  console.log(`Total files downloaded: ${totalFiles.toLocaleString()}`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
}

export async function showGroupStatus(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("M365 GROUP SYNC STATUS");
  console.log(`${"=".repeat(60)}\n`);

  for (const [email, groupId] of Object.entries(ALL_GROUPS)) {
    const mailbox = await db
      .query<{ email_count: number; last_sync_at: string | null }>(
        "SELECT email_count, last_sync_at FROM mailboxes WHERE email = ?"
      )
      .get(email);

    if (mailbox) {
      const syncDate = mailbox.last_sync_at
        ? new Date(mailbox.last_sync_at).toLocaleDateString()
        : "never";
      console.log(
        `[SYNCED] ${email.padEnd(40)} ${mailbox.email_count.toLocaleString().padStart(8)} posts (${syncDate})`
      );
    } else {
      console.log(`[PENDING] ${email.padEnd(40)} not synced yet`);
    }

    console.log(`         Group ID: ${groupId}`);
  }
}
