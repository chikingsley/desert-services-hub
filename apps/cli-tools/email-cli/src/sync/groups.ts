/**
 * Microsoft 365 Groups Sync
 *
 * Syncs conversations from M365 Groups (like internalcontracts@desertservices.net)
 * into the hub database. Groups use conversations/threads/posts instead of
 * traditional mailbox emails.
 *
 * Auto-paginates to fetch ALL conversations (same pattern as email sync).
 *
 * Usage:
 *   bun apps/email-cli/sync/groups.ts
 *   bun apps/email-cli/sync/groups.ts --since=2025-01-01
 *   bun apps/email-cli/sync/groups.ts --group=internalcontracts
 *   bun apps/email-cli/sync/groups.ts status
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { htmlToText } from "@contract/db/lib/html-to-text";
import { GraphGroupsClient } from "@email/groups";
import { ALL_GROUPS, MS_PER_DAY } from "@email/sync/config";
import { db } from "@lib/db/hub";
import {
  getOrCreateMailbox,
  insertAttachment,
  insertEmail,
  linkEmailToProject,
  updateMailboxSyncState,
} from "@lib/db/repositories";
import type { InsertAttachmentData, InsertEmailData } from "@lib/db/types";

const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";

const enqueueIntake = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('intake', ?)"
);

const ATTACHMENTS_DIR = join(
  import.meta.dir,
  "../../../../..",
  "data",
  "attachments"
);

// Group name to ID mapping
const GROUP_IDS: Record<string, string> = {
  internalcontracts: "962f9440-9bde-4178-b538-edc7f8d3ecce",
  "internal-contracts": "962f9440-9bde-4178-b538-edc7f8d3ecce",
  ic: "962f9440-9bde-4178-b538-edc7f8d3ecce",
  ...ALL_GROUPS,
};

interface SyncGroupOptions {
  groupId: string;
  groupEmail: string;
  since?: Date;
  downloadAttachments?: boolean;
  onProgress?: (progress: GroupSyncProgress) => void;
}

export interface GroupSyncProgress {
  group: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  conversationsFetched?: number;
  postsStored?: number;
  attachmentsStored?: number;
  error?: string;
}

export interface GroupSyncResult {
  group: string;
  conversationsProcessed: number;
  postsStored: number;
  attachmentsStored: number;
  filesDownloaded: number;
  error?: string;
}

function createGroupsClient(): GraphGroupsClient {
  const tenantId = process.env.AZURE_TENANT_ID ?? "";
  const clientId = process.env.AZURE_CLIENT_ID ?? "";
  const clientSecret = process.env.AZURE_CLIENT_SECRET ?? "";

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error("Missing Azure credentials in environment variables");
  }

  return new GraphGroupsClient(tenantId, clientId, clientSecret);
}

/**
 * Syncs a single M365 group's conversations to the hub database
 */
