/**
 * Email Census Sync
 *
 * Pulls emails from Microsoft Graph API for multiple mailboxes and stores
 * metadata in SQLite. Supports incremental syncing based on last sync time.
 */
import { GraphEmailClient } from "../client";
import {
  getOrCreateMailbox,
  type InsertEmailData,
  insertEmail,
  updateMailboxSyncState,
} from "./db";
import { htmlToText } from "./html-to-text";

// Target mailboxes to sync
export const TARGET_MAILBOXES = [
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

// Default sync period: 6 months
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

interface SyncOptions {
  /** Specific mailboxes to sync (defaults to all TARGET_MAILBOXES) */
  mailboxes?: string[];
  /** Start date for sync (defaults to 6 months ago) */
  since?: Date;
  /** Maximum emails per mailbox (defaults to 10000) */
  maxPerMailbox?: number;
  /** Callback for progress updates */
  onProgress?: (progress: SyncProgress) => void;
}

interface SyncProgress {
  mailbox: string;
  phase: "starting" | "streaming" | "complete" | "error";
  emailsProcessed?: number;
  pageNumber?: number;
  hasMore?: boolean;
  error?: string;
}

interface SyncResult {
  mailbox: string;
  emailsStored: number;
  error?: string;
}

/**
 * Creates a Graph API client with app authentication.
 */
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
 * Syncs emails from a single mailbox to the database using streaming.
 *
 * Uses page-by-page streaming to avoid memory issues with large mailboxes.
 * Each page of emails is stored immediately before fetching the next page.
 */
async function syncMailbox(
  client: GraphEmailClient,
  mailboxEmail: string,
  since: Date,
  maxEmails: number,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const reportProgress = (progress: SyncProgress) => {
    if (onProgress) {
      onProgress(progress);
    }
  };

  try {
    reportProgress({ mailbox: mailboxEmail, phase: "starting" });

    // Get or create the mailbox record
    const mailbox = getOrCreateMailbox(mailboxEmail);

    let storedCount = 0;

    // Stream emails page-by-page, storing each page immediately
    await client.streamEmailsPaginated({
      userId: mailboxEmail,
      since,
      maxEmails,
      onPage: async (emails, progress) => {
        // Report streaming progress
        reportProgress({
          mailbox: mailboxEmail,
          phase: "streaming",
          emailsProcessed: progress.processed,
          pageNumber: progress.pageNumber,
          hasMore: progress.hasMore,
        });

        // Store each email in this page immediately
        for (const email of emails) {
          // Extract attachment names if we have attachments
          let attachmentNames: string[] = [];
          if (email.hasAttachments) {
            try {
              const attachments = await client.getAttachments(
                email.id,
                mailboxEmail
              );
              attachmentNames = attachments.map((a) => a.name);
            } catch {
              // Skip attachment fetch errors, just continue without names
            }
          }

          // Convert HTML body to plain text
          const plainText = await htmlToText(email.bodyContent);

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
            bodyPreview: plainText.substring(0, 500),
            bodyFull: plainText,
          };

          insertEmail(emailData);
          storedCount++;
        }
      },
    });

    // Update mailbox sync state
    updateMailboxSyncState(mailbox.id, storedCount);

    reportProgress({
      mailbox: mailboxEmail,
      phase: "complete",
      emailsProcessed: storedCount,
    });

    return {
      mailbox: mailboxEmail,
      emailsStored: storedCount,
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
      error: errorMessage,
    };
  }
}

/**
 * Syncs emails from multiple mailboxes.
 *
 * @example
 * // Sync all mailboxes for the last 6 months
 * const results = await syncEmails();
 *
 * @example
 * // Sync specific mailbox with progress
 * const results = await syncEmails({
 *   mailboxes: ['chi@desertservices.com'],
 *   since: new Date('2024-06-01'),
 *   onProgress: (p) => console.log(`${p.mailbox}: ${p.phase}`)
 * });
 */
export async function syncEmails(
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  const {
    mailboxes = [...TARGET_MAILBOXES],
    since = new Date(Date.now() - SIX_MONTHS_MS),
    maxPerMailbox = 10_000,
    onProgress,
  } = options;

  const client = createGraphClient();
  const results: SyncResult[] = [];

  for (const mailbox of mailboxes) {
    const result = await syncMailbox(
      client,
      mailbox,
      since,
      maxPerMailbox,
      onProgress
    );
    results.push(result);
  }

  return results;
}

/**
 * Syncs a single mailbox. Convenience wrapper around syncEmails.
 */
export async function syncSingleMailbox(
  mailboxEmail: string,
  options: Omit<SyncOptions, "mailboxes"> = {}
): Promise<SyncResult> {
  const results = await syncEmails({
    ...options,
    mailboxes: [mailboxEmail],
  });
  return results[0];
}

/**
 * Prints sync results to console in a readable format.
 */
export function printSyncResults(results: SyncResult[]): void {
  console.log("\n=== Email Sync Results ===\n");

  let totalEmails = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`[ERROR] ${result.mailbox}: ${result.error}`);
      errorCount++;
    } else {
      console.log(`[OK] ${result.mailbox}: ${result.emailsStored} emails`);
      totalEmails += result.emailsStored;
      successCount++;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Mailboxes synced: ${successCount}/${results.length}`);
  console.log(`Total emails: ${totalEmails}`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  const mailboxArg = args.find((a) => a.startsWith("--mailbox="));
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const limitArg = args.find((a) => a.startsWith("--limit="));

  const options: SyncOptions = {
    onProgress: (p) => {
      if (p.phase === "starting") {
        console.log(`[${p.mailbox}] Starting sync...`);
      } else if (p.phase === "streaming") {
        const moreIndicator = p.hasMore ? "..." : " (last page)";
        console.log(
          `[${p.mailbox}] Page ${p.pageNumber}: ${p.emailsProcessed} emails stored${moreIndicator}`
        );
      } else if (p.phase === "complete") {
        console.log(
          `[${p.mailbox}] Complete: ${p.emailsProcessed} emails stored`
        );
      } else if (p.phase === "error") {
        console.log(`[${p.mailbox}] Error: ${p.error}`);
      }
    },
  };

  if (mailboxArg) {
    const mailbox = mailboxArg.split("=")[1];
    options.mailboxes = [mailbox];
  }

  if (sinceArg) {
    const sinceStr = sinceArg.split("=")[1];
    options.since = new Date(sinceStr);
  }

  if (limitArg) {
    const limit = Number.parseInt(limitArg.split("=")[1], 10);
    if (!Number.isNaN(limit)) {
      options.maxPerMailbox = limit;
    }
  }

  console.log("Starting email census sync...\n");
  console.log(
    `Since: ${(options.since ?? new Date(Date.now() - SIX_MONTHS_MS)).toISOString()}`
  );
  console.log(
    `Mailboxes: ${(options.mailboxes ?? TARGET_MAILBOXES).join(", ")}`
  );
  console.log(`Max per mailbox: ${options.maxPerMailbox ?? 10_000}\n`);

  syncEmails(options)
    .then((results) => {
      printSyncResults(results);
    })
    .catch((error) => {
      console.error("Sync failed:", error);
      process.exit(1);
    });
}
