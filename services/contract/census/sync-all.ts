import { BUCKETS, uploadFile } from "@/lib/minio";
import { GraphEmailClient } from "../client";
import {
  db,
  getAllMailboxes,
  getMailbox,
  getOrCreateMailbox,
  type InsertAttachmentData,
  type InsertEmailData,
  insertAttachment,
  insertEmail,
  updateMailboxSyncState,
} from "./db";
import { htmlToText } from "./lib/html-to-text";

// All company mailboxes to sync
// NOTE: internalcontracts@ is a Microsoft 365 Group, not a mailbox.
// Use sync-groups.ts to sync group conversations instead.
export const ALL_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
  "estimating@desertservices.net",
  "kendra@desertservices.net",
  "kerin@desertservices.net",
  "jayson@desertservices.net",
  "jeff@desertservices.net",
  "jared@desertservices.net",
  "rick@desertservices.net",
  "dawn@desertservices.net",
  "eva@desertservices.net",
] as const;

// Microsoft 365 Groups to sync (use sync-groups.ts)
export const ALL_GROUPS = {
  "internalcontracts@desertservices.net":
    "962f9440-9bde-4178-b538-edc7f8d3ecce",
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface SyncAllOptions {
  mailboxes?: string[];
  since?: Date;
  before?: Date; // Only emails before this date
  maxPerMailbox?: number;
  concurrency?: number;
  incremental?: boolean;
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

    // Fetch emails from Graph API
    let emails = await client.getAllEmailsPaginated(
      mailboxEmail,
      since,
      maxEmails
    );

    // Filter by before date if specified
    if (before) {
      const beforeTime = before.getTime();
      emails = emails.filter((e) => e.receivedDateTime.getTime() < beforeTime);
    }

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
        categories: email.categories ?? [],
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

        // Check if attachment already uploaded (resume support)
        const existingAtt = db
          .query<{ storage_path: string | null }, [number, string]>(
            "SELECT storage_path FROM attachments WHERE email_id = ? AND attachment_id = ?"
          )
          .get(emailId, att.id);

        const alreadyUploaded = Boolean(existingAtt?.storage_path);

        // Download and upload PDF to MinIO (skip if already uploaded)
        if (isPdf && !alreadyUploaded) {
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
        } else if (alreadyUploaded) {
          // Use existing storage info
          storageBucket = BUCKETS.EMAIL_ATTACHMENTS;
          storagePath = existingAtt?.storage_path ?? null;
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
        attachmentCount++;
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

// ============================================================================
// Post-Sync Enrichment
// ============================================================================

// Internal domains for is_internal flag
const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);

// Forward indicators in subject
const FORWARD_PREFIXES = ["fw:", "fwd:", "forwarded:"];

// Regex patterns to extract original sender from forwarded emails
const OUTLOOK_FORWARD_REGEX =
  /from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s*sent:/i;
const GMAIL_FORWARD_REGEX =
  /[-]+\s*(?:forwarded|original)\s+message\s*[-]+[\s\S]*?from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i;
const GENERIC_FROM_REGEX =
  /from:\s*[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i;

function extractDomain(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const atIndex = email.indexOf("@");
  if (atIndex === -1) {
    return null;
  }
  return email
    .slice(atIndex + 1)
    .toLowerCase()
    .trim();
}

function isForwardedSubject(subject: string | null): boolean {
  if (!subject) {
    return false;
  }
  const lower = subject.toLowerCase().trim();
  return FORWARD_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function extractOriginalSender(body: string | null): string | null {
  if (!body) {
    return null;
  }

  let match = body.match(OUTLOOK_FORWARD_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  match = body.match(GMAIL_FORWARD_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  match = body.match(GENERIC_FROM_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return null;
}

interface EmailRowForEnrich {
  id: number;
  from_email: string | null;
  subject: string | null;
  body_full: string | null;
  body_preview: string | null;
}

/**
 * Enriches emails with domain info, internal flag, forward detection.
 * This runs on ALL emails (not just newly synced) to ensure consistency.
 */
export function enrichEmailDomains(): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("ENRICHING EMAIL DOMAINS");
  console.log(`${"=".repeat(60)}\n`);

  const emails = db
    .query<EmailRowForEnrich, []>(
      "SELECT id, from_email, subject, body_full, body_preview FROM emails WHERE from_domain IS NULL"
    )
    .all();

  if (emails.length === 0) {
    console.log("No emails need domain enrichment.");
    return;
  }

  console.log(`Enriching ${emails.length} emails...\n`);

  const updateStmt = db.prepare(`
    UPDATE emails SET
      from_domain = ?,
      is_internal = ?,
      is_forwarded = ?,
      original_sender_email = ?,
      original_sender_domain = ?
    WHERE id = ?
  `);

  let enriched = 0;
  let internal = 0;
  let forwarded = 0;
  let withOriginalSender = 0;

  db.run("BEGIN TRANSACTION");

  for (const email of emails) {
    const fromDomain = extractDomain(email.from_email);
    const isInternal = fromDomain ? INTERNAL_DOMAINS.has(fromDomain) : false;
    const isForwarded = isForwardedSubject(email.subject);

    let originalSenderEmail: string | null = null;
    let originalSenderDomain: string | null = null;

    if (isForwarded) {
      originalSenderEmail =
        extractOriginalSender(email.body_full) ||
        extractOriginalSender(email.body_preview);
      if (originalSenderEmail) {
        originalSenderDomain = extractDomain(originalSenderEmail);
        withOriginalSender++;
      }
    }

    updateStmt.run(
      fromDomain,
      isInternal ? 1 : 0,
      isForwarded ? 1 : 0,
      originalSenderEmail,
      originalSenderDomain,
      email.id
    );

    enriched++;
    if (isInternal) {
      internal++;
    }
    if (isForwarded) {
      forwarded++;
    }
  }

  db.run("COMMIT");

  console.log(`Enriched: ${enriched}`);
  console.log(`Internal: ${internal}`);
  console.log(`Forwarded: ${forwarded}`);
  console.log(`Forwards with original sender: ${withOriginalSender}`);
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
    // Also show group status
    console.log(`\n${"=".repeat(60)}`);
    console.log("M365 GROUP STATUS");
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
    }
    console.log(
      `\nNote: Use 'bun sync-groups.ts' to sync M365 group conversations`
    );
    process.exit(0);
  }

  // Parse options - support both --flag=value and --flag value formats
  function getArgValue(flag: string): string | undefined {
    // Check --flag=value format
    const eqArg = args.find((a) => a.startsWith(`--${flag}=`));
    if (eqArg) {
      return eqArg.split("=")[1];
    }
    // Check --flag value format
    const idx = args.indexOf(`--${flag}`);
    if (
      idx !== -1 &&
      idx + 1 < args.length &&
      !args[idx + 1].startsWith("--")
    ) {
      return args[idx + 1];
    }
    return undefined;
  }

  const mailboxValue = getArgValue("mailbox");
  const sinceValue = getArgValue("since");
  const beforeValue = getArgValue("before");
  const monthsValue = getArgValue("months");
  const limitValue = getArgValue("limit");
  const concurrencyValue = getArgValue("concurrency");
  const incremental = args.includes("--incremental");
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
    // Support comma-separated mailboxes: --mailbox kendra@...,kerin@...
    options.mailboxes = mailboxValue.split(",").map((m) => m.trim());
  }

  if (sinceValue) {
    // Support "yesterday", "today", or date strings
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
    `Since: ${(options.since ?? new Date(Date.now() - 365 * MS_PER_DAY)).toISOString().split("T")[0]}`
  );
  console.log(
    `Before: ${options.before?.toISOString().split("T")[0] ?? "now"}`
  );
  console.log(
    `Mailboxes: ${(options.mailboxes ?? ALL_MAILBOXES).length} mailbox(es)`
  );
  console.log(`Max per mailbox: ${options.maxPerMailbox ?? 50_000}`);
  console.log(`Concurrency: ${options.concurrency ?? 3}`);
  console.log(`Incremental: ${incremental}`);
  console.log(`Include M365 Groups: ${includeGroups}`);
  console.log(`${"=".repeat(60)}\n`);

  // Import enrichment modules (dynamic to avoid circular deps)
  const { processPlatformEmails } = await import("./lib/platform-extraction");
  const { linkEmailsToAccounts } = await import("./lib/link-accounts");

  try {
    // Step 1: Sync emails from Graph API
    const results = await syncAllMailboxes(options);
    printSyncSummary(results);

    // Step 1b: Sync M365 Groups if requested
    if (includeGroups) {
      console.log(`\n${"=".repeat(60)}`);
      console.log("SYNCING M365 GROUPS");
      console.log(`${"=".repeat(60)}\n`);

      const { syncAllGroups } = await import("./sync-groups");
      const groupResults = await syncAllGroups({
        since: options.since,
        onProgress: (p) => {
          let emoji = "→";
          if (p.phase === "complete") emoji = "✓";
          else if (p.phase === "error") emoji = "✗";

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

    // Step 2: Enrich with domain info (from_domain, is_internal, is_forwarded)
    enrichEmailDomains();

    // Step 3: Extract real senders from platform emails (BuildingConnected, Procore, etc.)
    console.log(`\n${"=".repeat(60)}`);
    console.log("EXTRACTING PLATFORM SENDERS");
    console.log(`${"=".repeat(60)}\n`);
    processPlatformEmails();

    // Step 4: Link emails to accounts by domain
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
