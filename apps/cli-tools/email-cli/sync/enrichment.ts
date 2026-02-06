/**
 * Post-sync email enrichment — domain extraction, internal flag, forward detection.
 */
import { db } from "@lib/db/hub";

const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);

const FORWARD_PREFIXES = ["fw:", "fwd:", "forwarded:"];

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
 * Runs on all emails with missing from_domain.
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
