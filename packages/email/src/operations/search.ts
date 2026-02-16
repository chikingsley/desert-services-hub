/**
 * Email search and query operations.
 *
 * KQL search, OData filtering, single-email retrieval,
 * and user-auth convenience wrappers.
 */

import {
  parseMessage,
  parseMessagesWithAttachments,
} from "@email/message-parser";
import type {
  EmailMessage,
  EmailSearchOptions,
  GraphClientContext,
} from "@email/types";

const DEFAULT_SEARCH_LIMIT = 50;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DAYS_BACK = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Require user auth for /me operations.
 * @throws Error if not using user authentication
 */
function requireUserAuth(ctx: GraphClientContext): void {
  if (ctx.authMode !== "user") {
    throw new Error(
      "This method requires user authentication (delegated). Call initUserAuth() first."
    );
  }
}

/**
 * Search emails using KQL (Keyword Query Language).
 *
 * Performs a text search across email subject and body. For structured
 * queries (sender, hasAttachments, etc.), use filterEmails() instead.
 *
 * @param ctx - Graph client context
 * @param options - Search configuration
 * @param options.query - KQL search query (searches subject and body)
 * @param options.userId - Email address of the mailbox (required for app auth)
 * @param options.limit - Maximum results to return (default: 50)
 * @param options.since - Only return emails received after this date
 * @param options.until - Only return emails received before this date
 * @param options.folder - Search in specific folder: 'inbox', 'sentitems', 'drafts', 'deleteditems'
 * @returns Promise resolving to array of matching email messages
 *
 * @example
 * // Simple search (searches subject and body)
 * const results = await searchEmails(ctx, { query: 'invoice', userId: 'user@example.com' });
 *
 * @example
 * // Search with date range
 * const results = await searchEmails(ctx, {
 *   query: 'quarterly report',
 *   userId: 'user@example.com',
 *   since: new Date('2024-01-01'),
 *   until: new Date('2024-03-31'),
 *   limit: 100,
 * });
 *
 * @example
 * // Search in specific folder
 * const drafts = await searchEmails(ctx, {
 *   query: 'proposal',
 *   userId: 'user@example.com',
 *   folder: 'drafts',
 * });
 */
export async function searchEmails(
  ctx: GraphClientContext,
  options: EmailSearchOptions
): Promise<EmailMessage[]> {
  const client = ctx.getClient();
  // If folder specified, search within that folder; otherwise search all messages
  const basePath = ctx.getBasePath(options.userId);
  const messagesPath = options.folder
    ? `${basePath}/mailFolders/${options.folder}/messages`
    : `${basePath}/messages`;
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const hasDateFilters = options.since || options.until;

  // MS Graph doesn't allow combining $search with $filter
  // If date filters are present, fetch more and filter locally
  const fetchLimit = hasDateFilters ? limit * 3 : limit;

  try {
    const response = await client
      .api(messagesPath)
      .search(`"${options.query}"`)
      .top(fetchLimit)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    if (!response?.value) {
      return [];
    }

    let emails = parseMessagesWithAttachments(response.value);

    // Apply date filters locally since Graph API doesn't support $filter with $search
    if (options.since) {
      const sinceTime = options.since.getTime();
      emails = emails.filter(
        (e) => new Date(e.receivedDateTime).getTime() >= sinceTime
      );
    }
    if (options.until) {
      const untilTime = options.until.getTime();
      emails = emails.filter(
        (e) => new Date(e.receivedDateTime).getTime() <= untilTime
      );
    }

    return emails.slice(0, limit);
  } catch (error) {
    console.error("Error searching emails:", error);
    throw error;
  }
}

