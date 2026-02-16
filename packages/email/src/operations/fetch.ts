/**
 * Email fetch operations.
 *
 * Bulk retrieval, pagination, and batch body fetching
 * for Microsoft Graph email messages.
 */

import {
  parseMessages,
  parseMessagesWithAttachments,
} from "@email/message-parser";
import { RateLimiter } from "@email/rate-limiter";
import type { EmailMessage, GraphClientContext } from "@email/types";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DAYS_BACK = 30;
const MAX_EMAILS_DEFAULT = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get recent emails from a mailbox.
 *
 * @param ctx - Graph client context
 * @param userId - Email address of the mailbox (required for app auth, ignored for user auth)
 * @param since - Only return emails received after this date (default: 30 days ago)
 * @param limit - Maximum number of emails to return (default: 50)
 * @returns Promise resolving to array of email messages
 *
 * @example
 * // App auth - specify userId
 * const emails = await getEmails(ctx, 'user@example.com', new Date('2024-01-01'), 100);
 *
 * @example
 * // User auth - userId is ignored, uses /me endpoint
 * const myEmails = await getEmails(ctx);
 */
export async function getEmails(
  ctx: GraphClientContext,
  userId?: string,
  since?: Date,
  limit?: number
): Promise<EmailMessage[]> {
  const client = ctx.getClient();
  const effectiveLimit = limit ?? ctx.config.batchSize ?? DEFAULT_BATCH_SIZE;
  const daysBack = ctx.config.daysBack ?? DEFAULT_DAYS_BACK;
  const sinceDate = since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
  const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;
  const messagesPath = ctx.getMessagesPath(userId);
  const displayName = ctx.authMode === "user" ? "your mailbox" : userId;

  try {
    const response = await client
      .api(messagesPath)
      .filter(dateFilter)
      .orderby("receivedDateTime desc")
      .top(effectiveLimit)
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,categories"
      )
      .get();

    if (!response?.value) {
      console.log(`No messages found for ${displayName}`);
      return [];
    }

    const emails = parseMessages(response.value);
    console.log(`Retrieved ${emails.length} emails for ${displayName}`);
    return emails;
  } catch (error) {
    console.error(`Error fetching emails for ${displayName}:`, error);
    throw error;
  }
}

/**
 * Stream emails with pagination, processing each page via callback.
 *
 * Unlike getAllEmailsPaginated, this method processes emails as they arrive
 * instead of accumulating them in memory. Ideal for large syncs.
 *
 * @param ctx - Graph client context
 * @param options - Stream configuration
 * @param options.userId - Email address of the mailbox (required for app auth)
 * @param options.since - Only return emails received after this date
 * @param options.maxEmails - Maximum total emails to process (default: unlimited)
 * @param options.onPage - Callback invoked for each page of emails
 * @returns Promise resolving to total number of emails processed
 *
 * @example
 * // Stream and process emails as they arrive
 * let total = 0;
 * await streamEmailsPaginated(ctx, {
 *   userId: 'user@example.com',
 *   since: new Date('2025-01-01'),
 *   onPage: async (emails, progress) => {
 *     for (const email of emails) {
 *       await storeEmail(email);
 *       total++;
 *     }
 *     console.log(`Processed ${progress.processed}/${progress.total ?? '?'}`);
 *   }
 * });
 */
