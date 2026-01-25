/**
 * Email Archive Downloader
 *
 * Downloads emails and attachments from a mailbox, organizing them by conversation.
 * Creates a browsable archive with metadata JSON files alongside downloaded PDFs.
 *
 * Usage:
 *   bun services/email/census/download-archive.ts --mailbox=kendra@desertservices.net --before=2024-10-01
 *
 * Options:
 *   --mailbox=<email>   Mailbox to download from (required)
 *   --before=<date>     Only emails before this date (default: all time)
 *   --after=<date>      Only emails after this date (default: 1 year ago)
 *   --output=<dir>      Output directory (default: ./archives/<mailbox>)
 *   --limit=<n>         Max emails to process (default: 10000)
 *   --dry-run           Show what would be downloaded without actually downloading
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GraphEmailClient } from "../client";
import {
  db,
  getOrCreateMailbox,
  type InsertEmailData,
  insertEmail,
} from "./db";
import { htmlToText } from "./html-to-text";

interface ArchiveOptions {
  mailbox: string;
  before?: Date;
  after?: Date;
  outputDir?: string;
  limit?: number;
  dryRun?: boolean;
  onProgress?: (progress: ArchiveProgress) => void;
}

interface ArchiveProgress {
  phase: "fetching" | "downloading" | "complete";
  emailsProcessed: number;
  attachmentsDownloaded: number;
  conversationsFound: number;
  currentEmail?: string;
}

interface ConversationMeta {
  conversationId: string;
  subject: string;
  emails: Array<{
    messageId: string;
    from: string;
    to: string[];
    receivedAt: string;
    subject: string;
    bodyPreview: string;
    hasAttachments: boolean;
    attachments: Array<{
      name: string;
      contentType: string;
      size: number;
      localPath?: string;
    }>;
  }>;
  attachmentCount: number;
  firstEmail: string;
  lastEmail: string;
}

function createGraphClient(): GraphEmailClient {
  const config = {
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    batchSize: 100,
  };

  if (
    !(config.azureTenantId && config.azureClientId && config.azureClientSecret)
  ) {
    throw new Error("Missing Azure credentials in environment variables");
  }

  const client = new GraphEmailClient(config);
  client.initAppAuth();
  return client;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

function getConversationFolder(conversationId: string): string {
  // Create a short hash from the full conversation ID to ensure uniqueness
  let hash = 0;
  for (const char of conversationId) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const hashStr = Math.abs(hash).toString(36);
  // Use last part of conversation ID (more unique) + hash
  const suffix = conversationId.slice(-12).replace(/[^a-zA-Z0-9]/g, "");
  return `${suffix}_${hashStr}`.substring(0, 24);
}

export async function downloadArchive(options: ArchiveOptions): Promise<{
  emailsProcessed: number;
  attachmentsDownloaded: number;
  conversationsCreated: number;
  outputDir: string;
}> {
  const {
    mailbox,
    before,
    after = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
    limit = 10_000,
    dryRun = false,
    onProgress,
  } = options;

  // Determine output directory
  const mailboxName = mailbox.split("@")[0];
  const outputDir =
    options.outputDir ?? join(process.cwd(), "archives", mailboxName);

  if (!(dryRun || existsSync(outputDir))) {
    mkdirSync(outputDir, { recursive: true });
  }

  const client = createGraphClient();
  const mailboxRecord = getOrCreateMailbox(mailbox);

  // Track conversations and their metadata
  const conversations = new Map<string, ConversationMeta>();

  let emailsProcessed = 0;
  let attachmentsDownloaded = 0;

  const reportProgress = () => {
    onProgress?.({
      phase: "fetching",
      emailsProcessed,
      attachmentsDownloaded,
      conversationsFound: conversations.size,
    });
  };

  // Build date filter for API - use proper filter that includes both bounds
  const beforeTime = before?.getTime();

  // Process emails using filterEmails with chunked date ranges to avoid timeouts
  // Split the date range into monthly chunks
  const chunks: Array<{ start: Date; end: Date }> = [];
  let chunkStart = new Date(after);
  const endDate = before ?? new Date();

  while (chunkStart < endDate) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + 1);
    chunks.push({
      start: new Date(chunkStart),
      end: chunkEnd > endDate ? endDate : chunkEnd,
    });
    chunkStart = chunkEnd;
  }

  onProgress?.({
    phase: "fetching",
    emailsProcessed: 0,
    attachmentsDownloaded: 0,
    conversationsFound: 0,
  });

  // Process each month chunk
  for (const chunk of chunks) {
    const chunkFilter = `receivedDateTime ge ${chunk.start.toISOString()} and receivedDateTime lt ${chunk.end.toISOString()}`;

    try {
      const emails = await client.filterEmails({
        filter: chunkFilter,
        userId: mailbox,
        limit: 1000, // Up to 1000 per chunk
      });

      for (const email of emails) {
        // Double-check date filter (compare timestamps for reliability)
        if (beforeTime && email.receivedDateTime.getTime() >= beforeTime) {
          continue;
        }

        const conversationId = email.conversationId ?? `single_${email.id}`;
        const convFolder = getConversationFolder(conversationId);

        // Get or create conversation metadata
        if (!conversations.has(conversationId)) {
          conversations.set(conversationId, {
            conversationId,
            subject: email.subject.replace(/^(Re:|Fw:|Fwd:)\s*/gi, "").trim(),
            emails: [],
            attachmentCount: 0,
            firstEmail: email.receivedDateTime.toISOString(),
            lastEmail: email.receivedDateTime.toISOString(),
          });
        }

        const conv = conversations.get(conversationId)!;

        // Update conversation timestamps
        const receivedIso = email.receivedDateTime.toISOString();
        if (receivedIso < conv.firstEmail) {
          conv.firstEmail = receivedIso;
        }
        if (receivedIso > conv.lastEmail) {
          conv.lastEmail = receivedIso;
        }

        // Store email in database
        const plainText = await htmlToText(email.bodyContent);
        const emailData: InsertEmailData = {
          messageId: email.id,
          mailboxId: mailboxRecord.id,
          conversationId: email.conversationId ?? null,
          subject: email.subject,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          toEmails: email.toRecipients.map((r) => r.email),
          ccEmails: email.ccRecipients.map((r) => r.email),
          receivedAt: email.receivedDateTime.toISOString(),
          hasAttachments: email.hasAttachments ?? false,
          attachmentNames: [],
          bodyPreview: plainText.substring(0, 500),
          bodyFull: plainText,
        };

        const emailId = insertEmail(emailData);

        // Build email metadata for conversation
        const emailMeta = {
          messageId: email.id,
          from: email.fromEmail,
          to: email.toRecipients.map((r) => r.email),
          receivedAt: email.receivedDateTime.toISOString(),
          subject: email.subject,
          bodyPreview: plainText.substring(0, 300),
          bodyFull: plainText,
          bodyHtml: email.bodyContent,
          hasAttachments: email.hasAttachments ?? false,
          attachments: [] as Array<{
            name: string;
            contentType: string;
            size: number;
            localPath?: string;
          }>,
        };

        // Download attachments
        if (email.hasAttachments) {
          try {
            const attachments = await client.getAttachments(email.id, mailbox);

            for (const att of attachments) {
              const attMeta = {
                name: att.name,
                contentType: att.contentType ?? "application/octet-stream",
                size: att.size ?? 0,
                localPath: undefined as string | undefined,
              };

              // Only download PDFs for now (most useful for contracts)
              const isPdf =
                att.contentType?.toLowerCase() === "application/pdf" ||
                att.name.toLowerCase().endsWith(".pdf");

              if (isPdf && !dryRun) {
                // Check if already downloaded (resume support)
                const safeName = sanitizeFilename(att.name);
                const convDir = join(outputDir, convFolder);
                const filePath = join(convDir, safeName);

                if (existsSync(filePath)) {
                  attMeta.localPath = safeName;
                  attachmentsDownloaded++;
                  conv.attachmentCount++;
                  emailMeta.attachments.push(attMeta);
                  continue;
                }

                try {
                  // downloadAttachment returns a Buffer directly
                  const buffer = await client.downloadAttachment(
                    email.id,
                    att.id,
                    mailbox
                  );

                  // Create conversation folder
                  const convDir = join(outputDir, convFolder);
                  if (!existsSync(convDir)) {
                    mkdirSync(convDir, { recursive: true });
                  }

                  // Save attachment
                  writeFileSync(filePath, buffer);

                  attMeta.localPath = safeName;
                  attachmentsDownloaded++;
                  conv.attachmentCount++;
                } catch (err) {
                  console.error(`Failed to download ${att.name}: ${err}`);
                }
              }

              emailMeta.attachments.push(attMeta);
            }

            // Update email in DB with attachment names
            if (emailId && attachments.length > 0) {
              const attNames = attachments.map((a) => a.name);
              db.run("UPDATE emails SET attachment_names = ? WHERE id = ?", [
                JSON.stringify(attNames),
                emailId,
              ]);
            }
          } catch (err) {
            console.error(
              `Failed to fetch attachments for ${email.subject}: ${err}`
            );
          }
        }

        conv.emails.push(emailMeta);
        emailsProcessed++;
        reportProgress();
      }
    } catch (err) {
      console.error(
        `Error fetching chunk ${chunk.start.toISOString()}: ${err}`
      );
    }
  }

  // Write conversation metadata files
  if (!dryRun) {
    for (const [convId, conv] of conversations) {
      // Only write if conversation has attachments
      if (conv.attachmentCount > 0) {
        const convFolder = getConversationFolder(convId);
        const convDir = join(outputDir, convFolder);

        if (!existsSync(convDir)) {
          mkdirSync(convDir, { recursive: true });
        }

        // Sort emails by date
        conv.emails.sort(
          (a, b) =>
            new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
        );

        // Write metadata
        const metaPath = join(convDir, "_conversation.json");
        writeFileSync(metaPath, JSON.stringify(conv, null, 2));
      }
    }

    // Write index file
    const index = {
      mailbox,
      downloadedAt: new Date().toISOString(),
      dateRange: {
        after: after.toISOString(),
        before: before?.toISOString() ?? null,
      },
      stats: {
        emailsProcessed,
        attachmentsDownloaded,
        conversationsWithAttachments: [...conversations.values()].filter(
          (c) => c.attachmentCount > 0
        ).length,
      },
      conversations: [...conversations.entries()]
        .filter(([_, c]) => c.attachmentCount > 0)
        .map(([id, c]) => ({
          folder: getConversationFolder(id),
          subject: c.subject,
          emailCount: c.emails.length,
          attachmentCount: c.attachmentCount,
          dateRange: `${c.firstEmail.split("T")[0]} to ${c.lastEmail.split("T")[0]}`,
        }))
        .sort((a, b) => b.attachmentCount - a.attachmentCount),
    };

    writeFileSync(
      join(outputDir, "_index.json"),
      JSON.stringify(index, null, 2)
    );
  }

  onProgress?.({
    phase: "complete",
    emailsProcessed,
    attachmentsDownloaded,
    conversationsFound: conversations.size,
  });

  return {
    emailsProcessed,
    attachmentsDownloaded,
    conversationsCreated: [...conversations.values()].filter(
      (c) => c.attachmentCount > 0
    ).length,
    outputDir,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  const mailboxArg = args.find((a) => a.startsWith("--mailbox="));
  const beforeArg = args.find((a) => a.startsWith("--before="));
  const afterArg = args.find((a) => a.startsWith("--after="));
  const outputArg = args.find((a) => a.startsWith("--output="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const dryRun = args.includes("--dry-run");

  if (!mailboxArg) {
    console.error("Error: --mailbox=<email> is required");
    console.error(
      "\nExample: bun services/email/census/download-archive.ts --mailbox=kendra@desertservices.net --before=2024-10-01"
    );
    process.exit(1);
  }

  const mailbox = mailboxArg.split("=")[1];
  const before = beforeArg ? new Date(beforeArg.split("=")[1]) : undefined;
  const after = afterArg
    ? new Date(afterArg.split("=")[1])
    : new Date("2024-01-01"); // Default to start of 2024
  const outputDir = outputArg?.split("=")[1];
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 10_000;

  console.log("=".repeat(60));
  console.log("EMAIL ARCHIVE DOWNLOADER");
  console.log("=".repeat(60));
  console.log(`Mailbox: ${mailbox}`);
  console.log(
    `Date range: ${after.toISOString().split("T")[0]} to ${before?.toISOString().split("T")[0] ?? "now"}`
  );
  console.log(`Limit: ${limit}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("=".repeat(60));
  console.log();

  downloadArchive({
    mailbox,
    before,
    after,
    outputDir,
    limit,
    dryRun,
    onProgress: (p) => {
      if (p.phase === "fetching") {
        process.stdout.write(
          `\r[Processing] ${p.emailsProcessed} emails, ${p.attachmentsDownloaded} attachments, ${p.conversationsFound} conversations`
        );
      } else if (p.phase === "complete") {
        console.log(`\n\n${"=".repeat(60)}`);
        console.log("COMPLETE");
        console.log("=".repeat(60));
      }
    },
  })
    .then((result) => {
      console.log(`Emails processed: ${result.emailsProcessed}`);
      console.log(`Attachments downloaded: ${result.attachmentsDownloaded}`);
      console.log(
        `Conversations with attachments: ${result.conversationsCreated}`
      );
      console.log(`Output directory: ${result.outputDir}`);
    })
    .catch((err) => {
      console.error("\nFailed:", err);
      process.exit(1);
    });
}