/**
 * Filter emails using OData $filter syntax.
 *
 * Use this for structured queries like sender, hasAttachments, date ranges.
 * For text search, use searchEmails() instead.
 *
 * Note: Some filters don't work well with sorting - use simple filters.
 *
 * @param ctx - Graph client context
 * @param options - Filter configuration
 * @param options.filter - OData filter expression
 * @param options.userId - Email address of the mailbox (required for app auth)
 * @param options.limit - Maximum results to return (default: 50)
 * @returns Promise resolving to array of matching email messages
 *
 * @example
 * // Filter by sender
 * const fromJohn = await filterEmails(ctx, {
 *   filter: "from/emailAddress/address eq 'john@example.com'",
 *   userId: 'user@example.com',
 * });
 *
 * @example
 * // Filter emails with attachments
 * const withAttachments = await filterEmails(ctx, {
 *   filter: 'hasAttachments eq true',
 *   userId: 'user@example.com',
 *   limit: 20,
 * });
 *
 * @example
 * // Filter by date range
 * const recent = await filterEmails(ctx, {
 *   filter: "receivedDateTime ge 2024-01-01T00:00:00Z",
 *   userId: 'user@example.com',
 * });
 */
export async function filterEmails(
  ctx: GraphClientContext,
  options: {
    filter: string;
    userId?: string;
    limit?: number;
  }
): Promise<EmailMessage[]> {
  const client = ctx.getClient();
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const messagesPath = ctx.getMessagesPath(options.userId);

  try {
    // Note: orderby can cause "InefficientFilter" errors with some filters
    const response = await client
      .api(messagesPath)
      .filter(options.filter)
      .top(limit)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    if (!response?.value) {
      return [];
    }

    return parseMessagesWithAttachments(response.value);
  } catch (error) {
    console.error("Error filtering emails:", error);
    throw error;
  }
}

/**
 * Get a single email by ID.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to the email message, or null if not found
 *
 * @example
 * const email = await getEmail(ctx, 'AAMkAGI2...', 'user@example.com');
 * if (email) {
 *   console.log(email.subject, email.bodyContent);
 * }
 */
export async function getEmail(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<EmailMessage | null> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const msg = await client
      .api(`${basePath}/messages/${messageId}`)
      .select(
        "id,internetMessageId,parentFolderId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    const email = parseMessage(msg);
    if (email) {
      email.hasAttachments = msg.hasAttachments ?? false;
    }
    return email;
  } catch (error) {
    console.error("Error fetching email:", error);
    return null;
  }
}

/**
 * Get recent emails from signed-in user's mailbox.
 *
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param options - Optional query configuration
 * @param options.since - Only return emails received after this date
 * @param options.limit - Maximum number of emails to return
 * @returns Promise resolving to array of email messages
 *
 * @example
 * const emails = await getMyEmails(ctx, { limit: 5 });
 *
 * @example
 * const recentEmails = await getMyEmails(ctx, {
 *   since: new Date('2024-01-01'),
 *   limit: 20,
 * });
 */
export async function getMyEmails(
  ctx: GraphClientContext,
  options?: {
    since?: Date;
    limit?: number;
  }
): Promise<EmailMessage[]> {
  requireUserAuth(ctx);
  const client = ctx.getClient();
  const limit = options?.limit ?? ctx.config.batchSize ?? DEFAULT_BATCH_SIZE;
  const daysBack = ctx.config.daysBack ?? DEFAULT_DAYS_BACK;
  const sinceDate =
    options?.since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
  const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;

  try {
    const response = await client
      .api("/me/messages")
      .filter(dateFilter)
      .orderby("receivedDateTime desc")
      .top(limit)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    if (!response?.value) {
      return [];
    }

    return parseMessagesWithAttachments(response.value);
  } catch (error) {
    console.error("Error fetching my emails:", error);
    throw error;
  }
}

/**
 * Search signed-in user's mailbox using KQL.
 *
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param options - Search configuration
 * @param options.query - KQL search query (searches subject and body)
 * @param options.limit - Maximum results to return (default: 50)
 * @param options.since - Only return emails received after this date
 * @param options.until - Only return emails received before this date
 * @param options.folder - Search in specific folder: 'inbox', 'sentitems', 'drafts', 'deleteditems'
 * @returns Promise resolving to array of matching email messages
 *
 * @example
 * const invoices = await searchMyEmails(ctx, { query: 'invoice' });
 *
 * @example
 * const permits = await searchMyEmails(ctx, {
 *   query: 'permit',
 *   limit: 10,
 *   since: new Date('2024-01-01'),
 *   folder: 'inbox',
 * });
 */
