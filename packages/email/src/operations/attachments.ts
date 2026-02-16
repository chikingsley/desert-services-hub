/**
 * Attachment Operations
 *
 * Operations for listing, downloading, and building email attachments
 * via the Microsoft Graph API. Uses GraphClientContext for all interactions.
 */

import { RateLimiter } from "@email/rate-limiter";
import type {
  EmailAttachment,
  GraphClientContext,
  SendEmailOptions,
  TrackedEmailAttachment,
} from "@email/types";
import { getOneDriveFileFromShareUrl } from "@lib/graph/files";
import { ResponseType } from "@microsoft/microsoft-graph-client";

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * List all attachments for an email.
 *
 * Returns metadata about each attachment including ID, name, content type,
 * size, and whether it's an inline attachment. Includes retry logic with
 * exponential backoff for rate limiting (429) responses.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Array of attachment metadata
 */
export async function getAttachments(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<EmailAttachment[]> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);
  const MAX_RETRIES = 5;

  for (let retries = 0; retries < MAX_RETRIES; retries++) {
    try {
      // Proactive rate limiting
      await ctx.rateLimiter.throttle();

      const response = await client
        .api(`${basePath}/messages/${messageId}/attachments`)
        .get();

      if (!response?.value) {
        return [];
      }

      return response.value.map((att: Record<string, unknown>) => ({
        contentType: att.contentType as string,
        id: att.id as string,
        isInline: (att.isInline as boolean) ?? false,
        name: att.name as string,
        size: att.size as number,
      }));
    } catch (error) {
      const graphError = error as {
        statusCode?: number;
        headers?: { get?: (key: string) => string | null };
      };

      if (graphError.statusCode === 429) {
        // Extract Retry-After header (in seconds)
        const retryAfterHeader = graphError.headers?.get?.("Retry-After");
        const retryAfterMs = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10) * 1000
          : undefined;

        // Calculate backoff with jitter (uses Retry-After if provided)
        const delayMs = RateLimiter.calculateBackoff(retries, retryAfterMs);

        console.error(
          `[getAttachments] Rate limited (429), retry ${retries + 1}/${MAX_RETRIES} in ${(delayMs / 1000).toFixed(1)}s...`
        );
        await sleep(delayMs);
        continue;
      }

      // Deleted/moved copies are expected in mailbox-search workflows.
      if (graphError.statusCode === 404) {
        throw error;
      }

      // Non-rate-limit error
      console.error("Error fetching attachments:", error);
      throw error;
    }
  }

  console.error(`[getAttachments] Gave up after ${MAX_RETRIES} retries`);
  return [];
}

/**
 * Download an attachment's content as a Buffer.
 *
 * Handles three attachment types:
 * 1. Standard file attachments with base64 contentBytes
 * 2. Cloud/OneDrive reference attachments (fetched via SharePoint URL)
 * 3. Fallback to $value endpoint for attachments missing contentBytes
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param attachmentId - The unique ID of the attachment
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Attachment content as a Buffer
 */
export async function downloadAttachment(
  ctx: GraphClientContext,
  messageId: string,
  attachmentId: string,
  userId?: string
): Promise<Buffer> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const response = await client
      .api(`${basePath}/messages/${messageId}/attachments/${attachmentId}`)
      .get();

    // Most file attachments include base64 contentBytes directly.
    if (response?.contentBytes) {
      return Buffer.from(response.contentBytes, "base64");
    }

    const odataType = (response?.["@odata.type"] as string | undefined) ?? "";

    // Cloud / OneDrive attachments show up as referenceAttachment and must be
    // fetched via their SharePoint URL (contentBytes/$value won't work).
    if (odataType.includes("referenceAttachment")) {
      const beta = await client
        .api(`${basePath}/messages/${messageId}/attachments/${attachmentId}`)
        .version("beta")
        .get();

      const sourceUrl = beta?.sourceUrl as string | undefined;
      if (!sourceUrl) {
        throw new Error("Reference attachment missing sourceUrl");
      }

      const meta = await getOneDriveFileFromShareUrl(sourceUrl);
      const fileRes = await fetch(meta.downloadUrl);
      if (!fileRes.ok) {
        throw new Error(
          `Reference attachment download failed: ${fileRes.status}`
        );
      }

      const ab = await fileRes.arrayBuffer();
      return Buffer.from(new Uint8Array(ab));
    }

    // Some attachments omit contentBytes on the attachment metadata response.
    // Fallback to the $value endpoint which returns the raw bytes for file attachments.
    const raw = await client
      .api(
        `${basePath}/messages/${messageId}/attachments/${attachmentId}/$value`
      )
      .responseType(ResponseType.ARRAYBUFFER)
      .get();

    if (raw instanceof ArrayBuffer) {
      return Buffer.from(new Uint8Array(raw));
    }

    // Defensive: handle unexpected shapes.
    if (raw && typeof raw === "object" && ArrayBuffer.isView(raw)) {
      const view = raw as ArrayBufferView;
      return Buffer.from(new Uint8Array(view.buffer));
    }

    throw new Error("Attachment has no content");
  } catch (error) {
    console.error("Error downloading attachment:", error);
    throw error;
  }
}

