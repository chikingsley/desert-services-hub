/**
 * Archive and delete email functionality
 *
 * Provides tools for archiving and deleting emails via Microsoft Graph API.
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import {
  formatWritableMailboxes,
  isWritableMailbox,
} from "@outlook/config/mailbox-permissions";
import { callGraphAPI } from "@outlook/utils/graph-api";

/**
 * MCP response content item
 */
interface MCPContentItem {
  text: string;
  type: "text";
}

/**
 * MCP response structure
 */
interface MCPResponse {
  content: MCPContentItem[];
  isError?: boolean;
}

/**
 * Arguments for archive email handler
 */
interface ArchiveEmailArgs {
  id?: string;
  mailbox?: string;
}

/**
 * Arguments for delete email handler
 */
interface DeleteEmailArgs {
  id?: string;
  mailbox?: string;
  permanent?: boolean;
}

/**
 * Tool definition structure
 */
interface ToolDefinition {
  description: string;
  handler: (args: Record<string, unknown>) => Promise<MCPResponse>;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
    additionalProperties?: boolean;
  };
  name: string;
}

/**
 * Archive email handler
 *
 * Moves an email to the Archive folder using the Graph API move endpoint.
 *
 * @param args - Tool arguments
 * @returns MCP response
 */
export async function handleArchiveEmail(
  args: ArchiveEmailArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const emailId = args.id;

  if (!emailId) {
    return {
      content: [
        {
          type: "text",
          text: "Email ID is required.",
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
          text: `Archiving is not allowed from this mailbox. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const accessToken = await ensureAuthenticated();

    // graph-api.ts handles path segment encoding — do NOT pre-encode emailId
    const endpoint = `users/${mailbox}/messages/${emailId}/move`;
    const moveData = {
      destinationId: "archive",
    };

    try {
      await callGraphAPI(accessToken, "POST", endpoint, moveData);

      return {
        content: [
          {
            type: "text",
            text: "Email successfully moved to Archive.",
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("doesn't belong to the targeted mailbox")) {
        return {
          content: [
            {
              type: "text",
              text: "The email ID seems invalid or doesn't belong to your mailbox. Please try with a different email ID.",
            },
          ],
          isError: true,
        };
      }
      if (errorMessage.includes("UNAUTHORIZED")) {
        return {
          content: [
            {
              type: "text",
              text: "Authentication failed. Please re-authenticate and try again.",
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Failed to archive email: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === "Authentication required") {
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
          text: `Error accessing email: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Delete email handler
 *
 * Moves an email to Deleted Items (soft delete) or permanently deletes it.
 * By default, performs a soft delete which moves the email to the Deleted Items folder.
 * If permanent is true, the email is permanently deleted and cannot be recovered.
 *
 * @param args - Tool arguments
 * @returns MCP response
 */
export async function handleDeleteEmail(
  args: DeleteEmailArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const emailId = args.id;
  const permanent = args.permanent ?? false;

  if (!emailId) {
    return {
      content: [
        {
          type: "text",
          text: "Email ID is required.",
        },
      ],
      isError: true,
    };
  }

  if (!isWritableMailbox(mailbox)) {
    return {
      content: [
        {
          type: "text",
          text: `Deleting is not allowed from this mailbox. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const accessToken = await ensureAuthenticated();

    if (permanent) {
      // Use the permanentDelete action (GA in v1.0 since April 2025).
      // Places the message in the Purges folder — not recoverable by the user.
      // https://learn.microsoft.com/en-us/graph/api/message-permanentdelete
      await callGraphAPI(
        accessToken,
        "POST",
        `users/${mailbox}/messages/${emailId}/permanentDelete`
      );

      return {
        content: [{ type: "text", text: "Email permanently deleted." }],
      };
    }

    // Soft delete — move to Deleted Items folder
    await callGraphAPI(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${emailId}/move`,
      { destinationId: "deleteditems" }
    );

    return {
      content: [{ type: "text", text: "Email moved to Deleted Items." }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === "Authentication required") {
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
    if (errorMessage.includes("doesn't belong to the targeted mailbox")) {
      return {
        content: [
          {
            type: "text",
            text: "The email ID seems invalid or doesn't belong to your mailbox. Please try with a different email ID.",
          },
        ],
        isError: true,
      };
    }
    if (errorMessage.includes("UNAUTHORIZED")) {
      return {
        content: [
          {
            type: "text",
            text: "Authentication failed. Please re-authenticate and try again.",
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: `Failed to delete email: ${errorMessage}` },
      ],
      isError: true,
    };
  }
}

/**
 * Archive and delete tool definitions
 */
export const archiveDeleteTools: ToolDefinition[] = [
  {
    name: "archive-email",
    description: "Moves an email to the Archive folder.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to archive",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleArchiveEmail as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "delete-email",
    description:
      "Deletes an email. By default, moves to Deleted Items (soft delete). Set permanent=true to permanently delete the email (cannot be recovered).",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to delete",
        },
        permanent: {
          type: "boolean",
          description:
            "If true, permanently deletes the email. If false (default), moves to Deleted Items.",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleDeleteEmail as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];

export default archiveDeleteTools;
