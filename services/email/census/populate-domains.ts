/**
 * Populate Domain Fields
 *
 * Extracts domain info from emails and populates:
 * - from_domain: sender's email domain
 * - is_internal: flag for internal domains
 * - is_forwarded: flag for forwarded emails
 * - original_sender_email: extracted from forward body
 * - original_sender_domain: domain of original sender
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = join(import.meta.dir, "census.db");
const db = new Database(dbPath);

// Internal domains
const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);

// Forward indicators in subject
const FORWARD_PREFIXES = ["fw:", "fwd:", "forwarded:"];

// Regex patterns to extract original sender from forwarded emails
// Pattern 1: Gmail/standard format "---------- Forwarded message ----------\nFrom: Name <email>"
const GMAIL_FORWARD_REGEX =
  /[-]+\s*(?:forwarded|original)\s+message\s*[-]+[\s\S]*?from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i;

// Pattern 2: Outlook format "From: Name <email@domain.com> Sent: Date"
// The key is "Sent:" comes after the From line
const OUTLOOK_FORWARD_REGEX =
  /from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s*sent:/i;

// Pattern 3: Just find any "From: ... <email>" pattern in the body (fallback)
const GENERIC_FROM_REGEX =
  /from:\s*[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i;

/**
 * Extract domain from email address.
 * Simple, no regex bullshit - just split on @
 */
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

/**
 * Check if subject indicates a forwarded email
 */
function isForwardedSubject(subject: string | null): boolean {
  if (!subject) {
    return false;
  }
  const lower = subject.toLowerCase().trim();
  return FORWARD_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Extract original sender email from forwarded message body
 */
function extractOriginalSender(body: string | null): string | null {
  if (!body) {
    return null;
  }

  // Try Outlook format first (most common): "From: Name <email> Sent:"
  let match = body.match(OUTLOOK_FORWARD_REGEX);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  // Try Gmail/standard format: "---------- Forwarded message ----------"
  match = body.match(GMAIL_FORWARD_REGEX);
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

interface EmailRow {
  id: number;
  from_email: string | null;
  subject: string | null;
  body_full: string | null;
  body_preview: string | null;
}

function populateDomains(): void {
  console.log("Populating domain fields...\n");

  // Get all emails
  const emails = db
    .query<EmailRow, []>(
      "SELECT id, from_email, subject, body_full, body_preview FROM emails"
    )
    .all();

  console.log(`Processing ${emails.length} emails...\n`);

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE emails SET
      from_domain = ?,
      is_internal = ?,
      is_forwarded = ?,
      original_sender_email = ?,
      original_sender_domain = ?
    WHERE id = ?
  `);

  let processed = 0;
  let withDomain = 0;
  let internal = 0;
  let forwarded = 0;
  let withOriginalSender = 0;

  // Process in a transaction for speed
  db.run("BEGIN TRANSACTION");

  for (const email of emails) {
    // Extract domain from sender
    const fromDomain = extractDomain(email.from_email);
    if (fromDomain) {
      withDomain++;
    }

    // Check if internal
    const isInternal = fromDomain ? INTERNAL_DOMAINS.has(fromDomain) : false;
    if (isInternal) {
      internal++;
    }

    // Check if forwarded
    const isForwarded = isForwardedSubject(email.subject);
    if (isForwarded) {
      forwarded++;
    }

    // Extract original sender from forwards (check body_full first, then preview)
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

    // Update the row
    updateStmt.run(
      fromDomain,
      isInternal ? 1 : 0,
      isForwarded ? 1 : 0,
      originalSenderEmail,
      originalSenderDomain,
      email.id
    );

    processed++;
    if (processed % 5000 === 0) {
      console.log(`  Processed ${processed}/${emails.length}...`);
    }
  }

  db.run("COMMIT");

  console.log("\n=== Results ===");
  console.log(`Total processed: ${processed}`);
  console.log(`With domain: ${withDomain}`);
  console.log(`Internal: ${internal}`);
  console.log(`Forwarded: ${forwarded}`);
  console.log(`Forwards with original sender extracted: ${withOriginalSender}`);

  // Show top domains
  console.log("\n=== Top External Domains ===");
  const topDomains = db
    .query<{ domain: string; count: number }, []>(
      `SELECT from_domain as domain, COUNT(*) as count
       FROM emails
       WHERE is_internal = 0 AND from_domain IS NOT NULL
       GROUP BY from_domain
       ORDER BY count DESC
       LIMIT 20`
    )
    .all();

  for (const d of topDomains) {
    console.log(`  ${d.domain.padEnd(35)} ${d.count}`);
  }

  // Show internal breakdown
  console.log("\n=== Internal Domains ===");
  const internalDomains = db
    .query<{ domain: string; count: number }, []>(
      `SELECT from_domain as domain, COUNT(*) as count
       FROM emails
       WHERE is_internal = 1
       GROUP BY from_domain
       ORDER BY count DESC`
    )
    .all();

  for (const d of internalDomains) {
    console.log(`  ${d.domain.padEnd(35)} ${d.count}`);
  }

  // Show forward stats
  console.log("\n=== Forwarded Email Stats ===");
  const fwdStats = db
    .query<{ has_original: number; count: number }, []>(
      `SELECT
         CASE WHEN original_sender_email IS NOT NULL THEN 1 ELSE 0 END as has_original,
         COUNT(*) as count
       FROM emails
       WHERE is_forwarded = 1
       GROUP BY has_original`
    )
    .all();

  for (const s of fwdStats) {
    const label = s.has_original
      ? "With original sender"
      : "No original sender found";
    console.log(`  ${label}: ${s.count}`);
  }

  // Sample some extracted original senders
  console.log("\n=== Sample Extracted Original Senders ===");
  const samples = db
    .query<{ subject: string; sender: string; original: string }, []>(
      `SELECT subject, from_email as sender, original_sender_email as original
       FROM emails
       WHERE original_sender_email IS NOT NULL
       LIMIT 10`
    )
    .all();

  for (const s of samples) {
    console.log(`  ${s.sender} forwarded from ${s.original}`);
    console.log(`    Subject: ${s.subject?.substring(0, 60)}`);
  }
}

// Run
try {
  populateDomains();
} catch (error) {
  console.error(error);
}
