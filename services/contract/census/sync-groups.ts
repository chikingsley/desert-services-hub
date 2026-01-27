/**
 * Microsoft 365 Groups Sync
 *
 * Syncs conversations from M365 Groups (like internalcontracts@desertservices.net)
 * into the census database. Groups use conversations/threads/posts instead of
 * traditional mailbox emails.
 *
 * Auto-paginates to fetch ALL conversations (same pattern as email sync).
 *
 * Usage:
 *   bun services/email/census/sync-groups.ts
 *   bun services/email/census/sync-groups.ts --since=2025-01-01
 *   bun services/email/census/sync-groups.ts --group=internalcontracts
 *   bun services/email/census/sync-groups.ts status
 */
import { BUCKETS, uploadFile } from "@/lib/minio";
import { GraphGroupsClient } from "../groups";
import {
  db,
  getOrCreateMailbox,
  type InsertAttachmentData,
  type InsertEmailData,
  insertAttachment,
  insertEmail,
  updateMailboxSyncState,
} from "./db";
import { htmlToText } from "./lib/html-to-text";
import { ALL_GROUPS } from "./sync-all";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  onProgress?: (progress: GroupSyncProgress) => void;
}

interface GroupSyncProgress {
  group: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  conversationsFetched?: number;
  postsStored?: number;
  attachmentsStored?: number;
  error?: string;
}

interface GroupSyncResult {
  group: string;
  conversationsProcessed: number;
  postsStored: number;
  attachmentsStored: number;
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
 * Syncs a single M365 group's conversations to the census database
 */
async function syncGroup(
  client: GraphGroupsClient,
  options: SyncGroupOptions
): Promise<GroupSyncResult> {
  const { groupId, groupEmail, since, onProgress } = options;

  const reportProgress = (progress: GroupSyncProgress) => {
    onProgress?.(progress);
  };

  try {
    reportProgress({ group: groupEmail, phase: "starting" });

    // Create or get mailbox for this group
    const mailbox = getOrCreateMailbox(groupEmail);

    reportProgress({ group: groupEmail, phase: "fetching" });

    // Fetch all conversations from the group (auto-paginates)
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

    for (const conv of conversations) {
      // Get full conversation with threads and posts
      const fullConv = await client.getFullConversation(groupId, conv.id, true);

      for (const thread of fullConv.threads) {
        for (const post of thread.posts) {
          // Convert HTML body to plain text
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
            attachmentNames: post.attachments?.map((a) => a.name) ?? [],
            bodyPreview: fullText.substring(0, 500),
            bodyFull: fullText,
            bodyHtml: post.bodyType === "html" ? post.bodyContent : undefined,
            categories: [],
          };

          const emailId = insertEmail(emailData);
          postsStored++;

          // Store attachments
          if (post.attachments) {
            for (const att of post.attachments) {
              const isPdf =
                att.contentType?.toLowerCase() === "application/pdf" ||
                att.name.toLowerCase().endsWith(".pdf");

              let storageBucket: string | null = null;
              let storagePath: string | null = null;

              // Upload PDFs to MinIO
              if (isPdf && att.contentBytes) {
                try {
                  const pdfBuffer = Buffer.from(att.contentBytes, "base64");
                  const objectPath = `${emailId}/${att.id}/${att.name}`;
                  await uploadFile(
                    BUCKETS.EMAIL_ATTACHMENTS,
                    objectPath,
                    pdfBuffer,
                    "application/pdf"
                  );
                  storageBucket = BUCKETS.EMAIL_ATTACHMENTS;
                  storagePath = objectPath;
                } catch (uploadErr) {
                  console.error(`Failed to upload ${att.name}: ${uploadErr}`);
                }
              }

              const attData: InsertAttachmentData = {
                emailId,
                attachmentId: att.id,
                name: att.name,
                contentType: att.contentType,
                size: att.size,
                storageBucket,
                storagePath,
              };
              insertAttachment(attData);
              attachmentsStored++;
            }
          }
        }
      }

      // Progress update every 10 conversations
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

    updateMailboxSyncState(mailbox.id, postsStored);

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
    };
  } catch (error) {
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
      error: errorMessage,
    };
  }
}

