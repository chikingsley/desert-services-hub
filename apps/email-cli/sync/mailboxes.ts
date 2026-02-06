/**
 * Email mailbox sync — fetches emails from Microsoft Graph API into hub.db.
 *
 * Handles full body fetching, spam filtering, attachment metadata,
 * conversation-based project linking, and incremental sync.
 *
 * Usage:
 *   bun apps/email-cli/sync/mailboxes.ts                    # Incremental sync all
 *   bun apps/email-cli/sync/mailboxes.ts status             # Show sync status
 *   bun apps/email-cli/sync/mailboxes.ts --mailbox=chi@...  # Single mailbox
 *   bun apps/email-cli/sync/mailboxes.ts --full             # Full re-sync
 *   bun apps/email-cli/sync/mailboxes.ts --include-groups   # Also sync M365 groups
 *   bun apps/email-cli/sync/mailboxes.ts --since=2025-01-01
 *   bun apps/email-cli/sync/mailboxes.ts --months=6
 *   bun apps/email-cli/sync/mailboxes.ts --before=2025-06-01
 */
import {
  getAllMailboxes,
  getMailbox,
  getOrCreateMailbox,
  insertAttachment,
  insertEmail,
  linkEmailToProject,
  updateMailboxSyncState,
} from "@contract/db";
import { db } from "@contract/db/connection";
import { htmlToText } from "@contract/db/lib/html-to-text";
import { isSpam } from "@contract/db/lib/spam-filter";
import type { InsertAttachmentData, InsertEmailData } from "@contract/db/types";
import type { GraphEmailClient } from "@email/index";
import {
  ALL_GROUPS,
  ALL_MAILBOXES,
  createGraphClient,
  MS_PER_DAY,
  type SyncAllOptions,
  type SyncProgress,
  type SyncResult,
} from "@email/sync/config";
import { enrichEmailDomains } from "@email/sync/enrichment";

/**
 * Syncs a single mailbox with full body and attachment metadata
 */
