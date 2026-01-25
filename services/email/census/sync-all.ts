import { BUCKETS, uploadFile } from "@/lib/minio";
import { GraphEmailClient } from "../client";
import {
  getAllMailboxes,
  getMailbox,
  getOrCreateMailbox,
  type InsertAttachmentData,
  type InsertEmailData,
  insertAttachment,
  insertEmail,
  updateAttachmentExtraction,
  updateMailboxSyncState,
} from "./db";
import { extractPdfWithMistral } from "./extract-attachments";
import { htmlToText } from "./html-to-text";

// All company mailboxes to sync
export const ALL_MAILBOXES = [
  "chi@desertservices.net",
  "internalcontracts@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
  "estimating@desertservices.net",
  "kendra@desertservices.net",
  "jayson@desertservices.net",
  "jeff@desertservices.net",
  "jared@desertservices.net",
  "rick@desertservices.net",
  "dawn@desertservices.net",
  "eva@desertservices.net",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface SyncAllOptions {
  mailboxes?: string[];
  since?: Date;
  maxPerMailbox?: number;
  concurrency?: number;
  incremental?: boolean;
  extract?: boolean; // Run OCR extraction on PDF attachments during sync
  onProgress?: (progress: SyncProgress) => void;
}

interface SyncProgress {
  mailbox: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  emailsFetched?: number;
  emailsStored?: number;
  attachmentsStored?: number;
  error?: string;
}

interface SyncResult {
  mailbox: string;
  emailsStored: number;
  attachmentsStored: number;
  error?: string;
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

/**
 * Syncs a single mailbox with full body and attachment metadata
 */
async function syncMailboxFull(
  client: GraphEmailClient,
  mailboxEmail: string,
  since: Date,
  maxEmails: number,
  extract: boolean,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const reportProgress = (progress: SyncProgress) => {
    onProgress?.(progress);
  };

  try {
    reportProgress({ mailbox: mailboxEmail, phase: "starting" });

    const mailbox = getOrCreateMailbox(mailboxEmail);

    reportProgress({ mailbox: mailboxEmail, phase: "fetching" });

    // Fetch emails from Graph API
    const emails = await client.getAllEmailsPaginated(
      mailboxEmail,
      since,
      maxEmails
    );

    reportProgress({
      mailbox: mailboxEmail,
      phase: "storing",
      emailsFetched: emails.length,
    });

    let storedCount = 0;
    let attachmentCount = 0;

    for (const email of emails) {
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
          attachmentNames = attachments.map((a) => a.name);
          attachmentMeta = attachments.map((a) => ({
            id: a.id,
            name: a.name,
            contentType: a.contentType,
            size: a.size,
          }));
        } catch {
          // Skip attachment fetch errors
        }
      }

      // Convert HTML to plain text for full body
      const fullText = await htmlToText(email.bodyContent);

      const emailData: InsertEmailData = {
        messageId: email.id,
        mailboxId: mailbox.id,
        conversationId: email.conversationId ?? null,
        subject: email.subject,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        toEmails: email.toRecipients.map((r) => r.email),
        ccEmails: email.ccRecipients.map((r) => r.email),
        receivedAt: email.receivedDateTime.toISOString(),
        hasAttachments: email.hasAttachments ?? false,
        attachmentNames,
        bodyPreview: fullText.substring(0, 500),
        bodyFull: fullText,
        bodyHtml: email.bodyContent, // Store original HTML for links
      };

      const emailId = insertEmail(emailData);

      // Store attachment metadata, upload PDFs to MinIO, and optionally extract
      for (const att of attachmentMeta) {
        const isPdf =
          att.contentType?.toLowerCase() === "application/pdf" ||
          att.name.toLowerCase().endsWith(".pdf");

        let storageBucket: string | null = null;
        let storagePath: string | null = null;
        let pdfBuffer: Buffer | null = null;

        // Download and upload PDF to MinIO
        if (isPdf) {
          try {
            pdfBuffer = await client.downloadAttachment(
              email.id,
              att.id,
              mailboxEmail
            );

            // Upload to MinIO: email-attachments/{emailId}/{attachmentId}/{filename}
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
            console.error(
              `Failed to upload ${att.name} to MinIO: ${uploadErr}`
            );
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
        const attachmentDbId = insertAttachment(attData);
        attachmentCount++;

        // Extract PDF content if extraction is enabled and we have the buffer
        if (extract && isPdf && pdfBuffer) {
          try {
            const extractedText = await extractPdfWithMistral(
              pdfBuffer,
              att.name
            );
            updateAttachmentExtraction(
              attachmentDbId,
              "success",
              extractedText
            );
          } catch (extractError) {
            const errMsg =
              extractError instanceof Error
                ? extractError.message
                : String(extractError);
            updateAttachmentExtraction(attachmentDbId, "failed", null, errMsg);
          }
        }
      }

      storedCount++;

      // Progress update every 100 emails
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
    since = new Date(Date.now() - 365 * MS_PER_DAY), // Default: 1 year
    maxPerMailbox = 50_000,
    concurrency = 3,
    incremental = false,
    extract = false,
    onProgress,
  } = options;

  const client = createGraphClient();
  const results: SyncResult[] = [];

  // Process mailboxes in batches for concurrency control
  for (let i = 0; i < mailboxes.length; i += concurrency) {
    const batch = mailboxes.slice(i, i + concurrency);

    const batchPromises = batch.map((mailboxEmail) => {
      // For incremental sync, use the mailbox's last sync time
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
        maxPerMailbox,
        extract,
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

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  // Check for status command
  if (args.includes("status")) {
    showSyncStatus();
    process.exit(0);
  }

  // Parse options
  const mailboxArg = args.find((a) => a.startsWith("--mailbox="));
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const monthsArg = args.find((a) => a.startsWith("--months="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
  const incremental = args.includes("--incremental");
  const extract = args.includes("--extract");

  const options: SyncAllOptions = {
    incremental,
    extract,
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

  if (mailboxArg) {
    options.mailboxes = [mailboxArg.split("=")[1]];
  }

  if (sinceArg) {
    options.since = new Date(sinceArg.split("=")[1]);
  } else if (monthsArg) {
    const months = Number.parseInt(monthsArg.split("=")[1], 10);
    if (!Number.isNaN(months)) {
      options.since = new Date(Date.now() - months * 30 * MS_PER_DAY);
    }
  }

  if (limitArg) {
    const limit = Number.parseInt(limitArg.split("=")[1], 10);
    if (!Number.isNaN(limit)) {
      options.maxPerMailbox = limit;
    }
  }

  if (concurrencyArg) {
    const conc = Number.parseInt(concurrencyArg.split("=")[1], 10);
    if (!Number.isNaN(conc)) {
      options.concurrency = conc;
    }
  }

  console.log("=".repeat(60));
  console.log("COMPREHENSIVE EMAIL SYNC");
  console.log("=".repeat(60));
  console.log(
    `Since: ${(options.since ?? new Date(Date.now() - 365 * MS_PER_DAY)).toISOString().split("T")[0]}`
  );
  console.log(
    `Mailboxes: ${(options.mailboxes ?? ALL_MAILBOXES).length} mailbox(es)`
  );
  console.log(`Max per mailbox: ${options.maxPerMailbox ?? 50_000}`);
  console.log(`Concurrency: ${options.concurrency ?? 3}`);
  console.log(`Incremental: ${incremental}`);
  console.log(`Extract PDFs: ${extract}`);
  console.log(`${"=".repeat(60)}\n`);

  syncAllMailboxes(options)
    .then((results) => {
      printSyncSummary(results);
    })
    .catch((error) => {
      console.error("Sync failed:", error);
      process.exit(1);
    });
}