async function syncGroup(
  client: GraphGroupsClient,
  options: SyncGroupOptions
): Promise<GroupSyncResult> {
  const {
    groupId,
    groupEmail,
    since,
    downloadAttachments = true,
    onProgress,
  } = options;

  const reportProgress = (progress: GroupSyncProgress) => {
    onProgress?.(progress);
  };

  // Keep DB connection alive during long download runs
  const keepAlive = setInterval(async () => {
    try {
      await db.run("SELECT 1");
    } catch {
      // ignore — just a keepalive ping
    }
  }, 30_000);

  try {
    reportProgress({ group: groupEmail, phase: "starting" });

    const mailbox = await getOrCreateMailbox(groupEmail);

    reportProgress({ group: groupEmail, phase: "fetching" });

    const conversations = await client.getGroupConversations(groupId, {
      since,
    });

    reportProgress({
      group: groupEmail,
      phase: "storing",
      conversationsFetched: conversations.length,
    });

    let postsStored = 0;
    let attachmentsStored = 0;
    let filesDownloaded = 0;

    // Sanitize filename: replace path separators and problematic chars
    const sanitize = (name: string) =>
      name.replace(/[/\\:*?"<>|]/g, "_").substring(0, 200);

    // Prepare attachment storage dir for this group
    const groupDirName = groupEmail.split("@")[0];

    for (const conv of conversations) {
      const fullConv = await client.getFullConversation(groupId, conv.id, true);

      for (const thread of fullConv.threads) {
        for (const post of thread.posts) {
          let fullText = post.bodyContent;
          if (post.bodyType === "html") {
            fullText = await htmlToText(post.bodyContent);
          }

          const emailData: InsertEmailData = {
            messageId: post.id,
            mailboxId: mailbox.id,
            conversationId: conv.id,
            subject: conv.topic,
            fromEmail: post.from.address,
            fromName: post.from.name,
            toEmails: [],
            ccEmails: [],
            receivedAt: post.receivedDateTime,
            hasAttachments: post.hasAttachments,
            attachmentNames:
              post.attachments?.map((a: { name: string }) => a.name) ?? [],
            bodyPreview: fullText.substring(0, 500),
            bodyFull: fullText,
            bodyHtml: post.bodyType === "html" ? post.bodyContent : undefined,
            categories: [],
          };

          const emailId = await insertEmail(emailData);
          postsStored++;

          // Auto-link to project via conversation thread
          if (conv.topic) {
            const threadId = conv.id;
            const siblingWithProject = await db
              .query<{ project_id: number }>(
                `SELECT project_id FROM emails
                 WHERE conversation_id = ? AND project_id IS NOT NULL AND id != ?
                 LIMIT 1`
              )
              .get(threadId, emailId);

            if (siblingWithProject) {
              await linkEmailToProject(emailId, siblingWithProject.project_id);
            }
          }

          // Store attachment metadata + download files
          const pdfPaths: string[] = [];
          if (post.attachments) {
            for (const att of post.attachments) {
              let storagePath: string | null = null;

              if (downloadAttachments && att.id) {
                try {
                  const downloaded = await client.downloadAttachment(
                    groupId,
                    thread.id,
                    post.id,
                    att.id
                  );
                  if (downloaded.contentBytes) {
                    const dir = join(
                      ATTACHMENTS_DIR,
                      groupDirName,
                      String(emailId)
                    );
                    await mkdir(dir, { recursive: true });
                    const filePath = join(dir, sanitize(att.name));
                    await Bun.write(
                      filePath,
                      Buffer.from(downloaded.contentBytes, "base64")
                    );
                    storagePath = filePath;
                    filesDownloaded++;

                    if (att.name.toLowerCase().endsWith(".pdf")) {
                      pdfPaths.push(filePath);
                    }
                  }
                } catch {
                  // Skip download failures, metadata still stored
                }
              }

              const attData: InsertAttachmentData = {
                emailId,
                attachmentId: att.id,
                name: att.name,
                contentType: att.contentType,
                size: att.size,
                storageBucket: null,
                storagePath,
              };
              await insertAttachment(attData);
              attachmentsStored++;
            }
          }

          // Enqueue canonical intake job for IC posts with PDF attachments.
          // Keep a legacy-mode flag so worker-side processing can preserve
          // existing contract extraction + estimate-link behavior during transition.
          if (groupEmail === IC_GROUP_EMAIL && pdfPaths.length > 0) {
            await enqueueIntake.run(
              JSON.stringify({
                emailId,
                legacyContractIntake: true,
                originalSubject: conv.topic ?? "(no subject)",
                originalFrom: post.from.address ?? "",
                bodyText: fullText,
                attachmentPaths: pdfPaths,
                forwarderEmail: groupEmail,
              })
            );
          }
        }
      }

      // Progress update every 50 posts
      if (postsStored % 50 === 0) {
        reportProgress({
          group: groupEmail,
          phase: "storing",
          conversationsFetched: conversations.length,
          postsStored,
          attachmentsStored,
        });
      }
    }

    clearInterval(keepAlive);
    await updateMailboxSyncState(mailbox.id, postsStored);

    reportProgress({
      group: groupEmail,
      phase: "complete",
      conversationsFetched: conversations.length,
      postsStored,
      attachmentsStored,
    });

    return {
      group: groupEmail,
      conversationsProcessed: conversations.length,
      postsStored,
      attachmentsStored,
      filesDownloaded,
    };
  } catch (error) {
    clearInterval(keepAlive);
    const errorMessage = error instanceof Error ? error.message : String(error);
    reportProgress({
      group: groupEmail,
      phase: "error",
      error: errorMessage,
    });

    return {
      group: groupEmail,
      conversationsProcessed: 0,
      postsStored: 0,
      attachmentsStored: 0,
      filesDownloaded: 0,
      error: errorMessage,
    };
  }
}

/**
 * Sync all configured M365 groups
 */
export async function syncAllGroups(options: {
  since?: Date;
  groups?: string[];
  downloadAttachments?: boolean;
  onProgress?: (progress: GroupSyncProgress) => void;
}): Promise<GroupSyncResult[]> {
  const {
    since = new Date(Date.now() - 365 * MS_PER_DAY),
    groups,
    downloadAttachments = true,
    onProgress,
  } = options;

  const client = createGroupsClient();
  const results: GroupSyncResult[] = [];

  const groupsToSync = groups
    ? groups.map((g) => ({
        email: g.includes("@") ? g : `${g}@desertservices.net`,
        id: GROUP_IDS[g.toLowerCase()] ?? GROUP_IDS[g],
      }))
    : Object.entries(ALL_GROUPS).map(([email, id]) => ({ email, id }));

  for (const { email, id } of groupsToSync) {
    if (!id) {
      console.error(`Unknown group: ${email}`);
      continue;
    }

    const result = await syncGroup(client, {
      groupId: id,
      groupEmail: email,
      since,
      downloadAttachments,
      onProgress,
    });

    results.push(result);
  }

  return results;
}

function printSyncSummary(results: GroupSyncResult[]): void {
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
    } else {
      console.log(
        `[OK] ${result.group}: ${result.conversationsProcessed} conversations, ${result.postsStored} posts, ${result.attachmentsStored} attachments, ${result.filesDownloaded} files downloaded`
      );
      totalConversations += result.conversationsProcessed;
      totalPosts += result.postsStored;
      totalAttachments += result.attachmentsStored;
      totalFiles += result.filesDownloaded;
      successCount++;
    }
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

async function showGroupStatus(): Promise<void> {
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

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("status")) {
    await showGroupStatus();
    process.exit(0);
  }

  const sinceArg = args.find((a) => a.startsWith("--since="));
  const monthsArg = args.find((a) => a.startsWith("--months="));
  const groupArg = args.find((a) => a.startsWith("--group="));
  const noAttachments = args.includes("--no-attachments");

  const options: {
    since?: Date;
    groups?: string[];
    downloadAttachments?: boolean;
  } = {
    downloadAttachments: !noAttachments,
  };

  if (sinceArg) {
    const splitValue = sinceArg.split("=")[1];
    if (splitValue) {
      options.since = new Date(splitValue);
    }
  } else if (monthsArg) {
    const splitValue = monthsArg.split("=")[1];
    const months = splitValue ? Number.parseInt(splitValue, 10) : Number.NaN;
    if (!Number.isNaN(months)) {
      options.since = new Date(Date.now() - months * 30 * MS_PER_DAY);
    }
  }

  if (groupArg) {
    const splitValue = groupArg.split("=")[1];
    if (splitValue) {
      options.groups = splitValue.split(",").map((g) => g.trim());
    }
  }

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

  const { processPlatformEmails } = await import(
    "@contract/db/lib/platform-extraction"
  );
  const { linkEmailsToAccounts } = await import(
    "@contract/db/lib/link-accounts"
  );

  try {
    const results = await syncAllGroups({
      ...options,
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
            `${emoji} [${p.group}] Storing... ${p.postsStored} posts from ${p.conversationsFetched} conversations`
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

    printSyncSummary(results);

    // Enrichment
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

    console.log(`\n${"=".repeat(60)}`);
    console.log("SYNC COMPLETE");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}