async function syncMailboxFull(
  client: GraphEmailClient,
  mailboxEmail: string,
  since: Date,
  before: Date | undefined,
  maxEmails: number,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const reportProgress = (progress: SyncProgress) => {
    onProgress?.(progress);
  };

  try {
    reportProgress({ mailbox: mailboxEmail, phase: "starting" });

    const mailbox = getOrCreateMailbox(mailboxEmail);

    reportProgress({ mailbox: mailboxEmail, phase: "fetching" });

    // Phase 1: Fast fetch emails WITHOUT body content
    const emails = await client.getAllEmailsPaginated(
      mailboxEmail,
      since,
      maxEmails,
      { includeBody: false, before }
    );

    reportProgress({
      mailbox: mailboxEmail,
      phase: "storing",
      emailsFetched: emails.length,
    });

    // Phase 2: Batch fetch bodies for non-spam emails (20 at a time)
    const nonSpamEmails = emails.filter(
      (e) => !isSpam(e.fromEmail, e.subject).isSpam
    );
    const emailIds = nonSpamEmails.map((e) => e.id);

    console.log(
      `   [${mailboxEmail}] Fetching bodies for ${emailIds.length} emails...`
    );

    const bodies = await client.getEmailBodiesBatch(emailIds, mailboxEmail);

    // Merge bodies back into email objects
    for (const email of nonSpamEmails) {
      const body = bodies.get(email.id);
      if (body) {
        email.bodyContent = body;
      }
    }

    let storedCount = 0;
    let attachmentCount = 0;
    const spamFiltered = emails.length - nonSpamEmails.length;

    for (const email of nonSpamEmails) {
      // Get attachment metadata
      let attachmentNames: string[] = [];
      let attachmentMeta: Array<{
        id: string;
        name: string;
        contentType: string;
        size: number;
      }> = [];

      if (email.hasAttachments) {
        try {
          const attachments = await client.getAttachments(
            email.id,
            mailboxEmail
          );
          attachmentNames = attachments.map((a: { name: string }) => a.name);
          attachmentMeta = attachments.map(
            (a: {
              id: string;
              name: string;
              contentType: string;
              size: number;
            }) => ({
              id: a.id,
              name: a.name,
              contentType: a.contentType,
              size: a.size,
            })
          );
        } catch {
          // Skip attachment fetch errors
        }
      }

      // Convert HTML to plain text for full body
      const fullText = await htmlToText(email.bodyContent);

      const emailData: InsertEmailData = {
        messageId: email.id,
        internetMessageId: email.internetMessageId ?? null,
        mailboxId: mailbox.id,
        conversationId: email.conversationId ?? null,
        subject: email.subject,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        toEmails: email.toRecipients.map((r: { email: string }) => r.email),
        ccEmails: email.ccRecipients.map((r: { email: string }) => r.email),
        receivedAt: email.receivedDateTime.toISOString(),
        hasAttachments: email.hasAttachments ?? false,
        attachmentNames,
        bodyPreview: fullText.substring(0, 500),
        bodyFull: fullText,
        bodyHtml: email.bodyContent,
        categories: email.categories ?? [],
      };

      const emailId = insertEmail(emailData);

      // Auto-link to project via conversation thread
      if (email.conversationId) {
        const siblingWithProject = db
          .query<{ project_id: number }, [string, number]>(
            `SELECT project_id FROM emails
             WHERE conversation_id = ? AND project_id IS NOT NULL AND id != ?
             LIMIT 1`
          )
          .get(email.conversationId, emailId);

        if (siblingWithProject) {
          linkEmailToProject(emailId, siblingWithProject.project_id);
        }
      }

      // Store attachment metadata only (no MinIO upload)
      for (const att of attachmentMeta) {
        const attData: InsertAttachmentData = {
          emailId,
          attachmentId: att.id,
          name: att.name,
          contentType: att.contentType,
          size: att.size,
          storageBucket: null,
          storagePath: null,
        };
        insertAttachment(attData);
        attachmentCount++;
      }

      storedCount++;

      if (storedCount % 100 === 0) {
        reportProgress({
          mailbox: mailboxEmail,
          phase: "storing",
          emailsFetched: emails.length,
          emailsStored: storedCount,
          attachmentsStored: attachmentCount,
        });
      }
    }

    updateMailboxSyncState(mailbox.id, storedCount);

    if (spamFiltered > 0) {
      console.log(`   [${mailboxEmail}] Filtered ${spamFiltered} spam emails`);
    }

    reportProgress({
      mailbox: mailboxEmail,
      phase: "complete",
      emailsFetched: emails.length,
      emailsStored: storedCount,
      attachmentsStored: attachmentCount,
    });

    return {
      mailbox: mailboxEmail,
      emailsStored: storedCount,
      attachmentsStored: attachmentCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reportProgress({
      mailbox: mailboxEmail,
      phase: "error",
      error: errorMessage,
    });

    return {
      mailbox: mailboxEmail,
      emailsStored: 0,
      attachmentsStored: 0,
      error: errorMessage,
    };
  }
}

/**
 * Sync all mailboxes with full content
 */
export async function syncAllMailboxes(
  options: SyncAllOptions = {}
): Promise<SyncResult[]> {
  const {
    mailboxes = [...ALL_MAILBOXES],
    since = new Date(Date.now() - 365 * MS_PER_DAY),
    before,
    maxPerMailbox = 50_000,
    concurrency = 3,
    incremental = false,
    onProgress,
  } = options;

  const client = createGraphClient();
  const results: SyncResult[] = [];

  // Process mailboxes in batches for concurrency control
  for (let i = 0; i < mailboxes.length; i += concurrency) {
    const batch = mailboxes.slice(i, i + concurrency);

    const batchPromises = batch.map((mailboxEmail) => {
      let effectiveSince = since;
      if (incremental) {
        const existingMailbox = getMailbox(mailboxEmail);
        if (existingMailbox?.lastSyncAt) {
          effectiveSince = new Date(existingMailbox.lastSyncAt);
        }
      }

      return syncMailboxFull(
        client,
        mailboxEmail,
        effectiveSince,
        before,
        maxPerMailbox,
        onProgress
      );
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Print sync results summary
 */
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
    } else {
      console.log(
        `[OK] ${result.mailbox}: ${result.emailsStored} emails, ${result.attachmentsStored} attachments`
      );
      totalEmails += result.emailsStored;
      totalAttachments += result.attachmentsStored;
      successCount++;
    }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Mailboxes: ${successCount}/${results.length} successful`);
  console.log(`Total emails: ${totalEmails.toLocaleString()}`);
  console.log(`Total attachments: ${totalAttachments.toLocaleString()}`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
}

/**
 * Show current sync status for all mailboxes
 */
export function showSyncStatus(): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("MAILBOX SYNC STATUS");
  console.log(`${"=".repeat(60)}\n`);

  const mailboxes = getAllMailboxes();
  const syncedMailboxes = new Set(mailboxes.map((m) => m.email));

  for (const email of ALL_MAILBOXES) {
    const mb = mailboxes.find((m) => m.email === email);
    if (mb) {
      const syncDate = mb.lastSyncAt
        ? new Date(mb.lastSyncAt).toLocaleDateString()
        : "never";
      console.log(
        `[SYNCED] ${email.padEnd(40)} ${mb.emailCount.toLocaleString().padStart(8)} emails (${syncDate})`
      );
    } else {
      console.log(`[PENDING] ${email.padEnd(40)} not synced yet`);
    }
  }

  const totalEmails = mailboxes.reduce((sum, m) => sum + m.emailCount, 0);
  console.log(`\n${"-".repeat(60)}`);
  console.log(
    `Total synced: ${syncedMailboxes.size}/${ALL_MAILBOXES.length} mailboxes`
  );
  console.log(`Total emails: ${totalEmails.toLocaleString()}`);
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);

  // Status command
  if (args.includes("status")) {
    showSyncStatus();

    console.log(`\n${"=".repeat(60)}`);
    console.log("M365 GROUP STATUS");
    console.log(`${"=".repeat(60)}\n`);
    for (const [email, _groupId] of Object.entries(ALL_GROUPS)) {
      const mailbox = db
        .query<{ email_count: number; last_sync_at: string | null }, [string]>(
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
    }
    console.log(
      `\nNote: Use 'bun apps/email-cli/sync/groups.ts' to sync M365 group conversations`
    );
    process.exit(0);
  }

  // Parse options
  function getArgValue(flag: string): string | undefined {
    const eqArg = args.find((a) => a.startsWith(`--${flag}=`));
    if (eqArg) {
      return eqArg.split("=")[1];
    }
    const idx = args.indexOf(`--${flag}`);
    const nextArg = args[idx + 1];
    if (idx !== -1 && nextArg && !nextArg.startsWith("--")) {
      return nextArg;
    }
    return undefined;
  }

  const mailboxValue = getArgValue("mailbox");
  const sinceValue = getArgValue("since");
  const beforeValue = getArgValue("before");
  const monthsValue = getArgValue("months");
  const limitValue = getArgValue("limit");
  const concurrencyValue = getArgValue("concurrency");
  const fullSync = args.includes("--full");
  const incremental = !fullSync;
  const includeGroups = args.includes("--include-groups");

  const options: SyncAllOptions = {
    incremental,
    onProgress: (p) => {
      let emoji = "\u2192";
      if (p.phase === "complete") {
        emoji = "\u2713";
      } else if (p.phase === "error") {
        emoji = "\u2717";
      }
      if (p.phase === "fetching") {
        console.log(`${emoji} [${p.mailbox}] Fetching emails...`);
      } else if (p.phase === "storing" && p.emailsStored !== undefined) {
        console.log(
          `${emoji} [${p.mailbox}] Storing... ${p.emailsStored}/${p.emailsFetched}`
        );
      } else if (p.phase === "complete") {
        console.log(
          `${emoji} [${p.mailbox}] Done: ${p.emailsStored} emails, ${p.attachmentsStored} attachments`
        );
      } else if (p.phase === "error") {
        console.log(`${emoji} [${p.mailbox}] Error: ${p.error}`);
      }
    },
  };

  if (mailboxValue) {
    options.mailboxes = mailboxValue.split(",").map((m) => m.trim());
  }

  if (sinceValue) {
    if (sinceValue === "yesterday") {
      options.since = new Date(Date.now() - MS_PER_DAY);
    } else if (sinceValue === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      options.since = today;
    } else {
      options.since = new Date(sinceValue);
    }
  } else if (monthsValue) {
    const months = Number.parseInt(monthsValue, 10);
    if (!Number.isNaN(months)) {
      options.since = new Date(Date.now() - months * 30 * MS_PER_DAY);
    }
  }

  if (beforeValue) {
    options.before = new Date(beforeValue);
  }

  if (limitValue) {
    const limit = Number.parseInt(limitValue, 10);
    if (!Number.isNaN(limit)) {
      options.maxPerMailbox = limit;
    }
  }

  if (concurrencyValue) {
    const conc = Number.parseInt(concurrencyValue, 10);
    if (!Number.isNaN(conc)) {
      options.concurrency = conc;
    }
  }

  console.log("=".repeat(60));
  console.log("COMPREHENSIVE EMAIL SYNC");
  console.log("=".repeat(60));
  console.log(
    `Since: ${incremental ? "last sync per mailbox" : (options.since ?? new Date(Date.now() - 365 * MS_PER_DAY)).toISOString().split("T")[0]}`
  );
  console.log(
    `Before: ${options.before?.toISOString().split("T")[0] ?? "now"}`
  );
  console.log(
    `Mailboxes: ${(options.mailboxes ?? ALL_MAILBOXES).length} mailbox(es)`
  );
  console.log(`Max per mailbox: ${options.maxPerMailbox ?? 50_000}`);
  console.log(`Concurrency: ${options.concurrency ?? 3}`);
  console.log(
    `Incremental: ${incremental}${fullSync ? "" : " (default, use --full for full sync)"}`
  );
  if (incremental) {
    console.log(
      `  \u2192 Will use each mailbox's last_synced_at as start date`
    );
  }
  console.log(`Include M365 Groups: ${includeGroups}`);
  console.log(`${"=".repeat(60)}\n`);

  // Dynamic imports for enrichment modules
  const { processPlatformEmails } = await import(
    "@contract/db/lib/platform-extraction"
  );
  const { linkEmailsToAccounts } = await import(
    "@contract/db/lib/link-accounts"
  );

  try {
    // Step 1: Sync emails from Graph API
    const results = await syncAllMailboxes(options);
    printSyncSummary(results);

    // Step 1b: Sync M365 Groups if requested
    if (includeGroups) {
      console.log(`\n${"=".repeat(60)}`);
      console.log("SYNCING M365 GROUPS");
      console.log(`${"=".repeat(60)}\n`);

      const { syncAllGroups } = await import("@email/sync/groups");
      const groupResults = await syncAllGroups({
        since: options.since,
        onProgress: (p) => {
          let emoji = "\u2192";
          if (p.phase === "complete") {
            emoji = "\u2713";
          } else if (p.phase === "error") {
            emoji = "\u2717";
          }

          if (p.phase === "fetching") {
            console.log(`${emoji} [${p.group}] Fetching conversations...`);
          } else if (p.phase === "storing" && p.postsStored !== undefined) {
            console.log(
              `${emoji} [${p.group}] Storing... ${p.postsStored} posts`
            );
          } else if (p.phase === "complete") {
            console.log(
              `${emoji} [${p.group}] Done: ${p.postsStored} posts, ${p.attachmentsStored} attachments`
            );
          } else if (p.phase === "error") {
            console.log(`${emoji} [${p.group}] Error: ${p.error}`);
          }
        },
      });

      let groupPosts = 0;
      let groupAttachments = 0;
      for (const r of groupResults) {
        groupPosts += r.postsStored;
        groupAttachments += r.attachmentsStored;
      }
      console.log(
        `\nGroup sync: ${groupResults.length} groups, ${groupPosts} posts, ${groupAttachments} attachments`
      );
    }

    // Step 2: Enrich with domain info
    enrichEmailDomains();

    // Step 3: Extract platform senders
    console.log(`\n${"=".repeat(60)}`);
    console.log("EXTRACTING PLATFORM SENDERS");
    console.log(`${"=".repeat(60)}\n`);
    processPlatformEmails();

    // Step 4: Link emails to accounts
    console.log(`\n${"=".repeat(60)}`);
    console.log("LINKING EMAILS TO ACCOUNTS");
    console.log(`${"=".repeat(60)}\n`);
    const linkStats = linkEmailsToAccounts();
    const totalLinked =
      linkStats.linkedByPlatformDomain +
      linkStats.linkedByForwardDomain +
      linkStats.linkedByDirectDomain +
      linkStats.linkedByNameLookup +
      linkStats.linkedByAlias +
      linkStats.linkedByConversation;
    console.log(`Newly linked: ${totalLinked}`);
    console.log(`Accounts created: ${linkStats.accountsCreated}`);

    // Final summary
    console.log(`\n${"=".repeat(60)}`);
    console.log("SYNC COMPLETE");
    console.log("=".repeat(60));
    const finalStats = db
      .query<{ total: number; linked: number }, []>(
        `SELECT COUNT(*) as total,
         SUM(CASE WHEN account_id IS NOT NULL AND account_id > 0 THEN 1 ELSE 0 END) as linked
         FROM emails`
      )
      .get();
    if (finalStats) {
      const pct = ((finalStats.linked / finalStats.total) * 100).toFixed(1);
      console.log(`Total emails: ${finalStats.total.toLocaleString()}`);
      console.log(
        `Linked to accounts: ${finalStats.linked.toLocaleString()} (${pct}%)`
      );
    }
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}
