/**
 * DocuSign link finder.
 *
 * Given a document subject (from a "requested new link" trigger),
 * searches all known mailboxes for the corresponding new DocuSign email
 * and extracts the signing URL.
 */
import { getEmail, searchMailboxes } from "./graph";

const DOCUSIGN_SENDER = "docusign.net";

const DOCUSIGN_LINK_PATTERN =
  /https:\/\/na\d+\.docusign\.net\/Signing\/EmailStart\.aspx\?[^\s"<]+/gi;

const SECURITY_CODE_PATTERN =
  /security code:\s*(?:<br\s*\/?>)?\s*([A-F0-9]{30,})/i;

const WHITESPACE_SPLIT = /\s+/;
const AMP_ENTITY = /&amp;/g;
const TRAILING_DQUOTE = /"$/;
const TRAILING_SQUOTE = /'$/;
const REPLY_PREFIX = /^(?:Re|Fw|FW|Fwd):\s*/gi;
const DASHES = /[-–—]/g;
const MULTI_SPACE = /\s+/g;

/** Mailboxes to search for incoming DocuSign links */
const SEARCH_MAILBOXES = [
  "jeff@desertservices.net",
  "jared@desertservices.net",
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "denise@desertservices.net",
  "lacie@desertservices.net",
];

export type DocuSignResult =
  | {
      found: true;
      documentSubject: string;
      foundInMailbox: string;
      signingUrl: string;
      securityCode: string | null;
      receivedAt: string;
    }
  | {
      found: false;
      documentSubject: string;
    };

/**
 * Build a shorter search query from the full subject.
 * MS Graph KQL chokes on very long queries and dashes.
 */
function buildSearchQuery(fullSubject: string): string {
  const cleaned = fullSubject.replace(REPLY_PREFIX, "").trim();
  const sanitized = cleaned
    .replace(DASHES, " ")
    .replace(MULTI_SPACE, " ")
    .trim();
  const words = sanitized.split(WHITESPACE_SPLIT);
  return words.slice(0, 6).join(" ");
}

function extractSigningUrl(body: string): string | null {
  const matches = body.match(DOCUSIGN_LINK_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[0]
    .replace(AMP_ENTITY, "&")
    .replace(TRAILING_DQUOTE, "")
    .replace(TRAILING_SQUOTE, "");
}

function extractSecurityCode(body: string): string | null {
  const match = body.match(SECURITY_CODE_PATTERN);
  return match?.[1] ?? null;
}

/**
 * Search all mailboxes for a new DocuSign signing link matching the given subject.
 */
export async function findDocuSignLink(
  token: string,
  documentSubject: string,
  triggerTime: Date
): Promise<DocuSignResult> {
  const query = buildSearchQuery(documentSubject);
  console.log(`[DocuSign] Searching for: "${query}"`);

  const results = await searchMailboxes(token, SEARCH_MAILBOXES, query, 10);

  // Allow emails up to 30 min before the trigger
  const windowMs = 30 * 60 * 1000;
  const cutoffTime = triggerTime.getTime() - windowMs;

  for (const { mailbox, emails } of results) {
    for (const email of emails) {
      // Must be from DocuSign
      if (!email.from.toLowerCase().includes(DOCUSIGN_SENDER)) {
        continue;
      }

      // Skip reminders and expiration notices
      if (
        email.subject.startsWith("Reminder:") ||
        email.subject.startsWith("Expiration")
      ) {
        continue;
      }

      // Must be recent enough
      const emailTime = new Date(email.receivedDateTime).getTime();
      if (emailTime < cutoffTime) {
        continue;
      }

      // Get full body to extract the link
      const fullEmail = await getEmail(token, mailbox, email.id);
      if (!fullEmail) {
        continue;
      }

      const signingUrl = extractSigningUrl(fullEmail.bodyContent);
      if (!signingUrl) {
        continue;
      }

      const securityCode = extractSecurityCode(fullEmail.bodyContent);

      console.log(`[DocuSign] Found link in ${mailbox}`);
      return {
        found: true,
        documentSubject,
        foundInMailbox: mailbox,
        signingUrl,
        securityCode,
        receivedAt: email.receivedDateTime,
      };
    }
  }

  console.log("[DocuSign] Link not found yet");
  return { found: false, documentSubject };
}
