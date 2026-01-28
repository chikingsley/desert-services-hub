#!/usr/bin/env bun
/**
 * DocuSign Link Watcher
 *
 * Monitors contracts@desertservices.net for "requested new link" replies,
 * then polls all mailboxes for the corresponding new DocuSign signing link.
 *
 * Usage:
 *   # Check once for pending requests and find links
 *   bun services/email/inbox/docusign-link-watcher.ts
 *
 *   # Poll mode: keep checking every N seconds until found
 *   bun services/email/inbox/docusign-link-watcher.ts --poll --interval 30
 *
 *   # Only look at requests from the last N hours
 *   bun services/email/inbox/docusign-link-watcher.ts --hours 4
 */
import { parseArgs } from "node:util";
import { GraphEmailClient } from "../client";
import type { EmailMessage } from "../types";

// ============================================================================
// Config
// ============================================================================

const CONTRACTS_MAILBOX = "contracts@desertservices.net";
const DOCUSIGN_SENDER = "docusign.net";
const TRIGGER_PHRASE = "requested new link";
const DEFAULT_HOURS_BACK = 24;
const DEFAULT_POLL_INTERVAL_SEC = 30;
const MAX_POLL_ATTEMPTS = 60; // 30 min at 30s intervals

/** Mailboxes to search for incoming DocuSign links */
const SEARCH_MAILBOXES = [
  "jeff@desertservices.net",
  "jared@desertservices.net",
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "denise@desertservices.net",
  "lacie@desertservices.net",
] as const;

const DOCUSIGN_LINK_PATTERN =
  /https:\/\/na\d+\.docusign\.net\/Signing\/EmailStart\.aspx\?[^\s"<]+/gi;

const SECURITY_CODE_PATTERN =
  /security code:\s*(?:<br\s*\/?>)?\s*([A-F0-9]{30,})/i;

const RE_DOCUSIGN_SENDER =
  /(?:from|sent by)[:\s]+([^<\n]+?)(?:\s*(?:via|<|sent))/i;
const RE_DOCUSIGN_RECIPIENT =
  /(?:<b>Sent:<\/b>|Sent:).*?(?:<b>To:<\/b>|To:)\s*([^<\n]+)/is;
const RE_DOCUSIGN_SUBJECT =
  /(?:<b>Subject:<\/b>|Subject:)\s*(?:<\/?\w[^>]*>)*\s*([^\n<]+)/i;
const RE_WHITESPACE_SPLIT = /\s+/;
const RE_AMPERSAND = /&amp;/g;
const RE_TRAILING_QUOTE = /"$/;
const RE_TRAILING_SINGLE_QUOTE = /'$/;
const RE_REPLY_PREFIX = /^(?:Re|Fw|FW|Fwd):\s*/gi;

// ============================================================================
// Types
// ============================================================================

interface LinkRequest {
  /** The "requested new link" email */
  triggerEmail: EmailMessage;
  /** Subject line of the DocuSign document (extracted from thread) */
  docusignSubject: string;
  /** Who sent the original DocuSign (e.g., "Jessica Durham") */
  docusignSender: string | null;
  /** Original recipient of the DocuSign signing request */
  originalRecipient: string | null;
}

interface FoundLink {
  request: LinkRequest;
  /** The new DocuSign email containing the fresh link */
  email: EmailMessage;
  /** The mailbox where the new link was found */
  foundInMailbox: string;
  /** The extracted signing URL */
  signingUrl: string;
  /** The security code (if present) */
  securityCode: string | null;
}

// ============================================================================
// Client
// ============================================================================

function createClient(): GraphEmailClient {
  const client = new GraphEmailClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });
  client.initAppAuth();
  return client;
}

// ============================================================================
// Step 1: Find "requested new link" trigger emails in contracts@
// ============================================================================

async function findTriggerEmails(
  client: GraphEmailClient,
  sinceDate: Date
): Promise<EmailMessage[]> {
  const emails = await client.searchEmails({
    query: TRIGGER_PHRASE,
    userId: CONTRACTS_MAILBOX,
    limit: 20,
    since: sinceDate,
  });

  // Filter to only emails that actually contain the trigger phrase in body
  return emails.filter((e) => {
    const bodyLower = (e.bodyContent ?? "").toLowerCase();
    return bodyLower.includes(TRIGGER_PHRASE);
  });
}

// ============================================================================
// Step 2: Extract DocuSign context from the email thread
// ============================================================================