export async function searchMyEmails(
  ctx: GraphClientContext,
  options: {
    query: string;
    limit?: number;
    since?: Date;
    until?: Date;
    folder?: "inbox" | "sentitems" | "drafts" | "deleteditems";
  }
): Promise<EmailMessage[]> {
  requireUserAuth(ctx);
  const client = ctx.getClient();
  const messagesPath = options.folder
    ? `/me/mailFolders/${options.folder}/messages`
    : "/me/messages";
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const hasDateFilters = options.since || options.until;
  const fetchLimit = hasDateFilters ? limit * 3 : limit;

  try {
    const response = await client
      .api(messagesPath)
      .search(`"${options.query}"`)
      .top(fetchLimit)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    if (!response?.value) {
      return [];
    }

    let emails = parseMessagesWithAttachments(response.value);

    if (options.since) {
      const sinceTime = options.since.getTime();
      emails = emails.filter(
        (e) => new Date(e.receivedDateTime).getTime() >= sinceTime
      );
    }
    if (options.until) {
      const untilTime = options.until.getTime();
      emails = emails.filter(
        (e) => new Date(e.receivedDateTime).getTime() <= untilTime
      );
    }

    return emails.slice(0, limit);
  } catch (error) {
    console.error("Error searching my emails:", error);
    throw error;
  }
}

/**
 * Filter signed-in user's mailbox using OData $filter syntax.
 *
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param options - Filter configuration
 * @param options.filter - OData filter expression
 * @param options.limit - Maximum results to return (default: 50)
 * @returns Promise resolving to array of matching email messages
 *
 * @example
 * const withAttachments = await filterMyEmails(ctx, {
 *   filter: 'hasAttachments eq true',
 * });
 *
 * @example
 * const fromJohn = await filterMyEmails(ctx, {
 *   filter: "from/emailAddress/address eq 'john@example.com'",
 *   limit: 20,
 * });
 */
export async function filterMyEmails(
  ctx: GraphClientContext,
  options: {
    filter: string;
    limit?: number;
  }
): Promise<EmailMessage[]> {
  requireUserAuth(ctx);
  const client = ctx.getClient();
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;

  try {
    const response = await client
      .api("/me/messages")
      .filter(options.filter)
      .top(limit)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    if (!response?.value) {
      return [];
    }

    return parseMessagesWithAttachments(response.value);
  } catch (error) {
    console.error("Error filtering my emails:", error);
    throw error;
  }
}

/**
 * Get a single email from signed-in user's mailbox by ID.
 *
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @returns Promise resolving to the email message, or null if not found
 *
 * @example
 * const email = await getMyEmail(ctx, 'AAMkAGI2...');
 * if (email) {
 *   console.log(email.subject);
 * }
 */
export async function getMyEmail(
  ctx: GraphClientContext,
  messageId: string
): Promise<EmailMessage | null> {
  requireUserAuth(ctx);
  const client = ctx.getClient();

  try {
    const msg = await client
      .api(`/me/messages/${messageId}`)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    const email = parseMessage(msg);
    if (email) {
      email.hasAttachments = msg.hasAttachments ?? false;
    }
    return email;
  } catch (error) {
    console.error("Error fetching my email:", error);
    return null;
  }
}

/**
 * List mail folders for signed-in user.
 *
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @returns Promise resolving to array of folder objects with id, displayName, and parentFolderId
 *
 * @example
 * const folders = await getMyFolders(ctx);
 * // [{ id: '...', displayName: 'Inbox', parentFolderId: null }, ...]
 */
export async function getMyFolders(
  ctx: GraphClientContext
): Promise<
  { id: string; displayName: string; parentFolderId: string | null }[]
> {
  requireUserAuth(ctx);
  const client = ctx.getClient();

  try {
    const response = await client.api("/me/mailFolders").top(100).get();

    if (!response?.value) {
      return [];
    }

    return response.value.map((folder: Record<string, unknown>) => ({
      displayName: folder.displayName as string,
      id: folder.id as string,
      parentFolderId: (folder.parentFolderId as string) ?? null,
    }));
  } catch (error) {
    console.error("Error listing my folders:", error);
    throw error;
  }
}
