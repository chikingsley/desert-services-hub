/**
 * Email Census Backfill
 *
 * Fetches missing conversation_id and body_full for existing emails in the database.
 * This is needed because earlier syncs may not have captured this data.
 */
import { GraphEmailClient } from "../client";
import { db } from "./db";
import { htmlToText } from "./html-to-text";

// ============================================================================
// Types
// ============================================================================

interface BackfillOptions {
  /** Maximum emails to backfill (defaults to 1000) */
  limit?: number;
  /** Only backfill emails missing body_full */
  bodyOnly?: boolean;
  /** Only backfill emails missing conversation_id */
  conversationOnly?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: BackfillProgress) => void;
}

interface BackfillProgress {
  processed: number;
  total: number;
  updated: number;
  errors: number;
  currentEmail?: {
    id: number;
    subject: string | null;
  };
}

interface BackfillResult {
  processed: number;
  updated: number;
  errors: number;
  errorDetails: Array<{ emailId: number; error: string }>;
}

// ============================================================================
// Database Queries
// ============================================================================

interface EmailWithMailbox {
  id: number;
  message_id: string;
  mailbox_email: string;
  subject: string | null;
  conversation_id: string | null;
  body_full: string | null;
}

/**
 * Get emails that need backfilling (missing conversation_id or body_full).
 */
function getEmailsNeedingBackfill(
  limit: number,
  bodyOnly: boolean,
  conversationOnly: boolean
): EmailWithMailbox[] {
  let condition: string;

  if (bodyOnly) {
    condition = "e.body_full IS NULL OR e.body_full = ''";
  } else if (conversationOnly) {
    condition = "e.conversation_id IS NULL";
  } else {
    // Both missing
    condition =
      "(e.body_full IS NULL OR e.body_full = '') OR e.conversation_id IS NULL";
  }

  const query = `
    SELECT
      e.id,
      e.message_id,
      m.email as mailbox_email,
      e.subject,
      e.conversation_id,
      e.body_full
    FROM emails e
    JOIN mailboxes m ON e.mailbox_id = m.id
    WHERE ${condition}
    ORDER BY e.received_at DESC
    LIMIT ?
  `;

  return db.query<EmailWithMailbox, [number]>(query).all(limit);
}

/**
 * Update email with backfilled data.
 */
function updateEmailBackfill(
  emailId: number,
  conversationId: string | null,
  bodyFull: string | null
): void {
  db.run(
    `UPDATE emails
     SET conversation_id = COALESCE(?, conversation_id),
         body_full = COALESCE(?, body_full)
     WHERE id = ?`,
    [conversationId, bodyFull, emailId]
  );
}

// ============================================================================
// Graph Client
// ============================================================================

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

// ============================================================================
// Backfill Logic
// ============================================================================

/**
 * Backfill missing conversation_id and body_full for existing emails.
 *
 * @example
 * // Backfill all missing data
 * const result = await backfillEmails({ limit: 500 });
 *
 * @example
 * // Backfill only body_full
 * const result = await backfillEmails({ bodyOnly: true, limit: 100 });
 */
export async function backfillEmails(
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const {
    limit = 1000,
    bodyOnly = false,
    conversationOnly = false,
    onProgress,
  } = options;

  const client = createGraphClient();
  const emails = getEmailsNeedingBackfill(limit, bodyOnly, conversationOnly);

  const result: BackfillResult = {
    processed: 0,
    updated: 0,
    errors: 0,
    errorDetails: [],
  };

  for (const email of emails) {
    try {
      // Report progress
      onProgress?.({
        processed: result.processed,
        total: emails.length,
        updated: result.updated,
        errors: result.errors,
        currentEmail: {
          id: email.id,
          subject: email.subject,
        },
      });

      // Fetch full email from Graph API
      const fullEmail = await client.getEmail(
        email.message_id,
        email.mailbox_email
      );

      if (!fullEmail) {
        result.errors++;
        result.errorDetails.push({
          emailId: email.id,
          error: "Email not found in Graph API",
        });
        result.processed++;
        continue;
      }

      // Prepare update data
      let conversationId: string | null = null;
      let bodyFull: string | null = null;

      // Only update conversation_id if it was missing
      if (!email.conversation_id && fullEmail.conversationId) {
        conversationId = fullEmail.conversationId;
      }

      // Only update body_full if it was missing
      if (!email.body_full || email.body_full === "") {
        const plainText = await htmlToText(fullEmail.bodyContent);
        bodyFull = plainText;
      }

      // Update if we have new data
      if (conversationId || bodyFull) {
        updateEmailBackfill(email.id, conversationId, bodyFull);
        result.updated++;
      }

      result.processed++;

      // Rate limiting - 100ms between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      result.errors++;
      result.errorDetails.push({
        emailId: email.id,
        error: error instanceof Error ? error.message : String(error),
      });
      result.processed++;
    }
  }

  // Final progress report
  onProgress?.({
    processed: result.processed,
    total: emails.length,
    updated: result.updated,
    errors: result.errors,
  });

  return result;
}