export async function streamEmailsPaginated(
  ctx: GraphClientContext,
  options: {
    userId?: string;
    since?: Date;
    maxEmails?: number;
    onPage: (
      emails: EmailMessage[],
      progress: { processed: number; pageNumber: number; hasMore: boolean }
    ) => Promise<void> | void;
  }
): Promise<number> {
  const client = ctx.getClient();
  const daysBack = ctx.config.daysBack ?? DEFAULT_DAYS_BACK;
  const sinceDate =
    options.since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
  const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;
  const messagesPath = ctx.getMessagesPath(options.userId);
  const batchSize = ctx.config.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxEmails = options.maxEmails ?? Number.MAX_SAFE_INTEGER;

  let processed = 0;
  let pageNumber = 0;

  try {
    let response = await client
      .api(messagesPath)
      .filter(dateFilter)
      .orderby("receivedDateTime desc")
      .top(Math.min(batchSize, maxEmails))
      .select(
        "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
      )
      .get();

    while (response?.value && processed < maxEmails) {
      pageNumber++;
      const emails = parseMessagesWithAttachments(response.value);
      const remaining = maxEmails - processed;
      const pageEmails = emails.slice(0, remaining);

      const nextLink = response["@odata.nextLink"];
      const hasMore =
        Boolean(nextLink) && processed + pageEmails.length < maxEmails;

      // Process this page immediately
      await options.onPage(pageEmails, {
        hasMore,
        pageNumber,
        processed: processed + pageEmails.length,
      });

      processed += pageEmails.length;

      if (processed >= maxEmails || !nextLink) {
        break;
      }

      response = await client.api(nextLink).get();
    }

    return processed;
  } catch (error) {
    console.error(
      `Error streaming emails for ${options.userId ?? "user"}:`,
      error
    );
    throw error;
  }
}

/**
 * Get all emails with automatic pagination.
 *
 * WARNING: This method loads ALL emails into memory before returning.
 * For large syncs, use streamEmailsPaginated() instead to process
 * emails as they arrive without memory accumulation.
 *
 * @param ctx - Graph client context
 * @param userId - Email address of the mailbox (required for app auth)
 * @param since - Only return emails received after this date (default: 30 days ago)
 * @param maxEmails - Maximum total emails to return (default: 500)
 * @param options - Additional options
 * @param options.includeBody - Whether to include full body content (default: true)
 * @param options.before - Only return emails received before this date
 * @returns Promise resolving to array of all fetched email messages
 *
 * @example
 * // Fetch up to 1000 emails from the last week
 * const emails = await getAllEmailsPaginated(
 *   ctx,
 *   'user@example.com',
 *   new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
 *   1000
 * );
 */
export async function getAllEmailsPaginated(
  ctx: GraphClientContext,
  userId?: string,
  since?: Date,
  maxEmails = MAX_EMAILS_DEFAULT,
  options?: { includeBody?: boolean; before?: Date }
): Promise<EmailMessage[]> {
  const client = ctx.getClient();
  const daysBack = ctx.config.daysBack ?? DEFAULT_DAYS_BACK;
  const sinceDate = since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
  const includeBody = options?.includeBody ?? true;

  // Build date filter
  let dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;
  if (options?.before) {
    dateFilter += ` and receivedDateTime lt ${options.before.toISOString()}`;
  }

  const messagesPath = ctx.getMessagesPath(userId);
  const displayName = ctx.authMode === "user" ? "your mailbox" : userId;
  const batchSize = ctx.config.batchSize ?? DEFAULT_BATCH_SIZE;
  const allEmails: EmailMessage[] = [];

  // Fast listing without body, or full fetch with body
  const selectFields = includeBody
    ? "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId,categories"
    : "id,internetMessageId,subject,receivedDateTime,from,toRecipients,ccRecipients,hasAttachments,conversationId,categories,bodyPreview";

  try {
    // Proactive rate limiting
    await ctx.rateLimiter.throttle();

    let response = await client
      .api(messagesPath)
      .filter(dateFilter)
      .orderby("receivedDateTime desc")
      .top(Math.min(batchSize, maxEmails))
      .select(selectFields)
      .get();

    while (response?.value && allEmails.length < maxEmails) {
      const emails = parseMessagesWithAttachments(response.value);
      const remaining = maxEmails - allEmails.length;
      allEmails.push(...emails.slice(0, remaining));

      const nextLink = response["@odata.nextLink"];
      if (allEmails.length >= maxEmails || !nextLink) {
        break;
      }

      // Rate limit before next page
      await ctx.rateLimiter.throttle();
      response = await client.api(nextLink).get();
    }

    console.log(
      `Retrieved total of ${allEmails.length} emails for ${displayName}`
    );
    return allEmails;
  } catch (error) {
    console.error(`Error fetching paginated emails for ${displayName}:`, error);
    throw error;
  }
}

