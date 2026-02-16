/**
 * Email state mutation operations.
 *
 * Archive, move, delete, read/unread, flag, categories,
 * and message status queries.
 */

import type { GraphClientContext } from "@email/types";

/**
 * Archive an email (move to Archive folder).
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when email is archived
 *
 * @example
 * await archiveEmail(ctx, 'AAMkAGI2...', 'user@example.com');
 */
export async function archiveEmail(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await ctx.rateLimiter.throttle();
    await client
      .api(`${basePath}/messages/${messageId}/move`)
      .post({ destinationId: "archive" });
  } catch (error) {
    console.error("Error archiving email:", error);
    throw error;
  }
}

/**
 * Move an email to a specific folder.
 *
 * Use listFolders() to get folder IDs, or use well-known folder names.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param destinationId - Folder ID or well-known name: 'inbox', 'drafts', 'sentitems', 'deleteditems', 'archive', 'junkemail'
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when email is moved
 *
 * @example
 * // Move to well-known folder
 * await moveEmail(ctx, 'AAMkAGI2...', 'archive', 'user@example.com');
 *
 * @example
 * // Move to custom folder by ID
 * const folders = await listFolders(ctx, 'user@example.com');
 * const projectFolder = folders.find(f => f.displayName === 'Projects');
 * await moveEmail(ctx, 'AAMkAGI2...', projectFolder.id, 'user@example.com');
 */
export async function moveEmail(
  ctx: GraphClientContext,
  messageId: string,
  destinationId: string,
  userId?: string
): Promise<{
  id: string;
  internetMessageId?: string;
  parentFolderId?: string;
  conversationId?: string;
}> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await ctx.rateLimiter.throttle();
    const response = await client
      .api(`${basePath}/messages/${messageId}/move`)
      .post({ destinationId });

    return {
      conversationId: (response.conversationId as string) ?? undefined,
      id: (response.id as string) ?? "",
      internetMessageId: (response.internetMessageId as string) ?? undefined,
      parentFolderId: (response.parentFolderId as string) ?? undefined,
    };
  } catch (error) {
    console.error("Error moving email:", error);
    throw error;
  }
}

/**
 * Delete an email (soft delete - moves to Deleted Items).
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when email is deleted
 *
 * @example
 * await deleteEmail(ctx, 'AAMkAGI2...', 'user@example.com');
 */
export async function deleteEmail(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);
  await client.api(`${basePath}/messages/${messageId}`).delete();
}

/**
 * Mark an email as read.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when email is marked as read
 *
 * @example
 * await markAsRead(ctx, 'AAMkAGI2...', 'user@example.com');
 */
export async function markAsRead(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await client
      .api(`${basePath}/messages/${messageId}`)
      .patch({ isRead: true });
  } catch (error) {
    console.error("Error marking email as read:", error);
    throw error;
  }
}

/**
 * Mark an email as unread.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when email is marked as unread
 *
 * @example
 * await markAsUnread(ctx, 'AAMkAGI2...', 'user@example.com');
 */
export async function markAsUnread(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await client
      .api(`${basePath}/messages/${messageId}`)
      .patch({ isRead: false });
  } catch (error) {
    console.error("Error marking email as unread:", error);
    throw error;
  }
}

/**
 * Flag or unflag an email for follow-up.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param flagStatus - Flag status: 'flagged', 'complete', or 'notFlagged'
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when flag status is updated
 *
 * @example
 * // Flag for follow-up
 * await flagEmail(ctx, 'AAMkAGI2...', 'flagged', 'user@example.com');
 *
 * @example
 * // Mark as complete
 * await flagEmail(ctx, 'AAMkAGI2...', 'complete', 'user@example.com');
 *
 * @example
 * // Remove flag
 * await flagEmail(ctx, 'AAMkAGI2...', 'notFlagged', 'user@example.com');
 */
export async function flagEmail(
  ctx: GraphClientContext,
  messageId: string,
  flagStatus: "flagged" | "complete" | "notFlagged",
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await client
      .api(`${basePath}/messages/${messageId}`)
      .patch({ flag: { flagStatus } });
  } catch (error) {
    console.error("Error flagging email:", error);
    throw error;
  }
}

/**
 * Set categories (color-coded labels) on an email.
 *
 * Replaces all existing categories on the message with the provided list.
 * Categories must exist in the user's master categories list in Outlook.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param categories - Array of category names to apply (e.g., ["Signed Contract", "Needs Action"])
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when categories are updated
 *
 * @example
 * await setCategoryOnEmail(ctx, 'AAMkAGI2...', ['Signed Contract'], 'user@example.com');
 *
 * @example
 * // Remove all categories
 * await setCategoryOnEmail(ctx, 'AAMkAGI2...', [], 'user@example.com');
 */
export async function setCategoryOnEmail(
  ctx: GraphClientContext,
  messageId: string,
  categories: string[],
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await client.api(`${basePath}/messages/${messageId}`).patch({ categories });
  } catch (error) {
    console.error("Error setting email categories:", error);
    throw error;
  }
}

/**
 * Get the master categories list for a user's mailbox.
 *
 * Returns all available categories (color-coded labels) that can be applied
 * to messages in this mailbox.
 *
 * @param ctx - Graph client context
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to array of category objects with displayName and color
 *
 * @example
 * const categories = await getMasterCategories(ctx, 'user@example.com');
 * // [{ displayName: 'Signed Contract', color: 'preset9' }, ...]
 */
export async function getMasterCategories(
  ctx: GraphClientContext,
  userId?: string
): Promise<{ displayName: string; color: string }[]> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const response = await client
      .api(`${basePath}/outlook/masterCategories`)
      .get();

    if (!response?.value) {
      return [];
    }

    return response.value.map((cat: Record<string, unknown>) => ({
      color: (cat.color as string) ?? "none",
      displayName: cat.displayName as string,
    }));
  } catch (error) {
    console.error("Error fetching master categories:", error);
    throw error;
  }
}

/**
 * Get a message's read status and flag status.
 *
 * Useful for verification in tests or checking email state.
 *
 * @param ctx - Graph client context
 * @param messageId - The unique ID of the email message
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to object with isRead and flagStatus, or null if not found
 *
 * @example
 * const status = await getMessageStatus(ctx, 'AAMkAGI2...', 'user@example.com');
 * if (status) {
 *   console.log(`Read: ${status.isRead}, Flag: ${status.flagStatus}`);
 * }
 */
export async function getMessageStatus(
  ctx: GraphClientContext,
  messageId: string,
  userId?: string
): Promise<{ isRead: boolean; flagStatus: string } | null> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const msg = await client
      .api(`${basePath}/messages/${messageId}`)
      .select("isRead,flag")
      .get();

    return {
      flagStatus: (msg.flag?.flagStatus as string) ?? "notFlagged",
      isRead: msg.isRead as boolean,
    };
  } catch (error) {
    console.error("Error getting message status:", error);
    return null;
  }
}
