/**
 * Email categories functionality
 *
 * Provides tools for managing Outlook categories (color-coded labels) on emails.
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
 * Category from Microsoft Graph API
 */
interface OutlookCategory {
  color: string;
  displayName: string;
}

/**
 * Graph API response for master categories
 */
interface MasterCategoriesResponse {
  value?: Array<{
    displayName: string;
    color?: string;
  }>;
}

/**
 * Arguments for get master categories handler
 */
interface GetMasterCategoriesArgs {
  mailbox?: string;
  [key: string]: unknown;
}

/**
 * Arguments for set email categories handler
 */
interface SetEmailCategoriesArgs {
  categories?: string[];
  id?: string;
  mailbox?: string;
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
        items?: { type: string };
      }
    >;
    required: string[];
    additionalProperties?: boolean;
  };
  name: string;
}

/**
 * Get master categories handler
 *
 * Retrieves the list of available categories (color-coded labels) for the mailbox.
 * These are the categories that can be applied to emails.
 *
 * @param args - Tool arguments
 * @returns MCP response with list of categories
 */
export async function handleGetMasterCategories(
  args: GetMasterCategoriesArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  try {
    // Get access token
    const accessToken = await ensureAuthenticated();

    // Make API call to get master categories
    const endpoint = `users/${mailbox}/outlook/masterCategories`;

    const response = (await callGraphAPI(
      accessToken,
      "GET",
      endpoint,
      null
    )) as MasterCategoriesResponse;

    if (!response.value || response.value.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No categories found in your mailbox.",
          },
        ],
      };
    }

    // Format categories
    const categories: OutlookCategory[] = response.value.map((cat) => ({
      displayName: cat.displayName,
      color: cat.color ?? "none",
    }));

    const categoryList = categories
      .map((cat, index) => `${index + 1}. ${cat.displayName} (${cat.color})`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${categories.length} categories in your mailbox:\n\n${categoryList}`,
        },
      ],
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

    return {
      content: [
        {
          type: "text",
          text: `Error getting categories: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Set email categories handler
 *
 * Sets categories (color-coded labels) on an email. This replaces all existing
 * categories on the message with the provided list. Categories must exist in
 * the user's master categories list in Outlook.
 *
 * @param args - Tool arguments
 * @returns MCP response
 */
export async function handleSetEmailCategories(
  args: SetEmailCategoriesArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const emailId = args.id;
  const categories = args.categories ?? [];

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
          text: `Modifying emails is not allowed from this mailbox. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Get access token
    const accessToken = await ensureAuthenticated();

    // Make API call to update email categories
    // graph-api.ts handles path segment encoding — do NOT pre-encode emailId
    const endpoint = `users/${mailbox}/messages/${emailId}`;
    const updateData = {
      categories,
    };

    try {
      await callGraphAPI(accessToken, "PATCH", endpoint, updateData);

      const categoryText =
        categories.length > 0
          ? `categories: ${categories.join(", ")}`
          : "no categories (all removed)";

      return {
        content: [
          {
            type: "text",
            text: `Email categories updated successfully.\n\nApplied ${categoryText}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error setting email categories: ${errorMessage}`);

      // Improved error handling with more specific messages
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
      if (
        errorMessage.includes("InvalidArgument") ||
        errorMessage.includes("category")
      ) {
        return {
          content: [
            {
              type: "text",
              text: `One or more categories may not exist in your mailbox. Please use 'get-master-categories' to see available categories.\n\nError: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Failed to set email categories: ${errorMessage}`,
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
 * Categories tool definitions
 */
export const categoriesTools: ToolDefinition[] = [
  {
    name: "get-master-categories",
    description:
      "Gets the list of available categories (color-coded labels) for your mailbox. Use this to see what categories can be applied to emails.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
      },
      required: ["mailbox"],
      additionalProperties: false,
    },
    handler: handleGetMasterCategories,
  },
  {
    name: "set-email-categories",
    description:
      "Sets categories (color-coded labels) on a specific email. This replaces all existing categories on the email with the provided list. Categories must exist in your mailbox (use get-master-categories to see available options).",
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
          description: "ID of the email to set categories on",
        },
        categories: {
          type: "array",
          description:
            "Array of category names to apply (e.g., ['Signed Contract', 'Needs Action']). Pass an empty array to remove all categories.",
          items: { type: "string" },
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleSetEmailCategories as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];

export default categoriesTools;