/**
 * Download all non-inline attachments from an email.
 *
 * Skips inline attachments (like embedded images) and downloads only
 * regular file attachments.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Array of downloaded attachments with name, contentType, and content
 */
export async function downloadAllAttachments(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<{ name: string; contentType: string; content: Buffer }[]> {
  const attachments = await getAttachments(ctx, messageId, userId);
  const results: {
    name: string;
    contentType: string;
    content: Buffer;
  }[] = [];

  for (const att of attachments) {
    if (att.isInline) {
      continue;
    }
    const content = await downloadAttachment(ctx, messageId, att.id, userId);
    results.push({
      content,
      contentType: att.contentType,
      name: att.name,
    });
  }

  return results;
}

/**
 * Get attachments with source tracking information.
 *
 * Returns attachments that include the source mailbox and message ID,
 * preventing userId mismatch errors when downloading attachments from
 * multi-mailbox searches.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Array of tracked attachments with source metadata
 */
export async function getTrackedAttachments(
  ctx: GraphClientContext,
  messageId: string,
  userId: string
): Promise<TrackedEmailAttachment[]> {
  const attachments = await getAttachments(ctx, messageId, userId);

  return attachments.map((att) => ({
    ...att,
    sourceMailbox: userId,
    sourceMessageId: messageId,
  }));
}

/**
 * Safely download an attachment using its tracked source information.
 *
 * Prevents the common error of using the wrong userId when downloading
 * attachments from multi-mailbox searches. Automatically uses the
 * sourceMailbox from the tracked attachment.
 *
 * @param ctx - Graph client context
 * @param attachment - Tracked attachment with source mailbox information
 * @returns Attachment content as a Buffer
 * @throws Error if attachment doesn't have source tracking info
 */
export async function safeDownloadAttachment(
  ctx: GraphClientContext,
  attachment: TrackedEmailAttachment
): Promise<Buffer> {
  if (!(attachment.sourceMailbox && attachment.sourceMessageId)) {
    throw new Error(
      "Attachment missing source tracking info. Use getTrackedAttachments() instead of getAttachments()."
    );
  }

  return await downloadAttachment(
    ctx,
    attachment.sourceMessageId,
    attachment.id,
    attachment.sourceMailbox
  );
}

/**
 * Safely download all non-inline attachments from an email using tracked sources.
 *
 * Combines getTrackedAttachments + safeDownloadAttachment for convenience.
 * Prevents userId mismatch errors when downloading from multi-mailbox searches.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Array of downloaded attachments with tracking info
 */
export async function safeDownloadAllAttachments(
  ctx: GraphClientContext,
  messageId: string,
  userId: string
): Promise<
  {
    name: string;
    contentType: string;
    content: Buffer;
    sourceMailbox: string;
    sourceMessageId: string;
  }[]
> {
  const attachments = await getTrackedAttachments(ctx, messageId, userId);
  const results: {
    name: string;
    contentType: string;
    content: Buffer;
    sourceMailbox: string;
    sourceMessageId: string;
  }[] = [];

  for (const att of attachments) {
    if (att.isInline) {
      continue;
    }
    const content = await safeDownloadAttachment(ctx, att);
    results.push({
      content,
      contentType: att.contentType,
      name: att.name,
      sourceMailbox: att.sourceMailbox,
      sourceMessageId: att.sourceMessageId,
    });
  }

  return results;
}

/**
 * Build attachment array for Graph API from send options.
 *
 * Handles both legacy single-attachment and multiple-attachment formats,
 * including inline attachments with contentId.
 *
 * @param options - Send email options containing attachment(s)
 * @returns Array of attachment objects formatted for Graph API
 */
export function buildAttachments(
  options: SendEmailOptions
): Record<string, unknown>[] {
  const attachments: Record<string, unknown>[] = [];

  // Legacy single attachment support
  if (options.attachment) {
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      contentBytes: options.attachment.contentBytes,
      contentType: options.attachment.contentType,
      name: options.attachment.name,
    });
  }

  // Multiple attachments with inline support
  for (const att of options.attachments ?? []) {
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      contentBytes: att.contentBytes,
      contentType: att.contentType,
      name: att.name,
      ...(att.contentId && { contentId: att.contentId }),
      ...(att.isInline && { isInline: true }),
    });
  }

  return attachments;
}
