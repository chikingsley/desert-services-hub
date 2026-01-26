/**
 * Backfill Original Senders
 *
 * Fetches forwarded emails that are missing original_sender_email
 * and extracts the sender from the actual email content via Graph API.
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { GraphEmailClient } from "../client";
import { htmlToText } from "./html-to-text";

const dbPath = join(import.meta.dir, "census.db");
const db = new Database(dbPath);

// Force usage to prevent linter removal
const _htmlToTextRef = htmlToText;

// Regex patterns to extract original sender from PLAIN TEXT
// Pattern 1: Outlook format "From: Name <email> Sent:"
const OUTLOOK_FORWARD_REGEX =
  /from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s*sent:/i;

// Pattern 2: Gmail/standard format "---------- Forwarded message ----------"
const GMAIL_FORWARD_REGEX =
  /[-]+\s*(?:forwarded|original)\s+message\s*[-]+[\s\S]*?from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i;

// Pattern 3: Outlook calendar format "From: email When:" or "From: email<br"
const CALENDAR_FROM_REGEX =
  /from:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*(?:when:|$)/im;

// Pattern 4: Generic "From: Name <email>" in angle brackets
const GENERIC_FROM_REGEX =
  /from:\s*[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i;

function extractOriginalSender(body: string | null): string | null {
  if (!body) {
    return null;
  }

  // Try Outlook format first: "From: Name <email> Sent:"
  let match = body.match(OUTLOOK_FORWARD_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  // Try Gmail format: "---------- Forwarded message ----------"
  match = body.match(GMAIL_FORWARD_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  // Try calendar format: "From: email When:"
  match = body.match(CALENDAR_FROM_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  // Fallback: any "From: Name <email>" pattern
  match = body.match(GENERIC_FROM_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return null;
}

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

interface MissingForward {
  id: number;
  message_id: string;
  mailbox_email: string;
  subject: string;
}

async function backfillOriginalSenders(): Promise<void> {
  console.log("Backfilling original senders for forwarded emails...\n");

  // Get emails missing original sender
  const missing = db
    .query<MissingForward, []>(
      `SELECT e.id, e.message_id, m.email as mailbox_email, e.subject
       FROM emails e
       JOIN mailboxes m ON e.mailbox_id = m.id
       WHERE e.is_forwarded = 1 AND e.original_sender_email IS NULL`
    )
    .all();

  console.log(`Found ${missing.length} forwards missing original sender\n`);

  if (missing.length === 0) {
    console.log("Nothing to backfill!");
    return;
  }

  // Create Graph client
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

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE emails SET
      original_sender_email = ?,
      original_sender_domain = ?,
      body_full = ?
    WHERE id = ?
  `);

  let processed = 0;
  let extracted = 0;
  let errors = 0;

  for (const email of missing) {
    try {
      // Fetch email from Graph API
      const fullEmail = await client.getEmail(
        email.message_id,
        email.mailbox_email
      );

      if (!fullEmail) {
        console.log(
          `  [SKIP] Could not fetch: ${email.subject.substring(0, 50)}`
        );
        errors++;
        continue;
      }

      // Get body content - convert HTML to plain text first
      const rawBody = fullEmail.bodyContent || "";
      const plainBody = await htmlToText(rawBody);

      // Extract original sender from plain text
      const originalSender = extractOriginalSender(plainBody);
      const originalDomain = extractDomain(originalSender);

      // Update database with plain text body
      updateStmt.run(originalSender, originalDomain, plainBody, email.id);

      if (originalSender) {
        extracted++;
        console.log(
          `  [OK] ${originalSender} from: ${email.subject.substring(0, 40)}`
        );
      } else {
        console.log(`  [NO SENDER] ${email.subject.substring(0, 50)}`);
      }

      processed++;

      // Rate limit - don't hammer the API
      if (processed % 10 === 0) {
        console.log(
          `\nProgress: ${processed}/${missing.length} (${extracted} extracted)\n`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  [ERROR] ${email.subject.substring(0, 40)}: ${msg}`);
      errors++;
    }
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`Processed: ${processed}`);
  console.log(`Extracted: ${extracted}`);
  console.log(`Still missing: ${processed - extracted}`);
  console.log(`Errors: ${errors}`);

  // Show remaining missing count
  const stillMissing = db
    .query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM emails
       WHERE is_forwarded = 1 AND original_sender_email IS NULL`
    )
    .get();

  console.log(
    `\nForwards still missing original sender: ${stillMissing?.count ?? 0}`
  );
}

// Run
backfillOriginalSenders().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
