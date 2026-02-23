/**
 * Email rules management module for Outlook MCP server
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import type { MCPResponse, ToolDefinition } from "@outlook/auth/tools";
import {
  formatWritableMailboxes,
  isWritableMailbox,
} from "@outlook/config/mailbox-permissions";
import handleCreateRule from "@outlook/rules/create";
import { getInboxRules, handleListRules } from "@outlook/rules/list";
import { callGraphAPI } from "@outlook/utils/graph-api";

export interface EditRuleSequenceArgs {
  mailbox?: string;
  ruleName: string;
  sequence: number;
}

/**
 * Edit rule sequence handler
 */
export async function handleEditRuleSequence(
  args: EditRuleSequenceArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const { ruleName, sequence } = args;

  if (!ruleName) {
    return {
      content: [
        {
          type: "text",
          text: "Rule name is required. Please specify the exact name of an existing rule.",
        },
      ],
      isError: true,
    };
  }

  if (!sequence || Number.isNaN(sequence) || sequence < 1) {
    return {
      content: [
        {
          type: "text",
          text: "A positive sequence number is required. Lower numbers run first (higher priority).",
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
          text: `Editing rules is not allowed from this mailbox. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const accessToken = await ensureAuthenticated();

    const rules = await getInboxRules(accessToken, mailbox);

    const rule = rules.find((r) => r.displayName === ruleName);
    if (!rule) {
      return {
        content: [
          {
            type: "text",
            text: `Rule with name "${ruleName}" not found.`,
          },
        ],
        isError: true,
      };
    }

    await callGraphAPI(
      accessToken,
      "PATCH",
      `users/${mailbox}/mailFolders/inbox/messageRules/${rule.id}`,
      {
        sequence,
      }
    );

    return {
      content: [
        {
          type: "text",
          text: `Successfully updated the sequence of rule "${ruleName}" to ${sequence}.`,
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
          text: `Error updating rule sequence: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

export const rulesTools: ToolDefinition[] = [
  {
    name: "list-rules",
    description: "Lists inbox rules in your Outlook account",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        includeDetails: {
          type: "boolean",
          description: "Include detailed rule conditions and actions",
        },
      },
      required: ["mailbox"],
      additionalProperties: false,
    },
    handler: handleListRules as unknown as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "create-rule",
    description: "Creates a new inbox rule",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        name: {
          type: "string",
          description: "Name of the rule to create",
        },
        fromAddresses: {
          type: "string",
          description:
            "Comma-separated list of sender email addresses for the rule",
        },
        containsSubject: {
          type: "string",
          description: "Subject text the email must contain",
        },
        hasAttachments: {
          type: "boolean",
          description: "Whether the rule applies to emails with attachments",
        },
        moveToFolder: {
          type: "string",
          description: "Name of the folder to move matching emails to",
        },
        markAsRead: {
          type: "boolean",
          description: "Whether to mark matching emails as read",
        },
        isEnabled: {
          type: "boolean",
          description:
            "Whether the rule should be enabled after creation (default: true)",
        },
        sequence: {
          type: "number",
          description:
            "Order in which the rule is executed (lower numbers run first, default: 100)",
        },
      },
      required: ["mailbox", "name"],
      additionalProperties: false,
    },
    handler: handleCreateRule as unknown as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "edit-rule-sequence",
    description: "Changes the execution order of an existing inbox rule",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        ruleName: {
          type: "string",
          description: "Name of the rule to modify",
        },
        sequence: {
          type: "number",
          description:
            "New sequence value for the rule (lower numbers run first)",
        },
      },
      required: ["mailbox", "ruleName", "sequence"],
      additionalProperties: false,
    },
    handler: handleEditRuleSequence as unknown as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];