function extractDocuSignContext(triggerEmail: EmailMessage): LinkRequest {
  const body = triggerEmail.bodyContent ?? "";

  // Extract the original DocuSign subject from the forwarded/replied content
  // Look for "Subject:" in the quoted reply chain
  const subjectFromThread = extractOriginalSubject(
    body,
    triggerEmail.subject ?? ""
  );

  // Extract DocuSign sender name (the person who sent the signing request)
  const senderMatch = body.match(RE_DOCUSIGN_SENDER);
  const docusignSender = senderMatch?.[1]?.trim() ?? null;

  // Extract original recipient (who the DocuSign was sent to)
  const toMatch = body.match(RE_DOCUSIGN_RECIPIENT);
  const originalRecipient = toMatch?.[1]?.trim() ?? null;

  return {
    triggerEmail,
    docusignSubject: subjectFromThread,
    docusignSender,
    originalRecipient,
  };
}

function extractOriginalSubject(body: string, emailSubject: string): string {
  // Remove Re:, Fw:, FW: prefixes to get the core subject
  let subject = emailSubject.replace(RE_REPLY_PREFIX, "").trim();

  // If the subject already looks like a DocuSign document name, use it
  if (subject.length > 5) {
    return subject;
  }

  // Try to extract from the body's quoted reply chain
  const subjectMatch = body.match(RE_DOCUSIGN_SUBJECT);
  if (subjectMatch?.[1]) {
    subject = subjectMatch[1].replace(RE_REPLY_PREFIX, "").trim();
  }

  return subject;
}

// ============================================================================
// Step 3: Search for the new DocuSign link
// ============================================================================

/**
 * Build a shorter search query from the full subject.
 * MS Graph search chokes on very long queries. Take the most
 * distinctive words (skip common prefixes/noise).
 */
function buildSearchQuery(fullSubject: string): string {
  // Remove common noise: "Re:", "FW:" prefixes
  const cleaned = fullSubject.replace(RE_REPLY_PREFIX, "").trim();

  // Strip dashes and special chars that break KQL search, collapse spaces
  const sanitized = cleaned
    .replace(/[-–—]/g, " ")
    .replace(RE_WHITESPACE_SPLIT, " ")
    .trim();

  // Take the first 6 words (KQL works best with shorter queries)
  const words = sanitized.split(RE_WHITESPACE_SPLIT);
  return words.slice(0, 6).join(" ");
}

async function searchForNewLink(
  client: GraphEmailClient,
  request: LinkRequest,
  sinceDate: Date
): Promise<FoundLink | null> {
  const searchQuery = buildSearchQuery(request.docusignSubject);

  console.log(`  Searching for: "${searchQuery}"`);
  console.log(`  Checking mailboxes: ${SEARCH_MAILBOXES.join(", ")}`);

  const results = await client.searchMailboxes({
    userIds: [...SEARCH_MAILBOXES],
    query: searchQuery,
    limit: 10,
    since: sinceDate,
  });

  for (const { mailbox, emails } of results) {
    for (const email of emails) {
      // Must be from DocuSign
      const fromEmail = (email.fromEmail ?? "").toLowerCase();
      if (!fromEmail.includes(DOCUSIGN_SENDER)) {
        continue;
      }

      // Must not be a reminder or expiration notice
      const subject = email.subject ?? "";
      if (subject.startsWith("Reminder:") || subject.startsWith("Expiration")) {
        continue;
      }

      // Must be newer than the trigger email
      const triggerTime = new Date(
        request.triggerEmail.receivedDateTime
      ).getTime();
      const emailTime = new Date(email.receivedDateTime).getTime();

      // Allow emails within 30 minutes before the trigger
      // (DocuSign new links can arrive before the "requested new link" reply is sent)
      const windowMs = 30 * 60 * 1000;
      if (emailTime < triggerTime - windowMs) {
        continue;
      }

      // Get full body to extract the link
      const fullEmail = await client.getEmail(email.id, mailbox);
      if (!fullEmail) {
        continue;
      }

      const signingUrl = extractSigningUrl(fullEmail.bodyContent ?? "");
      if (!signingUrl) {
        continue;
      }

      const securityCode = extractSecurityCode(fullEmail.bodyContent ?? "");

      return {
        request,
        email: fullEmail,
        foundInMailbox: mailbox,
        signingUrl,
        securityCode,
      };
    }
  }

  return null;
}

