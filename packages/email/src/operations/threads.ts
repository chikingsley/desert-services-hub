/**
 * Thread & Conversation Operations
 *
 * Operations for fetching email threads and translating message IDs.
 * Uses GraphClientContext for all Graph API interactions.
 */

import {
  parseMessage,
  parseMessagesWithAttachments,
} from "@email/message-parser";
import type { EmailMessage, GraphClientContext } from "@email/types";

const MAX_TRANSLATE_IDS_BATCH = 1000;

/**
 * Translate mutable REST message IDs to immutable IDs.
 *
 * Graph limit is 1,000 IDs per request, so this function batches automatically.
 *
 * @param ctx - Graph client context
 * @param messageIds - Array of mutable REST message IDs to translate
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Map from source (mutable) ID to target (immutable) ID
 */
export async function translateMessageIdsToImmutable(
  ctx: GraphClientContext,
  messageIds: string[],
  userId?: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (messageIds.length === 0) {
    return out;
  }

  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  for (let i = 0; i < messageIds.length; i += MAX_TRANSLATE_IDS_BATCH) {
    const chunk = messageIds.slice(i, i + MAX_TRANSLATE_IDS_BATCH);
    await ctx.rateLimiter.throttle();

    const response = (await client
      .api(`${basePath}/translateExchangeIds`)
      .post({
        inputIds: chunk,
        sourceIdType: "restId",
        targetIdType: "restImmutableEntryId",
      })) as {
      value?: {
        sourceId?: string;
        targetId?: string;
      }[];
    };

    for (const item of response.value ?? []) {
      if (item.sourceId && item.targetId) {
        out.set(item.sourceId, item.targetId);
      }
    }
  }

  return out;
}

/**
 * Get all emails in a conversation thread.
 *
 * Returns all emails with the same conversationId, sorted by receivedDateTime
 * (oldest first) for natural reading order.
 *
 * @param ctx - Graph client context
 * @param conversationId - The conversation ID from an email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Array of email messages in the thread, oldest first
 */
export async function getEmailThread(
  ctx: GraphClientContext,
  conversationId: string,
  userId?: string
): Promise<EmailMessage[]> {
  const client = ctx.getClient();
  const messagesPath = ctx.getMessagesPath(userId);
  const selectFields =
    "id,internetMessageId,parentFolderId,subject,receivedDateTime,from,conversationId";
  const all: EmailMessage[] = [];

  try {
    await ctx.rateLimiter.throttle();

    // Note: orderby causes "InefficientFilter" error with conversationId filter
    let response = await client
      .api(messagesPath)
      .filter(`conversationId eq '${conversationId}'`)
      .top(100)
      .select(selectFields)
      .get();

    while (response?.value) {
      all.push(...parseMessagesWithAttachments(response.value));

      const nextLink = response["@odata.nextLink"];
      if (!nextLink) {
        break;
      }

      await ctx.rateLimiter.throttle();
      response = await client.api(nextLink).get();
    }

    // Sort by receivedDateTime ascending (oldest first)
    return all.toSorted(
      (a, b) =>
        new Date(a.receivedDateTime).getTime() -
        new Date(b.receivedDateTime).getTime()
    );
  } catch (error) {
    console.error("Error fetching email thread:", error);
    throw error;
  }
}

/**
 * Get the full conversation thread for a specific message.
 *
 * Fetches the email by ID, extracts its conversationId, and returns all
 * messages in that thread sorted oldest-first.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of any email in the thread
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Array of all email messages in the thread
 */
export async function getThreadByMessageId(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<EmailMessage[]> {
  // Inline the getEmail logic to avoid cross-module dependency
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  let email: EmailMessage | null = null;
  try {
    const msg = await client
      .api(`${basePath}/messages/${messageId}`)
      .select(
        "id,internetMessageId,parentFolderId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    email = parseMessage(msg);
    if (email) {
      email.hasAttachments = msg.hasAttachments ?? false;
    }
  } catch (error) {
    console.error("Error fetching email:", error);
    email = null;
  }

  if (!email?.conversationId) {
    return email ? [email] : [];
  }
  return getEmailThread(ctx, email.conversationId, userId);
}
