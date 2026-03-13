/**
 * Email module for Outlook MCP server
 */

import { archiveDeleteTools } from "@outlook/email/archive-delete";
import { attachmentTools } from "@outlook/email/attachments";
import { categoriesTools } from "@outlook/email/categories";
import { draftTools } from "@outlook/email/drafts";
import { handleListEmails } from "@outlook/email/list";
import { handleMarkAsRead } from "@outlook/email/mark-as-read";
import { handleReadEmail } from "@outlook/email/read";
import { replyForwardTools } from "@outlook/email/reply-forward";
import { handleSearchEmails } from "@outlook/email/search";
import { handleSendEmail } from "@outlook/email/send";
import { threadTools } from "@outlook/email/threads";

interface MCPResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

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
        enum?: string[];
        items?: { type: string };
      }
    >;
    required: string[];
    additionalProperties?: boolean;
  };
  name: string;
}

// Email tool definitions
export const emailTools: ToolDefinition[] = [
  {
    name: "list-emails",
    description: "Lists recent emails from your inbox",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        folder: {
          type: "string",
          description:
            "Email folder to list (e.g., 'inbox', 'sent', 'drafts', default: 'inbox')",
        },
        count: {
          type: "number",
          description: "Number of emails to retrieve (default: 10, max: 50)",
        },
      },
      required: ["mailbox"],
      additionalProperties: false,
    },
    handler: handleListEmails as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "search-emails",
    description: "Search for emails using various criteria",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        query: {
          type: "string",
          description: "Search query text to find in emails",
        },
        folder: {
          type: "string",
          description: "Email folder to search in (default: 'inbox')",
        },
        from: {
          type: "string",
          description: "Filter by sender email address or name",
        },
        to: {
          type: "string",
          description: "Filter by recipient email address or name",
        },
        subject: {
          type: "string",
          description: "Filter by email subject",
        },
        hasAttachments: {
          type: "boolean",
          description: "Filter to only emails with attachments",
        },
        unreadOnly: {
          type: "boolean",
          description: "Filter to only unread emails",
        },
        count: {
          type: "number",
          description: "Number of results to return (default: 10, max: 50)",
        },
      },
      required: ["mailbox"],
      additionalProperties: false,
    },
    handler: handleSearchEmails as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "read-email",
    description:
      "Reads the content of a specific email. Returns HTML by default to preserve links, tables, and formatting (important for DocuSign, newsletters, etc.). Use format='text' for a plain-text version.",
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
          description: "ID of the email to read",
        },
        format: {
          type: "string",
          description:
            "Body format: 'html' preserves links and formatting (default), 'text' returns plain text",
          enum: ["html", "text"],
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleReadEmail as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "send-email",
    description: "Composes and sends a new email",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to send from (e.g., 'chi@desertservices.net')",
        },
        to: {
          type: "string",
          description: "Comma-separated list of recipient email addresses",
        },
        cc: {
          type: "string",
          description: "Comma-separated list of CC recipient email addresses",
        },
        bcc: {
          type: "string",
          description: "Comma-separated list of BCC recipient email addresses",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body content (can be plain text or HTML)",
        },
        importance: {
          type: "string",
          description: "Email importance (normal, high, low)",
          enum: ["normal", "high", "low"],
        },
        saveToSentItems: {
          type: "boolean",
          description: "Whether to save the email to sent items",
        },
      },
      required: ["mailbox", "to", "subject", "body"],
      additionalProperties: false,
    },
    handler: handleSendEmail as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "mark-as-read",
    description: "Marks an email as read or unread",
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
          description: "ID of the email to mark as read/unread",
        },
        isRead: {
          type: "boolean",
          description:
            "Whether to mark as read (true) or unread (false). Default: true",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleMarkAsRead as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  ...categoriesTools,
  ...archiveDeleteTools,
  ...draftTools,
  ...replyForwardTools,
  ...attachmentTools,
  ...threadTools,
];
