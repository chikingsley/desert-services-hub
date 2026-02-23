/**
 * List folders functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import type { MCPResponse } from "@outlook/auth/tools";
import { callGraphAPI } from "@outlook/utils/graph-api";

export interface MailFolder {
  childFolderCount?: number;
  children?: string[];
  displayName: string;
  id: string;
  isTopLevel?: boolean;
  parentFolder?: string;
  parentFolderId?: string;
  totalItemCount?: number;
  unreadItemCount?: number;
}

export interface ListFoldersArgs {
  includeChildren?: boolean;
  includeItemCounts?: boolean;
  mailbox?: string;
}

/**
 * List folders handler
 */
export async function handleListFolders(
  args: ListFoldersArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const includeItemCounts = args.includeItemCounts === true;
  const includeChildren = args.includeChildren === true;

  try {
    const accessToken = await ensureAuthenticated();
    const folders = await getAllFoldersHierarchy(
      accessToken,
      mailbox,
      includeItemCounts
    );

    if (includeChildren) {
      return {
        content: [
          {
            type: "text",
            text: formatFolderHierarchy(folders, includeItemCounts),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: formatFolderList(folders, includeItemCounts),
        },
      ],
    };
  } catch (error) {
    if ((error as Error).message === "Authentication required") {
      return {
        content: [
          {
            type: "text",
            text: "Authentication required. Please use the 'authenticate' tool first.",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Error listing folders: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Get all mail folders with hierarchy information
 */
async function getAllFoldersHierarchy(
  accessToken: string,
  mailbox: string,
  includeItemCounts: boolean
): Promise<MailFolder[]> {
  try {
    const selectFields = includeItemCounts
      ? "id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount"
      : "id,displayName,parentFolderId,childFolderCount";

    interface FolderListResponse {
      value: MailFolder[];
    }

    const response = await callGraphAPI<FolderListResponse>(
      accessToken,
      "GET",
      `users/${mailbox}/mailFolders`,
      null,
      {
        $top: 100,
        $select: selectFields,
      }
    );

    if (!response.value) {
      return [];
    }

    const foldersWithChildren = response.value.filter(
      (f) => (f.childFolderCount ?? 0) > 0
    );

    const childFolderPromises = foldersWithChildren.map(
      async (folder: MailFolder) => {
        try {
          const childResponse = await callGraphAPI<FolderListResponse>(
            accessToken,
            "GET",
            `users/${mailbox}/mailFolders/${folder.id}/childFolders`,
            null,
            { $select: selectFields }
          );

          const childFolders: MailFolder[] = childResponse.value || [];
          for (const child of childFolders) {
            child.parentFolder = folder.displayName;
          }

          return childFolders;
        } catch (error) {
          console.error(
            `Error getting child folders for "${folder.displayName}": ${(error as Error).message}`
          );
          return [];
        }
      }
    );

    const childFolders = await Promise.all(childFolderPromises);
    const allChildFolders = childFolders.flat();

    const topLevelFolders: MailFolder[] = response.value.map((folder) => ({
      ...folder,
      isTopLevel: true,
    }));

    return [...topLevelFolders, ...allChildFolders];
  } catch (error) {
    console.error(`Error getting all folders: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Format folders as a flat list
 */
function formatFolderList(
  folders: MailFolder[],
  includeItemCounts: boolean
): string {
  if (!folders || folders.length === 0) {
    return "No folders found.";
  }

  const wellKnownFolderNames = [
    "Inbox",
    "Drafts",
    "Sent Items",
    "Deleted Items",
    "Junk Email",
    "Archive",
  ];

  const sortedFolders = [...folders].sort((a, b) => {
    const aIsWellKnown = wellKnownFolderNames.includes(a.displayName);
    const bIsWellKnown = wellKnownFolderNames.includes(b.displayName);

    if (aIsWellKnown && !bIsWellKnown) {
      return -1;
    }
    if (!aIsWellKnown && bIsWellKnown) {
      return 1;
    }

    if (aIsWellKnown && bIsWellKnown) {
      return (
        wellKnownFolderNames.indexOf(a.displayName) -
        wellKnownFolderNames.indexOf(b.displayName)
      );
    }

    return a.displayName.localeCompare(b.displayName);
  });

  const folderLines = sortedFolders.map((folder) => {
    let folderInfo = folder.displayName;

    if (folder.parentFolder) {
      folderInfo += ` (in ${folder.parentFolder})`;
    }

    if (includeItemCounts) {
      const unreadCount = folder.unreadItemCount || 0;
      const totalCount = folder.totalItemCount || 0;
      folderInfo += ` - ${totalCount} items`;

      if (unreadCount > 0) {
        folderInfo += ` (${unreadCount} unread)`;
      }
    }

    return folderInfo;
  });

  return `Found ${folders.length} folders:\n\n${folderLines.join("\n")}`;
}

/**
 * Format folders as a hierarchical tree
 */
function formatFolderHierarchy(
  folders: MailFolder[],
  includeItemCounts: boolean
): string {
  if (!folders || folders.length === 0) {
    return "No folders found.";
  }

  const folderMap = new Map<string, MailFolder & { children: string[] }>();
  const rootFolders: string[] = [];

  for (const folder of folders) {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
    });

    if (folder.isTopLevel) {
      rootFolders.push(folder.id);
    }
  }

  for (const folder of folders) {
    if (!folder.isTopLevel && folder.parentFolderId) {
      const parent = folderMap.get(folder.parentFolderId);
      if (parent) {
        parent.children.push(folder.id);
      } else {
        rootFolders.push(folder.id);
      }
    }
  }

  function formatSubtree(folderId: string, level = 0): string {
    const folder = folderMap.get(folderId);
    if (!folder) {
      return "";
    }

    const indent = "  ".repeat(level);
    let line = `${indent}${folder.displayName}`;

    if (includeItemCounts) {
      const unreadCount = folder.unreadItemCount || 0;
      const totalCount = folder.totalItemCount || 0;
      line += ` - ${totalCount} items`;

      if (unreadCount > 0) {
        line += ` (${unreadCount} unread)`;
      }
    }

    const childLines = folder.children
      .map((childId) => formatSubtree(childId, level + 1))
      .filter((l) => l.length > 0)
      .join("\n");

    return childLines.length > 0 ? `${line}\n${childLines}` : line;
  }

  const formattedHierarchy = rootFolders
    .map((folderId) => formatSubtree(folderId))
    .join("\n");

  return `Folder Hierarchy:\n\n${formattedHierarchy}`;
}

export default handleListFolders;