const GRAPH_BATCH_SIZE = 20;
const BODY_BATCH_MAX_RETRIES = 5;

/**
 * Process individual responses from a Graph batch call,
 * collecting successful bodies and handling per-item throttling.
 */
async function processBatchResponses(
  responses: {
    status: number;
    body?: { id?: string; body?: { content?: string } };
    headers?: Record<string, string>;
  }[],
  results: Map<string, string>,
  batchIndex: number
): Promise<void> {
  for (const response of responses) {
    if (response.status === 200 && response.body?.id) {
      results.set(response.body.id, response.body.body?.content || "");
    } else if (response.status === 429) {
      const retryAfter = Number(response.headers?.["Retry-After"]) || 30;
      console.error(
        `[Batch ${batchIndex}] Individual request throttled, waiting ${retryAfter}s...`
      );
      await sleep(retryAfter * 1000);
    }
  }
}

/**
 * Handle a rate-limit (429) error from a batch request.
 * Returns the updated retry count, or -1 to signal a non-retryable error.
 */
async function handleBatchRateLimitError(
  error: unknown,
  retries: number,
  batchIndex: number
): Promise<number> {
  const graphError = error as {
    statusCode?: number;
    headers?: { get?: (key: string) => string | null };
  };

  if (graphError.statusCode !== 429) {
    console.error(`Batch body fetch failed for batch ${batchIndex}:`, error);
    return -1; // non-retryable
  }

  const retryAfterHeader = graphError.headers?.get?.("Retry-After");
  const retryAfterMs = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10) * 1000
    : undefined;
  const delayMs = RateLimiter.calculateBackoff(retries, retryAfterMs);

  console.error(
    `[Batch ${batchIndex}] Rate limited (429), retry ${retries + 1}/${BODY_BATCH_MAX_RETRIES} in ${(delayMs / 1000).toFixed(1)}s...`
  );
  await sleep(delayMs);
  return retries + 1;
}

/**
 * Execute a single batch request with retry logic for rate limiting.
 */
async function executeBatchWithRetry(
  ctx: GraphClientContext,
  batchRequests: { id: string; method: string; url: string }[],
  results: Map<string, string>,
  batchIndex: number
): Promise<void> {
  const client = ctx.getClient();
  let retries = 0;

  while (retries < BODY_BATCH_MAX_RETRIES) {
    try {
      await ctx.rateLimiter.throttle();
      const batchResponse = await client.api("/$batch").post({
        requests: batchRequests,
      });
      await processBatchResponses(
        batchResponse.responses || [],
        results,
        batchIndex
      );
      return; // success
    } catch (error) {
      retries = await handleBatchRateLimitError(error, retries, batchIndex);
      if (retries < 0) {
        return; // non-retryable error, skip batch
      }
    }
  }

  console.error(
    `[Batch ${batchIndex}] Gave up after ${BODY_BATCH_MAX_RETRIES} retries`
  );
}

/**
 * Batch fetch email bodies using Graph batch API.
 * Fetches up to 20 emails at a time (Graph batch limit).
 * Includes retry logic for rate limiting (429 errors).
 *
 * @param ctx - Graph client context
 * @param emailIds - Array of email IDs to fetch bodies for
 * @param userId - User/mailbox to fetch from
 * @returns Map of email ID to body content (HTML)
 */
export async function getEmailBodiesBatch(
  ctx: GraphClientContext,
  emailIds: string[],
  userId?: string
): Promise<Map<string, string>> {
  const messagesPath = ctx.getMessagesPath(userId);
  const results = new Map<string, string>();

  for (let i = 0; i < emailIds.length; i += GRAPH_BATCH_SIZE) {
    const batch = emailIds.slice(i, i + GRAPH_BATCH_SIZE);
    const batchIndex = Math.floor(i / GRAPH_BATCH_SIZE);

    const batchRequests = batch.map((id, idx) => ({
      id: String(idx),
      method: "GET",
      url: `${messagesPath}/${id}?$select=id,body`,
    }));

    await executeBatchWithRetry(ctx, batchRequests, results, batchIndex);
  }

  return results;
}
