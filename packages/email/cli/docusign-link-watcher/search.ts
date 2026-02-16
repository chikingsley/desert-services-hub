import type { GraphEmailClient } from "@email/client";
import type { EmailMessage } from "@email/types";
import {
  CONTRACTS_MAILBOX,
  DOCUSIGN_LINK_WINDOW_MS,
  SEARCH_MAILBOXES,
  TRIGGER_PHRASE,
} from "./constants";
import {
  buildSearchQuery,
  extractSecurityCode,
  extractSigningUrl,
} from "./parsers";
import type { FoundLink, LinkRequest } from "./types";

export async function findTriggerEmails(
  client: GraphEmailClient,
  sinceDate: Date
): Promise<EmailMessage[]> {
  const emails = await client.searchEmails({
    limit: 20,
    query: TRIGGER_PHRASE,
    since: sinceDate,
    userId: CONTRACTS_MAILBOX,
  });

  return emails.filter((email) => {
    const body = (email.bodyContent ?? "").toLowerCase();
    return body.includes(TRIGGER_PHRASE);
  });
}

function isDocuSignCandidate({
  email,
  request,
}: {
  email: EmailMessage;
  request: LinkRequest;
}): boolean {
  const fromEmail = (email.fromEmail ?? "").toLowerCase();
  if (!fromEmail.includes("docusign.net")) {
    return false;
  }

  const subject = email.subject ?? "";
  if (subject.startsWith("Reminder:") || subject.startsWith("Expiration")) {
    return false;
  }

  const triggerTime = new Date(request.triggerEmail.receivedDateTime).getTime();
  const emailTime = new Date(email.receivedDateTime).getTime();
  return emailTime >= triggerTime - DOCUSIGN_LINK_WINDOW_MS;
}

export async function searchForNewLink(
  client: GraphEmailClient,
  request: LinkRequest,
  sinceDate: Date
): Promise<FoundLink | null> {
  const searchQuery = buildSearchQuery(request.docusignSubject);
  console.log(`  Searching for: "${searchQuery}"`);
  console.log(`  Checking mailboxes: ${SEARCH_MAILBOXES.join(", ")}`);

  const searchResults = await client.searchMailboxes({
    limit: 10,
    query: searchQuery,
    since: sinceDate,
    userIds: [...SEARCH_MAILBOXES],
  });

  for (const { mailbox, emails } of searchResults) {
    for (const email of emails) {
      if (!isDocuSignCandidate({ email, request })) {
        continue;
      }

      const fullEmail = await client.getEmail(email.id, mailbox);
      if (!fullEmail) {
        continue;
      }

      const signingUrl = extractSigningUrl(fullEmail.bodyContent ?? "");
      if (!signingUrl) {
        continue;
      }

      return {
        email: fullEmail,
        foundInMailbox: mailbox,
        request,
        securityCode: extractSecurityCode(fullEmail.bodyContent ?? ""),
        signingUrl,
      };
    }
  }

  return null;
}