/**
 * Sync all configured M365 groups
 */
async function syncAllGroups(options: {
  since?: Date;
  groups?: string[];
  onProgress?: (progress: GroupSyncProgress) => void;
}): Promise<GroupSyncResult[]> {
  const {
    since = new Date(Date.now() - 365 * MS_PER_DAY),
    groups,
    onProgress,
  } = options;

  const client = createGroupsClient();
  const results: GroupSyncResult[] = [];

  // Determine which groups to sync
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
      onProgress,
    });

    results.push(result);
  }

  return results;
}

/**
 * Print sync results summary
 */
function printSyncSummary(results: GroupSyncResult[]): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("GROUP SYNC SUMMARY");
  console.log("=".repeat(60));

  let totalConversations = 0;
  let totalPosts = 0;
  let totalAttachments = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`[ERROR] ${result.group}: ${result.error}`);
      errorCount++;
    } else {
      console.log(
        `[OK] ${result.group}: ${result.conversationsProcessed} conversations, ${result.postsStored} posts, ${result.attachmentsStored} attachments`
      );
      totalConversations += result.conversationsProcessed;
      totalPosts += result.postsStored;
      totalAttachments += result.attachmentsStored;
      successCount++;
    }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Groups: ${successCount}/${results.length} successful`);
  console.log(`Total conversations: ${totalConversations.toLocaleString()}`);
  console.log(`Total posts: ${totalPosts.toLocaleString()}`);
  console.log(`Total attachments: ${totalAttachments.toLocaleString()}`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
}

/**
 * Show sync status for groups
 */
function showGroupStatus(): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("M365 GROUP SYNC STATUS");
  console.log(`${"=".repeat(60)}\n`);

  for (const [email, groupId] of Object.entries(ALL_GROUPS)) {
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
    console.log(`         Group ID: ${groupId}`);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  // Check for status command
  if (args.includes("status")) {
    showGroupStatus();
    process.exit(0);
  }

  // Parse options
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const monthsArg = args.find((a) => a.startsWith("--months="));
  const groupArg = args.find((a) => a.startsWith("--group="));

  const options: {
    since?: Date;
    groups?: string[];
  } = {};

  if (sinceArg) {
    options.since = new Date(sinceArg.split("=")[1]);
  } else if (monthsArg) {
    const months = Number.parseInt(monthsArg.split("=")[1], 10);
    if (!Number.isNaN(months)) {
      options.since = new Date(Date.now() - months * 30 * MS_PER_DAY);
    }
  }

  if (groupArg) {
    options.groups = groupArg
      .split("=")[1]
      .split(",")
      .map((g) => g.trim());
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
  console.log("(Auto-paginates to fetch all conversations)");
  console.log(`${"=".repeat(60)}\n`);

  // Import enrichment modules
  const { processPlatformEmails } = await import("./lib/platform-extraction");
  const { linkEmailsToAccounts } = await import("./lib/link-accounts");

  try {
    // Step 1: Sync group conversations
    const results = await syncAllGroups({
      ...options,
      onProgress: (p) => {
        let emoji = "→";
        if (p.phase === "complete") {
          emoji = "✓";
        } else if (p.phase === "error") {
          emoji = "✗";
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

    // Step 2: Run enrichment on new posts
    console.log(`\n${"=".repeat(60)}`);
    console.log("EXTRACTING PLATFORM SENDERS");
    console.log(`${"=".repeat(60)}\n`);
    processPlatformEmails();

    // Step 3: Link to accounts
    console.log(`\n${"=".repeat(60)}`);
    console.log("LINKING TO ACCOUNTS");
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

    console.log(`\n${"=".repeat(60)}`);
    console.log("SYNC COMPLETE");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

export {
  syncGroup,
  syncAllGroups,
  GROUP_IDS,
  type GroupSyncResult,
  type GroupSyncProgress,
};
