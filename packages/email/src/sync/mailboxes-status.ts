/**
 * Mailbox sync summaries and status reporting.
 */
import { ALL_MAILBOXES, type SyncResult } from "@email/sync/config";
import { getAllMailboxes } from "@lib/db/repositories/mailbox";

export function printSyncSummary(results: SyncResult[]): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("SYNC SUMMARY");
  console.log("=".repeat(60));

  let totalEmails = 0;
  let totalAttachments = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`[ERROR] ${result.mailbox}: ${result.error}`);
      errorCount++;
      continue;
    }

    console.log(
      `[OK] ${result.mailbox}: ${result.emailsStored} emails, ${result.attachmentsStored} attachments`
    );
    totalEmails += result.emailsStored;
    totalAttachments += result.attachmentsStored;
    successCount++;
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Mailboxes: ${successCount}/${results.length} successful`);
  console.log(`Total emails: ${totalEmails.toLocaleString()}`);
  console.log(`Total attachments: ${totalAttachments.toLocaleString()}`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
}

export async function showSyncStatus(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("MAILBOX SYNC STATUS");
  console.log(`${"=".repeat(60)}\n`);

  const mailboxes = await getAllMailboxes();
  const syncedMailboxes = new Set(mailboxes.map((mailbox) => mailbox.email));

  for (const email of ALL_MAILBOXES) {
    const mailbox = mailboxes.find((row) => row.email === email);
    if (!mailbox) {
      console.log(`[PENDING] ${email.padEnd(40)} not synced yet`);
      continue;
    }

    const syncDate = mailbox.lastSyncAt
      ? new Date(mailbox.lastSyncAt).toLocaleDateString()
      : "never";

    console.log(
      `[SYNCED] ${email.padEnd(40)} ${mailbox.emailCount.toLocaleString().padStart(8)} emails (${syncDate})`
    );
  }

  const totalEmails = mailboxes.reduce((sum, m) => sum + m.emailCount, 0);
  console.log(`\n${"-".repeat(60)}`);
  console.log(
    `Total synced: ${syncedMailboxes.size}/${ALL_MAILBOXES.length} mailboxes`
  );
  console.log(`Total emails: ${totalEmails.toLocaleString()}`);
}