function extractSigningUrl(body: string): string | null {
  const matches = body.match(DOCUSIGN_LINK_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }
  // Clean up HTML encoding artifacts
  return matches[0]
    .replace(RE_AMPERSAND, "&")
    .replace(RE_TRAILING_QUOTE, "")
    .replace(RE_TRAILING_SINGLE_QUOTE, "");
}

function extractSecurityCode(body: string): string | null {
  const match = body.match(SECURITY_CODE_PATTERN);
  return match?.[1] ?? null;
}

// ============================================================================
// Step 4: Report results
// ============================================================================

function reportFoundLink(found: FoundLink): void {
  console.log("\n========================================");
  console.log("  NEW DOCUSIGN LINK FOUND");
  console.log("========================================\n");
  console.log(`  Document: ${found.request.docusignSubject}`);
  console.log(`  Found in: ${found.foundInMailbox}`);
  console.log(
    `  Received: ${new Date(found.email.receivedDateTime).toLocaleString()}`
  );
  console.log(`\n  Signing URL:\n  ${found.signingUrl}`);
  if (found.securityCode) {
    console.log(`\n  Security Code: ${found.securityCode}`);
  }
  console.log("\n========================================\n");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      poll: { type: "boolean", default: false },
      interval: { type: "string", default: String(DEFAULT_POLL_INTERVAL_SEC) },
      hours: { type: "string", default: String(DEFAULT_HOURS_BACK) },
    },
  });

  const hoursBack = Number.parseInt(values.hours as string, 10);
  const pollInterval = Number.parseInt(values.interval as string, 10) * 1000;
  const doPoll = values.poll ?? false;
  const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  console.log("DocuSign Link Watcher");
  console.log(
    `Looking back ${hoursBack} hours (since ${sinceDate.toLocaleString()})`
  );
  console.log(
    `Mode: ${doPoll ? `polling every ${values.interval}s` : "single check"}\n`
  );

  const client = createClient();

  // Step 1: Find trigger emails
  console.log(
    `Scanning ${CONTRACTS_MAILBOX} for "${TRIGGER_PHRASE}" replies...`
  );
  const triggers = await findTriggerEmails(client, sinceDate);

  if (triggers.length === 0) {
    console.log("No 'requested new link' emails found.");
    return;
  }

  console.log(`Found ${triggers.length} link request(s):\n`);

  // Step 2: Extract context and search for links
  const requests: LinkRequest[] = [];
  for (const trigger of triggers) {
    const request = extractDocuSignContext(trigger);
    requests.push(request);
    console.log(`- ${request.docusignSubject}`);
    console.log(
      `  Requested at: ${new Date(trigger.receivedDateTime).toLocaleString()}`
    );
    if (request.docusignSender) {
      console.log(`  DocuSign from: ${request.docusignSender}`);
    }
  }

  console.log();

  // Step 3: Search for new links
  const found: FoundLink[] = [];
  const pending: LinkRequest[] = [];

  for (const request of requests) {
    console.log(`Searching for new link: "${request.docusignSubject}"...`);
    const result = await searchForNewLink(client, request, sinceDate);
    if (result) {
      found.push(result);
      reportFoundLink(result);
    } else {
      pending.push(request);
      console.log("  Not found yet.\n");
    }
  }

  // Step 4: Poll for pending requests if --poll flag is set
  if (doPoll && pending.length > 0) {
    console.log(
      `\nPolling for ${pending.length} pending request(s) every ${values.interval}s...`
    );
    let attempts = 0;

    while (pending.length > 0 && attempts < MAX_POLL_ATTEMPTS) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      console.log(
        `\n[Poll ${attempts}] Checking ${pending.length} pending request(s)...`
      );

      const stillPending: LinkRequest[] = [];
      for (const request of pending) {
        const result = await searchForNewLink(client, request, sinceDate);
        if (result) {
          found.push(result);
          reportFoundLink(result);
        } else {
          stillPending.push(request);
        }
      }
      pending.length = 0;
      pending.push(...stillPending);
    }

    if (pending.length > 0) {
      console.log(
        `\nTimed out waiting for ${pending.length} link(s). Run again later.`
      );
    }
  }

  // Summary
  console.log("\n--- Summary ---");
  console.log(`Found: ${found.length} link(s)`);
  console.log(`Pending: ${pending.length} request(s)`);

  if (found.length > 0) {
    console.log("\nLinks found:");
    for (const f of found) {
      console.log(`  ${f.request.docusignSubject}`);
      console.log(`    ${f.signingUrl}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
