/**
 * Email Message Parsing Utilities
 *
 * Standalone functions for parsing Microsoft Graph API message responses
 * into typed EmailMessage objects. Extracted from GraphEmailClient for reuse
 * across operation modules.
 */

import type { EmailMessage, Recipient } from "@email/types";

/**
 * Parse raw Graph API recipient array into typed Recipient objects.
 */
export function parseRecipients(
  recipients:
    | Array<{ emailAddress?: { address?: string; name?: string } }>
    | undefined
): Recipient[] {
  const result: Recipient[] = [];

  if (recipients) {
    for (const recipient of recipients) {
      if (recipient.emailAddress) {
        result.push({
          email: recipient.emailAddress.address ?? "",
          name: recipient.emailAddress.name ?? null,
        });
      }
    }
  }
  return result;
}

/**
 * Parse a single raw Graph API message into an EmailMessage.
 * Returns null if parsing fails.
 */
export function parseMessage(
  msg: Record<string, unknown>
): EmailMessage | null {
  try {
    const from = msg.from as
      | { emailAddress?: { address?: string; name?: string } }
      | undefined;
    const body = msg.body as
      | { content?: string; contentType?: string }
      | undefined;

    return {
      bodyContent: body?.content ?? "",
      bodyType: body?.contentType === "html" ? "html" : "text",
      categories: (msg.categories as string[]) ?? [],
      ccRecipients: parseRecipients(
        msg.ccRecipients as
          | Array<{ emailAddress?: { address?: string; name?: string } }>
          | undefined
      ),
      conversationId: (msg.conversationId as string) ?? undefined,
      fromEmail: from?.emailAddress?.address ?? "",
      fromName: from?.emailAddress?.name ?? null,
      id: (msg.id as string) ?? "",
      internetMessageId: (msg.internetMessageId as string) ?? undefined,
      parentFolderId: (msg.parentFolderId as string) ?? undefined,
      receivedDateTime: msg.receivedDateTime
        ? new Date(msg.receivedDateTime as string)
        : new Date(),
      subject: (msg.subject as string) ?? "",
      toRecipients: parseRecipients(
        msg.toRecipients as
          | Array<{ emailAddress?: { address?: string; name?: string } }>
          | undefined
      ),
    };
  } catch (error) {
    console.warn("Error parsing message:", error);
    return null;
  }
}

/**
 * Parse an array of raw Graph API messages into EmailMessage objects.
 * Skips messages that fail to parse.
 */
export function parseMessages(
  messages: Record<string, unknown>[]
): EmailMessage[] {
  const emails: EmailMessage[] = [];
  for (const msg of messages) {
    const email = parseMessage(msg);
    if (email) {
      emails.push(email);
    }
  }
  return emails;
}

/**
 * Parse messages and include hasAttachments flag from raw response.
 * Skips messages that fail to parse.
 */
export function parseMessagesWithAttachments(
  messages: Record<string, unknown>[]
): EmailMessage[] {
  const emails: EmailMessage[] = [];
  for (const msg of messages) {
    const email = parseMessage(msg);
    if (email) {
      email.hasAttachments = (msg.hasAttachments as boolean) ?? false;
      emails.push(email);
    }
  }
  return emails;
}