/**
 * Get statistics about emails needing backfill.
 */
export function getBackfillStats(): {
  missingBodyFull: number;
  missingConversationId: number;
  missingBoth: number;
  total: number;
} {
  const missingBodyFull =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM emails WHERE body_full IS NULL OR body_full = ''"
      )
      .get()?.count ?? 0;

  const missingConversationId =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM emails WHERE conversation_id IS NULL"
      )
      .get()?.count ?? 0;

  const missingBoth =
    db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) as count FROM emails
       WHERE (body_full IS NULL OR body_full = '') AND conversation_id IS NULL`
      )
      .get()?.count ?? 0;

  const total =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM emails")
      .get()?.count ?? 0;

  return {
    missingBodyFull,
    missingConversationId,
    missingBoth,
    total,
  };
}

/**
 * Print backfill results to console.
 */
export function printBackfillResults(result: BackfillResult): void {
  console.log("\n=== Backfill Results ===\n");
  console.log(`Processed: ${result.processed}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Errors: ${result.errors}`);

  if (result.errorDetails.length > 0) {
    console.log("\nError Details:");
    for (const err of result.errorDetails.slice(0, 10)) {
      console.log(`  Email ${err.emailId}: ${err.error}`);
    }
    if (result.errorDetails.length > 10) {
      console.log(`  ... and ${result.errorDetails.length - 10} more errors`);
    }
  }

  const successRate =
    result.processed > 0
      ? ((result.updated / result.processed) * 100).toFixed(1)
      : "0";
  console.log(`\nSuccess rate: ${successRate}%`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);

  const limitArg = args.find((a) => a.startsWith("--limit="));
  const bodyOnly = args.includes("--body-only");
  const conversationOnly = args.includes("--conversation-only");
  const statsOnly = args.includes("--stats");

  // Show stats
  if (statsOnly) {
    const stats = getBackfillStats();
    console.log("\n=== Backfill Stats ===\n");
    console.log(`Total emails: ${stats.total}`);
    console.log(`Missing body_full: ${stats.missingBodyFull}`);
    console.log(`Missing conversation_id: ${stats.missingConversationId}`);
    console.log(`Missing both: ${stats.missingBoth}`);
    process.exit(0);
  }

  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 1000;

  console.log("Starting email backfill...\n");
  console.log(`Limit: ${limit}`);
  console.log(
    `Mode: ${bodyOnly ? "body_full only" : conversationOnly ? "conversation_id only" : "both"}`
  );

  // Show initial stats
  const stats = getBackfillStats();
  console.log("\nEmails needing backfill:");
  console.log(`  Missing body_full: ${stats.missingBodyFull}`);
  console.log(`  Missing conversation_id: ${stats.missingConversationId}\n`);

  backfillEmails({
    limit,
    bodyOnly,
    conversationOnly,
    onProgress: (p) => {
      if (p.processed % 50 === 0 || p.processed === p.total) {
        console.log(
          `Progress: ${p.processed}/${p.total} (${p.updated} updated, ${p.errors} errors)`
        );
      }
    },
  })
    .then((result) => {
      printBackfillResults(result);
    })
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
}
