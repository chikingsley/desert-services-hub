/**
 * Email folder utilities
 */
import { callGraphAPI } from "@outlook/utils/graph-api";

/**
 * Response type for Graph API folder requests
 */
interface FolderResponse {
  value?: MailFolder[];
}

/**
 * Mail folder from Microsoft Graph API
 */
interface MailFolder {
  childFolderCount?: number;
  displayName: string;
  id: string;
  parentFolderId?: string;
  totalItemCount?: number;
  unreadItemCount?: number;
}

/**
 * Well-known folder names and their endpoints, scoped to a mailbox
 */
export function getWellKnownFolders(mailbox: string): Record<string, string> {
  return {
    inbox: `users/${mailbox}/mailFolders/inbox/messages`,
    drafts: `users/${mailbox}/mailFolders/drafts/messages`,
    sent: `users/${mailbox}/mailFolders/sentItems/messages`,
    deleted: `users/${mailbox}/mailFolders/deletedItems/messages`,
    junk: `users/${mailbox}/mailFolders/junkemail/messages`,
    archive: `users/${mailbox}/mailFolders/archive/messages`,
  };
}

/**
 * Resolve a folder name to its endpoint path
 * @param accessToken - Access token
 * @param folderName - Folder name to resolve
 * @param mailbox - Mailbox email address
 * @returns Resolved endpoint path
 */
export async function resolveFolderPath(
  accessToken: string,
  folderName: string,
  mailbox: string
): Promise<string> {
  const wellKnownFolders = getWellKnownFolders(mailbox);

  // Default to inbox if no folder specified
  if (!folderName) {
    return wellKnownFolders.inbox;
  }

  // Check if it's a well-known folder (case-insensitive)
  const lowerFolderName = folderName.toLowerCase();
  if (wellKnownFolders[lowerFolderName]) {
    console.error(`Using well-known folder path for "${folderName}"`);
    return wellKnownFolders[lowerFolderName];
  }

  try {
    // Try to find the folder by name
    const folderId = await getFolderIdByName(accessToken, folderName, mailbox);
    if (folderId) {
      const path = `users/${mailbox}/mailFolders/${folderId}/messages`;
      console.error(`Resolved folder "${folderName}" to path: ${path}`);
      return path;
    }

    // If not found, fall back to inbox
    console.error(
      `Couldn't find folder "${folderName}", falling back to inbox`
    );
    return wellKnownFolders.inbox;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error resolving folder "${folderName}": ${errorMessage}`);
    return wellKnownFolders.inbox;
  }
}

/**
 * Get the ID of a mail folder by its name
 * @param accessToken - Access token
 * @param folderName - Name of the folder to find
 * @param mailbox - Mailbox email address
 * @returns Folder ID or null if not found
 */
export async function getFolderIdByName(
  accessToken: string,
  folderName: string,
  mailbox: string
): Promise<string | null> {
  try {
    // First try with exact match filter
    console.error(`Looking for folder with name "${folderName}"`);
    const response = (await callGraphAPI(
      accessToken,
      "GET",
      `users/${mailbox}/mailFolders`,
      null,
      { $filter: `displayName eq '${folderName}'` }
    )) as FolderResponse;

    if (response.value && response.value.length > 0) {
      console.error(
        `Found folder "${folderName}" with ID: ${response.value[0].id}`
      );
      return response.value[0].id;
    }

    // If exact match fails, try to get all folders and do a case-insensitive comparison
    console.error(
      `No exact match found for "${folderName}", trying case-insensitive search`
    );
    const allFoldersResponse = (await callGraphAPI(
      accessToken,
      "GET",
      `users/${mailbox}/mailFolders`,
      null,
      { $top: 100 }
    )) as FolderResponse;

    if (allFoldersResponse.value) {
      const lowerFolderName = folderName.toLowerCase();
      const matchingFolder = allFoldersResponse.value.find(
        (folder) => folder.displayName.toLowerCase() === lowerFolderName
      );

      if (matchingFolder) {
        console.error(
          `Found case-insensitive match for "${folderName}" with ID: ${matchingFolder.id}`
        );
        return matchingFolder.id;
      }
    }

    console.error(`No folder found matching "${folderName}"`);
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error finding folder "${folderName}": ${errorMessage}`);
    return null;
  }
}

/**
 * Get all mail folders
 * @param accessToken - Access token
 * @param mailbox - Mailbox email address
 * @returns Array of folder objects
 */
export async function getAllFolders(
  accessToken: string,
  mailbox: string
): Promise<MailFolder[]> {
  try {
    // Get top-level folders
    const response = (await callGraphAPI(
      accessToken,
      "GET",
      `users/${mailbox}/mailFolders`,
      null,
      {
        $top: 100,
        $select:
          "id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount",
      }
    )) as FolderResponse;

    if (!response.value) {
      return [];
    }

    // Get child folders for folders with children
    const foldersWithChildren = response.value.filter(
      (f) => (f.childFolderCount ?? 0) > 0
    );

    const childFolderPromises = foldersWithChildren.map(async (folder) => {
      try {
        const childResponse = (await callGraphAPI(
          accessToken,
          "GET",
          `users/${mailbox}/mailFolders/${folder.id}/childFolders`,
          null,
          {
            $select:
              "id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount",
          }
        )) as FolderResponse;

        return childResponse.value ?? [];
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Error getting child folders for "${folder.displayName}": ${errorMessage}`
        );
        return [];
      }
    });

    const childFolders = await Promise.all(childFolderPromises);

    // Combine top-level folders and all child folders
    return [...response.value, ...childFolders.flat()];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error getting all folders: ${errorMessage}`);
    return [];
  }
}
