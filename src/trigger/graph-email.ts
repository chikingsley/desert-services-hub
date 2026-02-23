/**
 * Shared Graph API email types + conversion helpers.
 *
 * Used by email-sync (per-message webhook handler) and mailbox-sync (bulk pull).
 * Centralises the Microsoft Graph → Postgres mapping so there's exactly one copy.
 */

import type { InsertEmailData } from "@lib/db/types";

// ── Email field selection ───────────────────────────────────────

export const EMAIL_FIELDS = [
  "id",
  "conversationId",
  "subject",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "bodyPreview",
  "body",
  "hasAttachments",
  "internetMessageHeaders",
  "webLink",
].join(",");

// ── Graph API types ─────────────────────────────────────────────

export interface GraphEmailAddress {
  address: string;
  name: string;
}

export interface GraphRecipient {
  emailAddress: GraphEmailAddress;
}

export interface GraphEmailBody {
  content: string;
  contentType: "html" | "text";
}

export interface GraphInternetHeader {
  name: string;
  value: string;
}

export interface GraphEmail {
  body?: GraphEmailBody;
  bodyPreview?: string;
  ccRecipients?: GraphRecipient[];
  conversationId?: string;
  from?: { emailAddress: GraphEmailAddress };
  hasAttachments?: boolean;
  id: string;
  internetMessageHeaders?: GraphInternetHeader[];
  receivedDateTime: string;
  subject: string;
  toRecipients?: GraphRecipient[];
  webLink?: string;
}

export interface GraphListResponse {
  "@odata.nextLink"?: string;
  value: GraphEmail[];
}

export interface GraphAttachment {
  contentType: string;
  id: string;
  isInline: boolean;
  name: string;
  size: number;
}

// ── Conversion helpers ──────────────────────────────────────────

const HTML_TAG_RE = /<[^>]*>/g;

function htmlToText(html: string): string {
  return html.replace(HTML_TAG_RE, "").trim();
}

function extractRecipients(recipients: GraphRecipient[] | undefined): string[] {
  if (!recipients) {
    return [];
  }
  return recipients.map((r) => r.emailAddress.address);
}

function extractInternetMessageId(
  headers: GraphInternetHeader[] | undefined
): string | null {
  if (!headers) {
    return null;
  }
  const header = headers.find((h) => h.name.toLowerCase() === "message-id");
  return header?.value ?? null;
}

/** Convert a Graph API email response to the shape expected by insertEmail(). */
export function graphEmailToInsertData(
  email: GraphEmail,
  mailboxId: number
): InsertEmailData {
  const bodyHtml =
    email.body?.contentType === "html" ? email.body.content : null;
  let bodyText: string | null = null;
  if (email.body?.contentType === "text") {
    bodyText = email.body.content;
  } else if (bodyHtml) {
    bodyText = htmlToText(bodyHtml);
  }

  return {
    messageId: email.id,
    internetMessageId: extractInternetMessageId(email.internetMessageHeaders),
    mailboxId,
    conversationId: email.conversationId ?? null,
    subject: email.subject,
    fromEmail: email.from?.emailAddress.address ?? null,
    fromName: email.from?.emailAddress.name ?? null,
    toEmails: extractRecipients(email.toRecipients),
    ccEmails: extractRecipients(email.ccRecipients),
    receivedAt: email.receivedDateTime,
    hasAttachments: email.hasAttachments ?? false,
    bodyPreview: email.bodyPreview ?? null,
    bodyFull: bodyText,
    bodyHtml,
    webUrl: email.webLink ?? null,
  };
}
