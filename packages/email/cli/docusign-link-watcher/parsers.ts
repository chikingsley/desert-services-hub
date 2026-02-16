import type { EmailMessage } from "@email/types";
import {
  DOCUSIGN_LINK_PATTERN,
  RE_AMPERSAND,
  RE_DOCUSIGN_RECIPIENT,
  RE_DOCUSIGN_SENDER,
  RE_DOCUSIGN_SUBJECT,
  RE_REPLY_PREFIX,
  RE_TRAILING_QUOTE,
  RE_TRAILING_SINGLE_QUOTE,
  RE_WHITESPACE_SPLIT,
  SECURITY_CODE_PATTERN,
} from "./constants";
import type { LinkRequest } from "./types";

export function extractDocuSignContext(
  triggerEmail: EmailMessage
): LinkRequest {
  const body = triggerEmail.bodyContent ?? "";
  const subjectFromThread = extractOriginalSubject(
    body,
    triggerEmail.subject ?? ""
  );
  const senderMatch = body.match(RE_DOCUSIGN_SENDER);
  const docusignSender = senderMatch?.[1]?.trim() ?? null;
  const toMatch = body.match(RE_DOCUSIGN_RECIPIENT);
  const originalRecipient = toMatch?.[1]?.trim() ?? null;

  return {
    docusignSender,
    docusignSubject: subjectFromThread,
    originalRecipient,
    triggerEmail,
  };
}

function extractOriginalSubject(body: string, emailSubject: string): string {
  let subject = emailSubject.replace(RE_REPLY_PREFIX, "").trim();
  if (subject.length > 5) {
    return subject;
  }

  const subjectMatch = body.match(RE_DOCUSIGN_SUBJECT);
  if (subjectMatch?.[1]) {
    subject = subjectMatch[1].replace(RE_REPLY_PREFIX, "").trim();
  }

  return subject;
}

export function buildSearchQuery(fullSubject: string): string {
  const cleaned = fullSubject.replace(RE_REPLY_PREFIX, "").trim();
  const sanitized = cleaned
    .replaceAll(/[-–—]/g, " ")
    .replace(RE_WHITESPACE_SPLIT, " ")
    .trim();
  const words = sanitized.split(RE_WHITESPACE_SPLIT);
  return words.slice(0, 6).join(" ");
}

export function extractSigningUrl(body: string): string | null {
  const matches = body.match(DOCUSIGN_LINK_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[0]
    .replace(RE_AMPERSAND, "&")
    .replace(RE_TRAILING_QUOTE, "")
    .replace(RE_TRAILING_SINGLE_QUOTE, "");
}

export function extractSecurityCode(body: string): string | null {
  const match = body.match(SECURITY_CODE_PATTERN);
  return match?.[1] ?? null;
}
