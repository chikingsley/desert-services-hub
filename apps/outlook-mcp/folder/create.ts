/**
 * Create folder functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import type { MCPResponse } from "@outlook/auth/tools";
import {
  formatWritableMailboxes,
  isWritableMailbox,
} from "@outlook/config/mailbox-permissions";
import { getFolderIdByName } from "@outlook/email/folder-utils";
import { callGraphAPI } from "@outlook/utils/graph-api";

export interface CreateFolderArgs {
  mailbox?: string;
  name: string;
  parentFolder?: string;
}

export interface CreateFolderResult {
  folderId?: string;
  message: string;
  success: boolean;
}

/**
 * Create folder handler
 */
export async function handleCreateFolder(
  args: CreateFolderArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const folderName = args.name;
  const parentFolder = args.parentFolder || "";

  if (!folderName) {
    return {
      content: [
        {
          type: "text",
          text: "Folder name is required.",
        },
      ],
      isError: true,
    };
  }

  // Check if the mailbox has permission to modify
  if (!isWritableMailbox(mailbox)) {
    return {
      content: [
        {
          type: "text",
          text: `Creating folders is not allowed from this mailbox. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const accessToken = await ensureAuthenticated();

    const result = await createMailFolder(
      accessToken,
      folderName,
      parentFolder,
      mailbox
    );

    return {
      content: [
        {
          type: "text",
          text: result.message,
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
          text: `Error creating folder: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Create a new mail folder
 */
async function createMailFolder(
  accessToken: string,
  folderName: string,
  parentFolderName: string,
  mailbox: string
): Promise<CreateFolderResult> {
  try {
    const existingFolder = await getFolderIdByName(
      accessToken,
      folderName,
      mailbox
    );
    if (existingFolder) {
      return {
        success: false,
        message: `A folder named "${folderName}" already exists.`,
      };
    }

    let endpoint = `users/${mailbox}/mailFolders`;
    if (parentFolderName) {
      const parentId = await getFolderIdByName(
        accessToken,
        parentFolderName,
        mailbox
      );
      if (!parentId) {
        return {
          success: false,
          message: `Parent folder "${parentFolderName}" not found. Please specify a valid parent folder or leave it blank to create at the root level.`,
        };
      }

      endpoint = `users/${mailbox}/mailFolders/${parentId}/childFolders`;
    }

    const folderData = {
      displayName: folderName,
    };

    const response = await callGraphAPI<{ id: string; displayName: string }>(
      accessToken,
      "POST",
      endpoint,
      folderData
    );

    if (response?.id) {
      const locationInfo = parentFolderName
        ? `inside "${parentFolderName}"`
        : "at the root level";

      return {
        success: true,
        message: `Successfully created folder "${folderName}" ${locationInfo}.`,
        folderId: response.id,
      };
    }
    return {
      success: false,
      message: "Failed to create folder. The server didn't return a folder ID.",
    };
  } catch (error) {
    console.error(
      `Error creating folder "${folderName}": ${(error as Error).message}`
    );
    throw error;
  }
}

export default handleCreateFolder;
