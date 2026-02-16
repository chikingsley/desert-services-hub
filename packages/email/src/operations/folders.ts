/**
 * Mail folder operations.
 *
 * List, get, create, delete, rename, move, and recursively
 * enumerate Outlook mail folders via Microsoft Graph.
 */

import type { GraphClientContext, MailFolderWithChildren } from "@email/types";

/**
 * List mail folders for a user.
 *
 * @param ctx - Graph client context
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to array of folder objects with id, displayName, and parentFolderId
 *
 * @example
 * const folders = await listFolders(ctx, 'user@example.com');
 * const inbox = folders.find(f => f.displayName === 'Inbox');
 */
export async function listFolders(
  ctx: GraphClientContext,
  userId?: string
): Promise<
  { id: string; displayName: string; parentFolderId: string | null }[]
> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const response = await client.api(`${basePath}/mailFolders`).top(100).get();

    if (!response?.value) {
      return [];
    }

    return response.value.map((folder: Record<string, unknown>) => ({
      displayName: folder.displayName as string,
      id: folder.id as string,
      parentFolderId: (folder.parentFolderId as string) ?? null,
    }));
  } catch (error) {
    console.error("Error listing folders:", error);
    throw error;
  }
}

/**
 * Get a single mail folder by ID.
 *
 * Useful for resolving parentFolderId -> displayName without listing the whole folder tree.
 *
 * @param ctx - Graph client context
 * @param folderId - The ID of the folder to retrieve
 * @param userId - Email address of the mailbox (required for app auth)
 */
export async function getFolderById(
  ctx: GraphClientContext,
  folderId: string,
  userId?: string
): Promise<{
  id: string;
  displayName: string;
  parentFolderId: string | null;
} | null> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await ctx.rateLimiter.throttle();
    const folder = await client
      .api(`${basePath}/mailFolders/${folderId}`)
      .select("id,displayName,parentFolderId")
      .get();

    if (!folder?.id) {
      return null;
    }

    return {
      displayName: folder.displayName as string,
      id: folder.id as string,
      parentFolderId: (folder.parentFolderId as string) ?? null,
    };
  } catch (error) {
    console.error("Error fetching folder:", error);
    return null;
  }
}

/**
 * Recursively list all mail folders including subfolders.
 *
 * @param ctx - Graph client context
 * @param userId - Email address of the mailbox (required for app auth)
 * @param maxDepth - Maximum depth to recurse (default: 10, to prevent infinite loops)
 * @returns Promise resolving to array of folder objects with nested children
 *
 * @example
 * const folders = await listFoldersRecursive(ctx, 'user@example.com');
 * // Returns: [{ id, displayName, parentFolderId, children: [...] }, ...]
 */
export async function listFoldersRecursive(
  ctx: GraphClientContext,
  userId?: string,
  maxDepth = 10
): Promise<MailFolderWithChildren[]> {
  const graphClient = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  const fetchChildFolders = async (
    parentId: string | null,
    depth: number
  ): Promise<MailFolderWithChildren[]> => {
    if (depth > maxDepth) {
      return [];
    }

    const apiPath = parentId
      ? `${basePath}/mailFolders/${parentId}/childFolders`
      : `${basePath}/mailFolders`;

    try {
      const response = await graphClient.api(apiPath).top(100).get();

      if (!response?.value) {
        return [];
      }

      const folders: MailFolderWithChildren[] = [];

      for (const folder of response.value) {
        const children = await fetchChildFolders(
          folder.id as string,
          depth + 1
        );
        folders.push({
          children: children.length > 0 ? children : undefined,
          displayName: folder.displayName as string,
          id: folder.id as string,
          parentFolderId: (folder.parentFolderId as string) ?? null,
        });
      }

      return folders;
    } catch {
      // If we can't fetch children (e.g., folder doesn't support it), return empty
      return [];
    }
  };

  return await fetchChildFolders(null, 0);
}

/**
 * Create a new mail folder.
 *
 * @param ctx - Graph client context
 * @param displayName - The name of the new folder
 * @param userId - Email address of the mailbox (required for app auth)
 * @param parentFolderId - Optional parent folder ID (creates at root if omitted)
 * @returns Promise resolving to object with folder id and displayName
 *
 * @example
 * // Create at root level
 * const folder = await createFolder(ctx, 'Projects', 'user@example.com');
 *
 * @example
 * // Create as subfolder
 * const parent = await createFolder(ctx, 'Clients', 'user@example.com');
 * const child = await createFolder(ctx, 'Acme Corp', 'user@example.com', parent.id);
 */
export async function createFolder(
  ctx: GraphClientContext,
  displayName: string,
  userId?: string,
  parentFolderId?: string
): Promise<{ id: string; displayName: string }> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);
  const apiPath = parentFolderId
    ? `${basePath}/mailFolders/${parentFolderId}/childFolders`
    : `${basePath}/mailFolders`;

  try {
    await ctx.rateLimiter.throttle();
    const response = await client.api(apiPath).post({ displayName });
    return {
      displayName: response.displayName as string,
      id: response.id as string,
    };
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
}

/**
 * Delete a mail folder.
 *
 * Note: Cannot delete well-known folders (Inbox, Sent Items, etc.).
 *
 * @param ctx - Graph client context
 * @param folderId - The ID of the folder to delete
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when folder is deleted
 *
 * @example
 * await deleteFolder(ctx, 'AAMkAGI2...', 'user@example.com');
 */
export async function deleteFolder(
  ctx: GraphClientContext,
  folderId: string,
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    await client.api(`${basePath}/mailFolders/${folderId}`).delete();
  } catch (error) {
    console.error("Error deleting folder:", error);
    throw error;
  }
}

/**
 * Rename a mail folder.
 *
 * @param ctx - Graph client context
 * @param folderId - The unique ID of the folder to rename
 * @param newName - The new display name for the folder
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to the updated folder object
 *
 * @example
 * const updated = await renameFolder(ctx, 'AAMkAGI2...', 'New Name', 'user@example.com');
 */
export async function renameFolder(
  ctx: GraphClientContext,
  folderId: string,
  newName: string,
  userId?: string
): Promise<{ id: string; displayName: string }> {
  const graphClient = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const response = await graphClient
      .api(`${basePath}/mailFolders/${folderId}`)
      .patch({ displayName: newName });

    return {
      displayName: response.displayName as string,
      id: response.id as string,
    };
  } catch (error) {
    console.error("Error renaming folder:", error);
    throw error;
  }
}

/**
 * Move a mail folder to a new parent folder.
 *
 * @param ctx - Graph client context
 * @param folderId - The unique ID of the folder to move
 * @param destinationId - The ID of the destination parent folder
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to the moved folder object
 *
 * @example
 * // Move folder to be a subfolder of another folder
 * const moved = await moveFolder(ctx, 'AAMkAGI2...', 'AAMkBBB...', 'user@example.com');
 */
export async function moveFolder(
  ctx: GraphClientContext,
  folderId: string,
  destinationId: string,
  userId?: string
): Promise<{ id: string; displayName: string; parentFolderId: string }> {
  const graphClient = ctx.getClient();
  const basePath = ctx.getBasePath(userId);

  try {
    const response = await graphClient
      .api(`${basePath}/mailFolders/${folderId}/move`)
      .post({ destinationId });

    return {
      displayName: response.displayName as string,
      id: response.id as string,
      parentFolderId: response.parentFolderId as string,
    };
  } catch (error) {
    console.error("Error moving folder:", error);
    throw error;
  }
}
