#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Desert Email MCP Server
 *
 * A Model Context Protocol (MCP) server that exposes Microsoft Graph email operations
 * as tools for Claude Code. This enables AI-assisted email search, reading, sending,
 * and management across an organization's Microsoft 365 mailboxes.
 *
 * ## Authentication Strategy
 *
 * Uses dual authentication for security:
 * - **App auth (client credentials)**: Used for read-only operations like searching
 *   and fetching emails. Provides org-wide access without user interaction.
 * - **User auth (device code flow)**: Used for write operations like sending emails.
 *   Requires initial user consent but tokens are cached for subsequent use.
 *
 * ## Available Tool Categories
 *
 * - **Search tools**: `search_all_mailboxes`, `search_mailboxes`, `search_user_mailbox`,
 *   `search_emails`, `filter_emails`
 * - **Read tools**: `get_email`, `get_email_thread`, `get_attachments`, `download_attachment`
 * - **Send tools**: `send_email`, `send_test_email`, `confirm_send_email`, `reply_to_email`, `send_sandstorm_sign_order`, `send_morning_status`, `send_evening_status`
 * - **Management tools**: `archive_email`, `move_email`, `delete_email`, `mark_read`,
 *   `mark_unread`, `flag_email`
 * - **Draft/Folder tools**: `create_draft`, `send_draft`, `create_folder`, `delete_folder`,
 *   `forward_email`, `get_message_status`, `list_folders`
 * - **M365 Group tools**: `list_groups`, `get_group_conversations`, `get_group_conversation`,
 *   `search_group_conversations`
 *
 * @example
 * // Start the server (typically via Claude Code's MCP configuration)
 * bun services/email/mcp-server.ts
 *
 * @module services/email/mcp-server
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphEmailClient } from "./client";
import {
  getLogoAttachment,
  getTemplate,
  wrapWithSignature,
} from "./email-templates/index";
import { GraphGroupsClient } from "./groups";
import {
  formatEmailList,
  formatSearchResults,
  toEmailResult,
  toMailboxResults,
} from "./index";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Email address used for the test-before-send workflow.
 * When using `send_test_email`, the email is first sent to this address
 * for review before confirming delivery to the actual recipients.
 */
const testEmail = "chi@desertservices.net";

/**
 * Azure AD configuration for Microsoft Graph API authentication.
 * Loaded from environment variables:
 * - `AZURE_TENANT_ID`: The Azure AD tenant ID
 * - `AZURE_CLIENT_ID`: The application (client) ID
 * - `AZURE_CLIENT_SECRET`: The client secret for app-only auth
 */
const emailConfig = {
  azureTenantId: process.env.AZURE_TENANT_ID || "",
  azureClientId: process.env.AZURE_CLIENT_ID || "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
};

// ============================================================================
// Regex Patterns (module-level for performance)
// ============================================================================

const RE_FACILITY_ID_IN_DETAILS = /F\d{5,6}/;
const RE_FACILITY_ID_FORMAT = /^F\d{5,6}$/;

// ============================================================================
// Email Clients (Dual Auth - lazy initialized)
// ============================================================================

/** Singleton instance for app-auth email client (read operations) */
let appClient: GraphEmailClient | null = null;

/**
 * Gets or creates the app-authenticated email client for read operations.
 *
 * Uses client credentials flow (app-only auth) which provides org-wide
 * read access to all mailboxes without user interaction. This client is
 * used for search, read, and management operations.
 *
 * @returns The initialized GraphEmailClient with app authentication
 *
 * @example
 * const client = getAppClient();
 * const emails = await client.searchEmails({ query: 'invoice', userId: 'user@company.com' });
 */
function getAppClient(): GraphEmailClient {
  if (appClient) {
    return appClient;
  }
  appClient = new GraphEmailClient(emailConfig);
  appClient.initAppAuth();
  return appClient;
}

/** Singleton instance for user-auth email client (write operations) */
let userClient: GraphEmailClient | null = null;

/**
 * Gets or creates the user-authenticated email client for write operations.
 *
 * Uses device code flow which requires initial user consent. Tokens are
 * cached in `data/.token-cache.json` for subsequent use. This client is
 * used for sending emails, replying, and forwarding.
 *
 * @returns Promise resolving to the initialized GraphEmailClient with user authentication
 *
 * @example
 * const client = await getUserClient();
 * await client.sendEmail({ to: [{ email: 'recipient@example.com' }], subject: 'Hello', body: 'Hi!' });
 */
async function getUserClient(): Promise<GraphEmailClient> {
  if (userClient) {
    return userClient;
  }
  userClient = new GraphEmailClient(emailConfig);
  await userClient.initUserAuth();
  return userClient;
}

/** Singleton instance for M365 groups client */
let groupsClient: GraphGroupsClient | null = null;

/**
 * Gets or creates the M365 groups client for group conversation operations.
 *
 * Provides access to Microsoft 365 group conversations, which are used for
 * shared mailboxes like distribution lists (e.g., internalcontracts@company.com).
 *
 * @returns The initialized GraphGroupsClient
 *
 * @example
 * const client = getGroupsClient();
 * const groups = await client.listGroups();
 * const conversations = await client.getGroupConversations(groups[0].id);
 */
function getGroupsClient(): GraphGroupsClient {
  if (groupsClient) {
    return groupsClient;
  }
  groupsClient = new GraphGroupsClient(
    emailConfig.azureTenantId,
    emailConfig.azureClientId,
    emailConfig.azureClientSecret
  );
  return groupsClient;
}

// ============================================================================
// Pending Test Emails Store
// ============================================================================

/**
 * Represents an email pending confirmation after test send.
 * Stores all the information needed to send the final email
 * after the user reviews the test version.
 */
/** Attachment data for pending emails */
interface PendingAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

interface PendingEmail {
  /** Primary recipients */
  to: Array<{ email: string; name?: string }>;
  /** Carbon copy recipients */
  cc?: Array<{ email: string; name?: string }>;
  /** Email subject line */
  subject: string;
  /** Email body content */
  body: string;
  /** Body format - html or plain text */
  bodyType?: "html" | "text";
  /** File attachments */
  attachments?: PendingAttachment[];
  /** When this pending email expires and is auto-deleted */
  expiresAt: Date;
}

/**
 * In-memory store for pending test emails awaiting confirmation.
 * Maps confirmation IDs to their email details. Entries expire after 30 minutes.
 */
const pendingEmails = new Map<string, PendingEmail>();

/**
 * Generates a unique confirmation ID for the test-send workflow.
 *
 * Format: `confirm_{timestamp}_{random}` where random is a 6-character
 * base36 string for uniqueness.
 *
 * @returns A unique confirmation ID string
 *
 * @example
 * const id = generateConfirmationId();
 * // Returns: "confirm_1704067200000_a1b2c3"
 */
function generateConfirmationId(): string {
  return `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Removes expired pending emails from the store.
 *
 * Called before adding new pending emails to prevent memory buildup.
 * Emails expire 30 minutes after being created.
 */
function cleanupExpiredPending(): void {
  const now = new Date();
  for (const [id, pending] of pendingEmails.entries()) {
    if (pending.expiresAt < now) {
      pendingEmails.delete(id);
    }
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

/**
 * MCP server instance configured with email tools.
 *
 * Server identity: "desert-email" v1.0.0
 * Capabilities: tools (exposes email operations to Claude Code)
 */
const server = new Server(
  { name: "desert-email", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * MCP tool definitions exposed to Claude Code.
 *
 * Each tool has:
 * - `name`: The tool identifier used in MCP requests
 * - `description`: Human-readable description shown to the AI
 * - `inputSchema`: JSON Schema defining the tool's parameters
 *
 * Tools are organized into categories:
 * - Search tools (search_all_mailboxes, search_mailboxes, etc.)
 * - Read tools (get_email, get_email_thread, etc.)
 * - Send tools (send_email, send_test_email, etc.)
 * - Management tools (archive_email, move_email, etc.)
 * - Draft/Folder tools (create_draft, create_folder, etc.)
 * - M365 Group tools (list_groups, get_group_conversations, etc.)
 */
const tools = [
  {
    name: "search_all_mailboxes",
    description:
      "Search ALL mailboxes in the organization. Slow - prefer search_mailboxes with specific addresses. Domain: @desertservices.net",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (searches subject and body)",
        },
        limit: {
          type: "number",
          description: "Max results per mailbox (default: 5)",
        },
        since: {
          type: "string",
          description: "ISO date string - only emails received after this date",
        },
        until: {
          type: "string",
          description:
            "ISO date string - only emails received before this date",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_mailboxes",
    description: `Search specific mailboxes in parallel.

VALID MAILBOXES (use these exact addresses):
- Estimating: jared@desertservices.net, jeff@desertservices.net, denise@desertservices.net, estimating@desertservices.net
- Contracts: contracts@desertservices.net
- Other: chi@desertservices.net, lacie@desertservices.net, jayson@desertservices.net

Domain is @desertservices.net (NOT .us, NOT .com)`,
    inputSchema: {
      type: "object" as const,
      properties: {
        userIds: {
          type: "array",
          items: { type: "string" },
          description: "List of email addresses to search",
        },
        query: { type: "string", description: "Search query" },
        limit: {
          type: "number",
          description: "Max results per mailbox (default: 10)",
        },
        since: {
          type: "string",
          description: "ISO date string - only emails received after this date",
        },
        until: {
          type: "string",
          description:
            "ISO date string - only emails received before this date",
        },
      },
      required: ["userIds", "query"],
    },
  },
  {
    name: "search_user_mailbox",
    description:
      "Search a single mailbox. Valid addresses: jared@, jeff@, denise@, estimating@, contracts@, chi@, lacie@, jayson@ (all @desertservices.net)",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "Email address of the mailbox to search",
        },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default: 50)" },
        since: {
          type: "string",
          description: "ISO date string - only emails received after this date",
        },
        until: {
          type: "string",
          description:
            "ISO date string - only emails received before this date",
        },
      },
      required: ["userId", "query"],
    },
  },
  {
    name: "search_emails",
    description:
      "Flexible email search. If userId specified, use @desertservices.net domain. Common: jared@, jeff@, contracts@, chi@",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        userId: {
          type: "string",
          description: "Optional: specific mailbox to search",
        },
        limit: { type: "number", description: "Max results (default: 50)" },
        since: {
          type: "string",
          description: "ISO date string - only emails received after this date",
        },
        until: {
          type: "string",
          description:
            "ISO date string - only emails received before this date",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "filter_emails",
    description:
      "Advanced email filtering using OData $filter syntax. Use for complex queries like hasAttachments, from/to addresses, or date ranges.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description:
            'OData filter string. Examples: "hasAttachments eq true", "from/emailAddress/address eq \'john@example.com\'", "receivedDateTime ge 2024-01-01"',
        },
        userId: {
          type: "string",
          description: "Email address of the mailbox to filter",
        },
        limit: { type: "number", description: "Max results (default: 50)" },
      },
      required: ["filter", "userId"],
    },
  },
  {
    name: "get_email",
    description: "Get a single email by ID with full body content",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: {
          type: "string",
          description: "Mailbox containing the email",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "get_email_thread",
    description: "Get all emails in a conversation thread.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "Any message ID in the thread",
        },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId"],
    },
  },
  {
    name: "get_attachments",
    description: "List all attachments for an email",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId"],
    },
  },
  {
    name: "download_attachment",
    description: "Download a specific attachment from an email",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        attachmentId: { type: "string", description: "Attachment ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "attachmentId"],
    },
  },
  {
    name: "send_email",
    description:
      "Send an email with optional attachments and auto-signature. For important emails, use send_test_email first.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
            required: ["email"],
          },
          description: "Recipients",
        },
        cc: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
          },
          description: "CC recipients",
        },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body content" },
        bodyType: {
          type: "string",
          enum: ["html", "text"],
          description: "Body format (default: text)",
        },
        skipSignature: {
          type: "boolean",
          description: "Skip auto-signature (default: false)",
        },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Filename" },
              contentType: {
                type: "string",
                description: "MIME type (e.g., application/pdf)",
              },
              contentBytes: {
                type: "string",
                description: "Base64-encoded file content",
              },
            },
            required: ["name", "contentType", "contentBytes"],
          },
          description: "File attachments (base64 encoded)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "send_test_email",
    description:
      "Send email to yourself first for review. Returns a confirmation ID. Supports attachments.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
            required: ["email"],
          },
          description: "Final recipients (email sent to test address first)",
        },
        cc: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
          },
        },
        subject: { type: "string" },
        body: { type: "string" },
        bodyType: { type: "string", enum: ["html", "text"] },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Filename" },
              contentType: {
                type: "string",
                description: "MIME type (e.g., application/pdf)",
              },
              contentBytes: {
                type: "string",
                description: "Base64-encoded file content",
              },
            },
            required: ["name", "contentType", "contentBytes"],
          },
          description: "File attachments (base64 encoded)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "send_sandstorm_sign_order",
    description:
      "Send or draft a sign order email to Sandstorm Signs (kelli@sandstormsign.com) using the standardized template. Automatically formats the email with Chi's signature and logo. Subject line follows pattern: MM.DD.YY Sign Order. Use for SWPPP signs, Dust signs, stickers, Fire Access signs, and Job Information signs. IMPORTANT: Facility ID (format: F######) is REQUIRED when ordering Maricopa County dust signs. Set createAsDraft: true to create a draft for review instead of sending immediately.",
    inputSchema: {
      type: "object" as const,
      properties: {
        signDetails: {
          type: "string",
          description:
            "Main sign order content (e.g., '1 SWPPP sign needed', '1 dust and 1 SWPPP sign', '3 SWPPP Signs and 3 Dust Signs'). If ordering dust signs, Facility ID must be included in signDetails or provided separately via facilityId parameter.",
        },
        subject: {
          type: "string",
          description:
            "Email subject line in format MM.DD.YY Sign Order or MM.DD.YY [Sign Type] sign order (e.g., '01.26.26 SWPPP sign order')",
        },
        facilityId: {
          type: "string",
          description:
            "Facility ID for Maricopa County dust signs (REQUIRED if ordering dust signs). Format: F followed by 5-6 digits (e.g., F050044, F052737). Must match pattern: ^F\\d{5,6}$",
          pattern: "^F\\d{5,6}$",
        },
        additionalMessage: {
          type: "string",
          description:
            "Optional additional instructions or notes to include in the email",
        },
        showDoubleExclamation: {
          type: "boolean",
          description:
            "Use 'Thank you!!' instead of 'Thank you!' (default: false)",
        },
        createAsDraft: {
          type: "boolean",
          description:
            "Create as draft instead of sending immediately (default: false). Use draft ID with send_draft tool to send later.",
        },
        userId: {
          type: "string",
          description:
            "Mailbox to create draft in (required if createAsDraft is true, e.g., 'chi@desertservices.net')",
        },
      },
      required: ["signDetails", "subject"],
    },
  },
  {
    name: "send_morning_status",
    description:
      "Send a morning check-in status email to Tim and Rick (cc Yolanda). Use this when the user says they've arrived and describes what they're working on. Parses their input to extract arrival time, dust permits, contracts, and other tasks. Subject line: 'Morning Check-in — [Date]'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        arrivalTime: {
          type: "string",
          description:
            "Time the user arrived (e.g., '6:56am', '7:30am'). Extract from user's message.",
        },
        planSummary: {
          type: "string",
          description:
            "Brief summary of the day's plan (e.g., 'Working on outstanding dust permits in the morning, then contracts after')",
        },
        dustPermits: {
          type: "array",
          items: { type: "string" },
          description:
            "List of dust permit projects to work on (e.g., ['Northern Parkway', 'Legacy Sport Arena & Hotel'])",
        },
        contracts: {
          type: "array",
          items: { type: "string" },
          description:
            "List of contracts to work on (e.g., ['Elanto at Prasada', 'VT303', 'Sprouts Rita Ranch'])",
        },
        otherTasks: {
          type: "array",
          items: { type: "string" },
          description:
            "List of other tasks not related to dust permits or contracts",
        },
        includeMetrics: {
          type: "boolean",
          description:
            "Include pipeline status metrics at the bottom of the email (default: true)",
        },
        to: {
          type: "array",
          items: { type: "string" },
          description:
            "Override recipient emails (default: tim@desertservices.net, rick@desertservices.net)",
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description:
            "Override CC emails (default: yolanda@desertservices.net)",
        },
        createAsDraft: {
          type: "boolean",
          description:
            "Create as draft instead of sending immediately (default: false). Use draft ID with send_draft tool to send later.",
        },
        userId: {
          type: "string",
          description:
            "Mailbox to create draft in (required if createAsDraft is true, e.g., 'chi@desertservices.net')",
        },
      },
      required: ["arrivalTime", "planSummary"],
    },
  },
  {
    name: "send_evening_status",
    description:
      "Send an end-of-day status email to Jayson. Use this when the user describes what they completed, pushed, or any blockers. Subject line: 'End of Day — [Date]'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        completed: {
          type: "array",
          items: { type: "string" },
          description:
            "List of items completed today (e.g., ['Northern Parkway permit', 'Elanto at Prasada contract'])",
        },
        pushed: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string", description: "Item that was pushed" },
              reason: {
                type: "string",
                description: "Reason for pushing (optional)",
              },
            },
            required: ["item"],
          },
          description:
            "List of items pushed to tomorrow with optional reasons (e.g., [{item: 'VT303', reason: 'waiting on customer'}])",
        },
        blockers: {
          type: "array",
          items: { type: "string" },
          description: "List of blockers encountered",
        },
        tomorrowPriorities: {
          type: "array",
          items: { type: "string" },
          description: "Priorities for tomorrow",
        },
        includeMetrics: {
          type: "boolean",
          description:
            "Include pipeline status metrics at the bottom of the email (default: true)",
        },
        to: {
          type: "string",
          description:
            "Override recipient email (default: jayson@desertservices.net)",
        },
        createAsDraft: {
          type: "boolean",
          description:
            "Create as draft instead of sending immediately (default: false). Use draft ID with send_draft tool to send later.",
        },
        userId: {
          type: "string",
          description:
            "Mailbox to create draft in (required if createAsDraft is true, e.g., 'chi@desertservices.net')",
        },
      },
      required: [],
    },
  },
  {
    name: "confirm_send_email",
    description: "After reviewing test email, send to actual recipients.",
    inputSchema: {
      type: "object" as const,
      properties: {
        confirmationId: {
          type: "string",
          description: "Confirmation ID from send_test_email",
        },
      },
      required: ["confirmationId"],
    },
  },
  {
    name: "reply_to_email",
    description: "Reply to an email. For reply-all, set replyAll: true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "ID of email to reply to" },
        body: { type: "string", description: "Reply content" },
        bodyType: { type: "string", enum: ["html", "text"] },
        replyAll: {
          type: "boolean",
          description: "Reply to all recipients (default: false)",
        },
        confirmed: {
          type: "boolean",
          description: "For reply-all: must be true to send",
        },
        userId: {
          type: "string",
          description: "Mailbox containing the original email",
        },
        skipSignature: {
          type: "boolean",
          description: "Skip auto-signature (default: false)",
        },
      },
      required: ["messageId", "body"],
    },
  },
  // ========== EMAIL MANAGEMENT TOOLS ==========
  {
    name: "list_folders",
    description:
      "List mail folders for a mailbox. Returns folder IDs needed for move_email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "Email address of the mailbox",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "list_all_folders",
    description:
      "List all mail folders recursively including subfolders. Returns a tree structure with nested children.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "Email address of the mailbox",
        },
        maxDepth: {
          type: "number",
          description: "Maximum depth to recurse (default: 10)",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "archive_email",
    description: "Archive an email (move to Archive folder).",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "userId"],
    },
  },
  {
    name: "move_email",
    description:
      'Move an email to a folder. Use well-known names: "inbox", "drafts", "sentitems", "deleteditems", "archive", "junkemail", or folder ID from list_folders.',
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        destinationId: {
          type: "string",
          description: "Folder ID or well-known name",
        },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "destinationId", "userId"],
    },
  },
  {
    name: "delete_email",
    description: "Delete an email (soft delete - moves to Deleted Items).",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "userId"],
    },
  },
  {
    name: "mark_read",
    description: "Mark an email as read.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "userId"],
    },
  },
  {
    name: "mark_unread",
    description: "Mark an email as unread.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "userId"],
    },
  },
  {
    name: "flag_email",
    description: "Flag or unflag an email for follow-up.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        flagStatus: {
          type: "string",
          enum: ["flagged", "complete", "notFlagged"],
          description: "Flag status to set",
        },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "flagStatus", "userId"],
    },
  },
  // ========== DRAFT & FOLDER TOOLS ==========
  {
    name: "create_draft",
    description:
      "Create a draft email (not sent). Auto-adds signature + logo unless skipSignature is true. Returns draft ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        subject: { type: "string", description: "Email subject" },
        body: {
          type: "string",
          description: "Email body (signature is added automatically)",
        },
        bodyType: {
          type: "string",
          enum: ["html", "text"],
          description: "Body format (default: text)",
        },
        to: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
            required: ["email"],
          },
          description: "Recipients (optional for drafts)",
        },
        cc: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
            required: ["email"],
          },
          description: "CC recipients (optional)",
        },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Filename" },
              contentType: {
                type: "string",
                description: "MIME type (e.g., application/pdf)",
              },
              contentBytes: {
                type: "string",
                description: "Base64-encoded file content",
              },
            },
            required: ["name", "contentType", "contentBytes"],
          },
          description: "File attachments (base64 encoded)",
        },
        filePaths: {
          type: "array",
          items: { type: "string" },
          description:
            "Local file paths to attach (alternative to base64 attachments)",
        },
        userId: { type: "string", description: "Mailbox to create draft in" },
        skipSignature: {
          type: "boolean",
          description: "Skip auto-signature + logo (default: false)",
        },
      },
      required: ["subject", "body", "userId"],
    },
  },
  {
    name: "send_draft",
    description: "Send an existing draft email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        draftId: { type: "string", description: "Draft message ID" },
        userId: { type: "string", description: "Mailbox containing the draft" },
      },
      required: ["draftId", "userId"],
    },
  },
  {
    name: "create_folder",
    description: "Create a new mail folder.",
    inputSchema: {
      type: "object" as const,
      properties: {
        displayName: { type: "string", description: "Folder name" },
        userId: { type: "string", description: "Mailbox to create folder in" },
        parentFolderId: {
          type: "string",
          description:
            "Parent folder ID (optional, creates at root if omitted)",
        },
      },
      required: ["displayName", "userId"],
    },
  },
  {
    name: "delete_folder",
    description:
      "Delete a mail folder. Cannot delete well-known folders (inbox, sent, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "string", description: "Folder ID to delete" },
        userId: {
          type: "string",
          description: "Mailbox containing the folder",
        },
      },
      required: ["folderId", "userId"],
    },
  },
  {
    name: "rename_folder",
    description: "Rename a mail folder.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "string", description: "Folder ID to rename" },
        newName: { type: "string", description: "New name for the folder" },
        userId: {
          type: "string",
          description: "Mailbox containing the folder",
        },
      },
      required: ["folderId", "newName", "userId"],
    },
  },
  {
    name: "move_folder",
    description:
      "Move a mail folder to a new parent folder. Use list_all_folders to get folder IDs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "string", description: "Folder ID to move" },
        destinationId: {
          type: "string",
          description: "Destination parent folder ID",
        },
        userId: {
          type: "string",
          description: "Mailbox containing the folder",
        },
      },
      required: ["folderId", "destinationId", "userId"],
    },
  },
  {
    name: "forward_email",
    description: "Forward an email to one or more recipients.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email to forward" },
        to: {
          type: "array",
          items: {
            type: "object",
            properties: { email: { type: "string" }, name: { type: "string" } },
            required: ["email"],
          },
          description: "Recipients",
        },
        comment: {
          type: "string",
          description: "Optional comment to add above forwarded content",
        },
        userId: {
          type: "string",
          description: "Mailbox containing the email",
        },
      },
      required: ["messageId", "to", "userId"],
    },
  },
  {
    name: "get_message_status",
    description:
      "Get read/flag status of an email. Useful for verifying operations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: { type: "string", description: "Email message ID" },
        userId: { type: "string", description: "Mailbox containing the email" },
      },
      required: ["messageId", "userId"],
    },
  },
  // ========== M365 GROUP TOOLS ==========
  {
    name: "list_groups",
    description:
      "List all M365 groups in the organization. Use this to find group IDs for searching group conversations.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_group_conversations",
    description:
      "Get conversations from an M365 group (like internalcontracts@desertservices). Returns conversation IDs and topics.",
    inputSchema: {
      type: "object" as const,
      properties: {
        groupId: {
          type: "string",
          description: "Group ID (from list_groups)",
        },
        limit: {
          type: "number",
          description: "Max conversations to return (default: 50)",
        },
        since: {
          type: "string",
          description: "ISO date string - only conversations after this date",
        },
      },
      required: ["groupId"],
    },
  },
  {
    name: "get_group_conversation",
    description:
      "Get full conversation details including all threads and posts from an M365 group.",
    inputSchema: {
      type: "object" as const,
      properties: {
        groupId: {
          type: "string",
          description: "Group ID (from list_groups)",
        },
        conversationId: {
          type: "string",
          description: "Conversation ID (from get_group_conversations)",
        },
        includeAttachments: {
          type: "boolean",
          description: "Include attachment data (default: false)",
        },
      },
      required: ["groupId", "conversationId"],
    },
  },
  {
    name: "search_group_conversations",
    description:
      "Search M365 group conversations by topic. Returns matching conversations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        groupId: {
          type: "string",
          description: "Group ID (from list_groups)",
        },
        query: {
          type: "string",
          description: "Search term to match against conversation topics",
        },
        limit: {
          type: "number",
          description: "Max conversations to return (default: 20)",
        },
      },
      required: ["groupId", "query"],
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Standard MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Handler function type for MCP tools.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

/**
 * Helper to create a text response.
 */
function text(t: string): ToolResponse {
  return { content: [{ type: "text", text: t }] };
}

/**
 * Handler for MCP ListTools requests.
 * Returns the complete list of available email tools and their schemas.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

/**
 * Tool handlers mapped by name.
 *
 * Uses dual authentication:
 * - App auth (via `getAppClient()`) for read operations
 * - User auth (via `getUserClient()`) for write operations
 */
const handlers: Record<string, ToolHandler> = {
  // ========== SEARCH TOOLS (App Auth) ==========

  async search_all_mailboxes(args) {
    const { query, limit, since, until } = args as {
      query: string;
      limit?: number;
      since?: string;
      until?: string;
    };
    const client = getAppClient();
    const results = await client.searchAllMailboxes({
      query,
      limit,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
    });
    return text(formatSearchResults(toMailboxResults(results)));
  },

  async search_mailboxes(args) {
    const { userIds, query, limit, since, until } = args as {
      userIds: string[];
      query: string;
      limit?: number;
      since?: string;
      until?: string;
    };
    const client = getAppClient();
    const results = await client.searchMailboxes({
      userIds,
      query,
      limit,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
    });
    return text(formatSearchResults(toMailboxResults(results)));
  },

  async search_user_mailbox(args) {
    const { userId, query, limit, since, until } = args as {
      userId: string;
      query: string;
      limit?: number;
      since?: string;
      until?: string;
    };
    const client = getAppClient();
    const results = await client.searchEmails({
      query,
      userId,
      limit,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
    });
    return text(formatEmailList(results.map(toEmailResult)));
  },

  async search_emails(args) {
    const { query, userId, limit, since, until } = args as {
      query: string;
      userId?: string;
      limit?: number;
      since?: string;
      until?: string;
    };
    const client = getAppClient();
    const results = await client.searchEmails({
      query,
      userId,
      limit,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
    });
    return text(formatEmailList(results.map(toEmailResult)));
  },

  async filter_emails(args) {
    const { filter, userId, limit } = args as {
      filter: string;
      userId: string;
      limit?: number;
    };
    const client = getAppClient();
    const results = await client.filterEmails({ filter, userId, limit });
    return text(formatEmailList(results.map(toEmailResult)));
  },

  // ========== READ TOOLS (App Auth) ==========

  async get_email(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId?: string;
    };
    const client = getAppClient();
    const email = await client.getEmail(messageId, userId);
    if (email === null) {
      return text("Email not found");
    }
    const toEmails = email.toRecipients.map((r) => r.email).join(", ");
    return text(
      [
        `**Subject:** ${email.subject}`,
        `**From:** ${email.fromName} <${email.fromEmail}>`,
        `**To:** ${toEmails}`,
        `**Date:** ${email.receivedDateTime}`,
        `**ID:** ${email.id}`,
        "",
        "**Body:**",
        email.bodyContent || "(no body)",
      ].join("\n")
    );
  },

  async get_email_thread(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId?: string;
    };
    const client = getAppClient();
    const thread = await client.getThreadByMessageId(messageId, userId);
    if (thread.length === 0) {
      return text("Email not found");
    }
    const threadText = thread
      .map(
        (e, i) =>
          `${i + 1}. "${e.subject}" from ${e.fromName || e.fromEmail} (${e.receivedDateTime})\n   ID: ${e.id}`
      )
      .join("\n");
    return text(`Thread with ${thread.length} messages:\n\n${threadText}`);
  },

  async get_attachments(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId?: string;
    };
    const client = getAppClient();
    const attachments = await client.getAttachments(messageId, userId);
    if (attachments.length === 0) {
      return text("No attachments");
    }
    const attList = attachments
      .map(
        (a) =>
          `- ${a.name} (${a.contentType}, ${Math.round(a.size / 1024)}KB) ID: ${a.id}`
      )
      .join("\n");
    return text(`${attachments.length} attachments:\n${attList}`);
  },

  async download_attachment(args) {
    const { messageId, attachmentId, userId } = args as {
      messageId: string;
      attachmentId: string;
      userId?: string;
    };
    const client = getAppClient();
    const content = await client.downloadAttachment(
      messageId,
      attachmentId,
      userId
    );
    return text(
      `Downloaded ${content.length} bytes. Base64 preview: ${content.toString("base64").slice(0, 100)}...`
    );
  },

  // ========== SEND TOOLS (User Auth) ==========

  async send_email(args) {
    const {
      to,
      cc,
      subject,
      body,
      bodyType = "text",
      skipSignature,
      attachments,
    } = args as {
      to: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      subject: string;
      body: string;
      bodyType?: "html" | "text";
      skipSignature?: boolean;
      attachments?: Array<{
        name: string;
        contentType: string;
        contentBytes: string;
      }>;
    };
    const client = await getUserClient();
    await client.sendEmail({
      to,
      cc,
      subject,
      body,
      bodyType,
      skipSignature,
      attachments,
    });
    const attInfo =
      attachments && attachments.length > 0
        ? ` with ${attachments.length} attachment(s)`
        : "";
    return text(`Email sent to ${to.map((r) => r.email).join(", ")}${attInfo}`);
  },

  async send_sandstorm_sign_order(args) {
    const {
      signDetails,
      subject,
      facilityId,
      additionalMessage,
      showDoubleExclamation = false,
      createAsDraft = false,
      userId,
    } = args as {
      signDetails: string;
      subject: string;
      facilityId?: string;
      additionalMessage?: string;
      showDoubleExclamation?: boolean;
      createAsDraft?: boolean;
      userId?: string;
    };

    // Validate Facility ID is provided when ordering dust signs
    const isDustSignOrder =
      signDetails.toLowerCase().includes("dust") &&
      !signDetails.toLowerCase().includes("dustag"); // Pinal County uses DUSTAG format

    if (isDustSignOrder) {
      // Check if Facility ID is in signDetails or provided separately
      const hasFacilityIdInDetails =
        RE_FACILITY_ID_IN_DETAILS.test(signDetails);
      const hasFacilityIdParam =
        facilityId && RE_FACILITY_ID_FORMAT.test(facilityId);

      if (!(hasFacilityIdInDetails || hasFacilityIdParam)) {
        return text(
          "Error: Facility ID is REQUIRED for Maricopa County dust signs. " +
            "Please provide Facility ID (format: F######, e.g., F050044) either in signDetails or via facilityId parameter. " +
            "Example: '1 dust sign - Facility ID: F050044' or provide facilityId: 'F050044'"
        );
      }

      // Validate Facility ID format if provided separately
      if (facilityId && !RE_FACILITY_ID_FORMAT.test(facilityId)) {
        return text(
          `Error: Invalid Facility ID format. Must be F followed by 5-6 digits (e.g., F050044, F052737). Received: ${facilityId}`
        );
      }
    }

    // Build sign details with Facility ID if provided separately
    let finalSignDetails = signDetails;
    if (facilityId && !signDetails.includes(facilityId)) {
      finalSignDetails = `${signDetails}\n\nFacility ID: ${facilityId}`;
    }

    // Generate HTML body using the sandstorm-sign-order template
    const templateVars: Record<string, string> = {
      signDetails: finalSignDetails,
      showDoubleExclamation: showDoubleExclamation ? "true" : "",
    };
    if (additionalMessage) {
      templateVars.additionalMessage = additionalMessage;
    }
    const html = await getTemplate("sandstorm-sign-order", templateVars);

    // Get logo attachment
    const logo = await getLogoAttachment();

    const to = [{ email: "kelli@sandstormsign.com", name: "Kelli Atkinson" }];

    if (createAsDraft) {
      if (!userId) {
        return text(
          "Error: userId is required when createAsDraft is true (e.g., 'chi@desertservices.net')"
        );
      }
      const client = getAppClient();
      const draft = await client.createDraft({
        subject,
        body: html,
        bodyType: "html",
        to,
        attachments: [logo],
        userId,
      });
      return text(
        `Sandstorm sign order draft created: "${subject}" (ID: ${draft.id}). Use send_draft tool to send it.`
      );
    }
    // Send email immediately
    const client = await getUserClient();
    await client.sendEmail({
      to,
      subject,
      body: html,
      bodyType: "html",
      attachments: [logo],
    });
    return text(
      `Sandstorm sign order email sent to kelli@sandstormsign.com with subject: "${subject}"`
    );
  },

  async send_morning_status(args) {
    const {
      arrivalTime,
      planSummary,
      dustPermits,
      contracts,
      otherTasks,
      includeMetrics = true,
      to = ["tim@desertservices.net", "rick@desertservices.net"],
      cc = ["yolanda@desertservices.net"],
      createAsDraft = false,
      userId,
    } = args as {
      arrivalTime: string;
      planSummary: string;
      dustPermits?: string[];
      contracts?: string[];
      otherTasks?: string[];
      includeMetrics?: boolean;
      to?: string[];
      cc?: string[];
      createAsDraft?: boolean;
      userId?: string;
    };

    if (createAsDraft && !userId) {
      return text(
        "Error: userId is required when createAsDraft is true (e.g., 'chi@desertservices.net')"
      );
    }

    // Build HTML lists
    const toHtmlList = (items: string[]) =>
      `<ul style="margin-top:4px; margin-bottom:12px">\n${items.map((i) => `  <li>${i}</li>`).join("\n")}\n</ul>`;

    const templateVars: Record<string, string> = {
      arrivalTime,
      planSummary,
    };

    if (dustPermits && dustPermits.length > 0) {
      templateVars.dustPermitsHtml = toHtmlList(dustPermits);
    }
    if (contracts && contracts.length > 0) {
      templateVars.contractsHtml = toHtmlList(contracts);
    }
    if (otherTasks && otherTasks.length > 0) {
      templateVars.otherTasksHtml = toHtmlList(otherTasks);
    }
    if (includeMetrics) {
      // TODO: Connect to Notion/Monday for real metrics
      templateVars.metricsHtml = `
<div><em>Contracts:</em></div>
<ul style="margin-top:4px; margin-bottom:12px">
  <li>Intake: --</li>
  <li>Reconciling: --</li>
  <li>Waiting on Customer: --</li>
  <li>Ready to Sign: --</li>
</ul>
<div><em>Dust Permits:</em></div>
<ul style="margin-top:4px; margin-bottom:12px">
  <li>Outstanding: --</li>
</ul>
<div style="font-size: 11px; color: #999;">(Metrics coming soon)</div>`;
    }

    const html = await getTemplate("daily-status-morning", templateVars);
    const logo = await getLogoAttachment();
    const toRecipients = to.map((email) => ({ email }));
    const ccRecipients = cc.map((email) => ({ email }));
    const formattedDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const subject = `Morning Check-in — ${formattedDate}`;

    const permitCount = dustPermits?.length || 0;
    const contractCount = contracts?.length || 0;

    if (createAsDraft) {
      if (!userId) {
        return text(
          "Error: userId is required when createAsDraft is true. Please provide a mailbox address (e.g., 'chi@desertservices.net')."
        );
      }
      const client = getAppClient();
      const draft = await client.createDraft({
        subject,
        body: html,
        bodyType: "html",
        to: toRecipients,
        cc: ccRecipients,
        attachments: [logo],
        userId,
      });
      return text(
        `Morning status draft created in ${userId}. Draft ID: ${draft.id}. ` +
          `Plan: ${permitCount} dust permit(s), ${contractCount} contract(s). Use send_draft tool to send it.`
      );
    }

    const client = await getUserClient();
    await client.sendEmail({
      to: toRecipients,
      cc: ccRecipients,
      subject,
      body: html,
      bodyType: "html",
      attachments: [logo],
    });
    return text(
      `Morning status email sent to ${to}. Arrival: ${arrivalTime}. Plan: ${permitCount} dust permit(s), ${contractCount} contract(s).`
    );
  },

  async send_evening_status(args) {
    const {
      completed,
      pushed,
      blockers,
      tomorrowPriorities,
      includeMetrics = true,
      to = "jayson@desertservices.net",
      createAsDraft = false,
      userId,
    } = args as {
      completed?: string[];
      pushed?: Array<{ item: string; reason?: string }>;
      blockers?: string[];
      tomorrowPriorities?: string[];
      includeMetrics?: boolean;
      to?: string;
      createAsDraft?: boolean;
      userId?: string;
    };

    if (createAsDraft && !userId) {
      return text(
        "Error: userId is required when createAsDraft is true (e.g., 'chi@desertservices.net')"
      );
    }

    // Build HTML lists
    const toHtmlList = (items: string[]) =>
      `<ul style="margin-top:4px; margin-bottom:12px">\n${items.map((i) => `  <li>${i}</li>`).join("\n")}\n</ul>`;

    const toPushedHtmlList = (
      items: Array<{ item: string; reason?: string }>
    ) =>
      `<ul style="margin-top:4px; margin-bottom:12px">\n${items.map((i) => `  <li>${i.item}${i.reason ? ` — ${i.reason}` : ""}</li>`).join("\n")}\n</ul>`;

    const templateVars: Record<string, string> = {};

    if (completed && completed.length > 0) {
      templateVars.completedHtml = toHtmlList(completed);
    }
    if (pushed && pushed.length > 0) {
      templateVars.pushedHtml = toPushedHtmlList(pushed);
    }
    if (blockers && blockers.length > 0) {
      templateVars.blockersHtml = toHtmlList(blockers);
    }
    if (tomorrowPriorities && tomorrowPriorities.length > 0) {
      templateVars.tomorrowHtml = toHtmlList(tomorrowPriorities);
    }
    if (includeMetrics) {
      templateVars.metricsHtml = `
<div><em>Contracts:</em></div>
<ul style="margin-top:4px; margin-bottom:12px">
  <li>Intake: --</li>
  <li>Reconciling: --</li>
  <li>Waiting on Customer: --</li>
  <li>Ready to Sign: --</li>
</ul>
<div><em>Dust Permits:</em></div>
<ul style="margin-top:4px; margin-bottom:12px">
  <li>Outstanding: --</li>
</ul>
<div style="font-size: 11px; color: #999;">(Metrics coming soon)</div>`;
    }

    const html = await getTemplate("daily-status-evening", templateVars);
    const logo = await getLogoAttachment();
    const toRecipients = [{ email: to }];
    const formattedDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const subject = `End of Day — ${formattedDate}`;

    const doneCount = completed?.length || 0;
    const pushedCount = pushed?.length || 0;

    if (createAsDraft) {
      if (!userId) {
        return text(
          "Error: userId is required when createAsDraft is true. Please provide a mailbox address (e.g., 'chi@desertservices.net')."
        );
      }
      const client = getAppClient();
      const draft = await client.createDraft({
        subject,
        body: html,
        bodyType: "html",
        to: toRecipients,
        attachments: [logo],
        userId,
      });
      return text(
        `Evening status draft created in ${userId}. Draft ID: ${draft.id}. ` +
          `Done: ${doneCount} item(s), Pushed: ${pushedCount} item(s). Use send_draft tool to send it.`
      );
    }

    const client = await getUserClient();
    await client.sendEmail({
      to: toRecipients,
      subject,
      body: html,
      bodyType: "html",
      attachments: [logo],
    });
    return text(
      `Evening status email sent to ${to}. Done: ${doneCount} item(s), Pushed: ${pushedCount} item(s).`
    );
  },

  async send_test_email(args) {
    const {
      to,
      cc,
      subject,
      body,
      bodyType = "text",
      attachments,
    } = args as {
      to: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      subject: string;
      body: string;
      bodyType?: "html" | "text";
      attachments?: Array<{
        name: string;
        contentType: string;
        contentBytes: string;
      }>;
    };
    const client = await getUserClient();

    await client.sendEmail({
      to: [{ email: testEmail, name: "Test" }],
      subject: `[TEST] ${subject}`,
      body: `--- Final recipients: ${to.map((r) => r.email).join(", ")} ---\n\n${body}`,
      attachments,
    });

    cleanupExpiredPending();
    const confirmationId = generateConfirmationId();
    pendingEmails.set(confirmationId, {
      to,
      cc,
      subject,
      body,
      bodyType,
      attachments,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const attInfo =
      attachments && attachments.length > 0
        ? ` with ${attachments.length} attachment(s)`
        : "";
    return text(
      `Test email sent to ${testEmail}${attInfo}. Review it, then use confirm_send_email with ID: ${confirmationId}`
    );
  },

  async confirm_send_email(args) {
    const { confirmationId } = args as { confirmationId: string };
    const pending = pendingEmails.get(confirmationId);
    if (pending === undefined) {
      return text("Confirmation ID not found or expired.");
    }
    const client = await getUserClient();
    await client.sendEmail({
      to: pending.to,
      cc: pending.cc,
      subject: pending.subject,
      body: pending.body,
      bodyType: pending.bodyType,
      attachments: pending.attachments,
    });
    pendingEmails.delete(confirmationId);
    const attInfo =
      pending.attachments && pending.attachments.length > 0
        ? ` with ${pending.attachments.length} attachment(s)`
        : "";
    return text(
      `Email sent to ${pending.to.map((r) => r.email).join(", ")}${attInfo}`
    );
  },

  async reply_to_email(args) {
    const {
      messageId,
      body,
      bodyType = "text",
      replyAll,
      confirmed,
      userId,
      skipSignature,
    } = args as {
      messageId: string;
      body: string;
      bodyType?: "html" | "text";
      replyAll?: boolean;
      confirmed?: boolean;
      userId?: string;
      skipSignature?: boolean;
    };

    if (replyAll === true && confirmed !== true) {
      const readClient = getAppClient();
      const original = await readClient.getEmail(messageId, userId);
      if (original === null) {
        return text("Original email not found");
      }
      const recipients = [
        original.fromEmail,
        ...original.toRecipients.map((r) => r.email),
        ...original.ccRecipients.map((r) => r.email),
      ].filter(Boolean);
      return text(
        `Reply-all will send to: ${recipients.join(", ")}\n\nCall again with confirmed: true to send.`
      );
    }

    const client = await getUserClient();
    await client.replyToEmail({
      messageId,
      body,
      bodyType,
      replyAll,
      userId,
      skipSignature,
    });

    const action = replyAll ? "Reply-all" : "Reply";
    return text(`${action} sent successfully.`);
  },

  // ========== EMAIL MANAGEMENT TOOLS (App Auth) ==========

  async list_folders(args) {
    const { userId } = args as { userId: string };
    const client = getAppClient();
    const folders = await client.listFolders(userId);
    const folderList = folders
      .map((f) => `- ${f.displayName} (ID: ${f.id})`)
      .join("\n");
    return text(`${folders.length} folders:\n${folderList}`);
  },

  async list_all_folders(args) {
    const { userId, maxDepth } = args as { userId: string; maxDepth?: number };
    const client = getAppClient();
    const folders = await client.listFoldersRecursive(userId, maxDepth);

    const formatTree = (items: typeof folders, indent = ""): string => {
      return items
        .map((f) => {
          const line = `${indent}- ${f.displayName} (ID: ${f.id})`;
          if (f.children && f.children.length > 0) {
            return `${line}\n${formatTree(f.children, `${indent}  `)}`;
          }
          return line;
        })
        .join("\n");
    };

    const countFolders = (items: typeof folders): number => {
      return items.reduce((sum, f) => {
        return sum + 1 + (f.children ? countFolders(f.children) : 0);
      }, 0);
    };

    const totalCount = countFolders(folders);
    const tree = formatTree(folders);
    return text(`${totalCount} folders (including subfolders):\n${tree}`);
  },

  async archive_email(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId: string;
    };
    const client = getAppClient();
    await client.archiveEmail(messageId, userId);
    return text("Email archived successfully");
  },

  async move_email(args) {
    const { messageId, destinationId, userId } = args as {
      messageId: string;
      destinationId: string;
      userId: string;
    };
    const client = getAppClient();
    await client.moveEmail(messageId, destinationId, userId);
    return text(`Email moved to ${destinationId}`);
  },

  async delete_email(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId: string;
    };
    const client = getAppClient();
    await client.deleteEmail(messageId, userId);
    return text("Email deleted (moved to Deleted Items)");
  },

  async mark_read(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId: string;
    };
    const client = getAppClient();
    await client.markAsRead(messageId, userId);
    return text("Email marked as read");
  },

  async mark_unread(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId: string;
    };
    const client = getAppClient();
    await client.markAsUnread(messageId, userId);
    return text("Email marked as unread");
  },

  async flag_email(args) {
    const { messageId, flagStatus, userId } = args as {
      messageId: string;
      flagStatus: "flagged" | "complete" | "notFlagged";
      userId: string;
    };
    const client = getAppClient();
    await client.flagEmail(messageId, flagStatus, userId);
    return text(`Email flag set to: ${flagStatus}`);
  },

  // ========== DRAFT & FOLDER TOOLS (App Auth) ==========

  async create_draft(args) {
    const {
      subject,
      body,
      bodyType,
      to,
      cc,
      attachments,
      filePaths,
      userId,
      skipSignature,
    } = args as {
      subject: string;
      body: string;
      bodyType?: "html" | "text";
      to?: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      attachments?: Array<{
        name: string;
        contentType: string;
        contentBytes: string;
      }>;
      filePaths?: string[];
      userId: string;
      skipSignature?: boolean;
    };
    const client = getAppClient();

    let finalBody = body;
    let finalBodyType = bodyType;

    if (skipSignature !== true) {
      finalBody = await wrapWithSignature(body, { embedLogo: true });
      finalBodyType = "html";
    }

    // Build attachments list from both base64 and file paths
    const allAttachments: Array<{
      name: string;
      contentType: string;
      contentBytes: string;
    }> = [];

    if (attachments?.length) {
      allAttachments.push(...attachments);
    }

    if (filePaths?.length) {
      for (const filePath of filePaths) {
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          return text(`File not found: ${filePath}`);
        }
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const name = filePath.split("/").pop() ?? "attachment";
        const contentType = file.type || "application/octet-stream";
        allAttachments.push({ name, contentType, contentBytes: base64 });
      }
    }

    const draft = await client.createDraft({
      subject,
      body: finalBody,
      bodyType: finalBodyType,
      to,
      cc,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
      userId,
    });

    const attInfo =
      allAttachments.length > 0
        ? ` with ${allAttachments.length} attachment(s)`
        : "";
    return text(
      `Draft created: "${draft.subject}"${attInfo} (ID: ${draft.id})`
    );
  },

  async send_draft(args) {
    const { draftId } = args as {
      draftId: string;
      userId: string;
    };
    const client = await getUserClient();
    await client.sendDraft(draftId);
    return text("Draft sent successfully");
  },

  async create_folder(args) {
    const { displayName, userId, parentFolderId } = args as {
      displayName: string;
      userId: string;
      parentFolderId?: string;
    };
    const client = getAppClient();
    const folder = await client.createFolder(
      displayName,
      userId,
      parentFolderId
    );
    return text(`Folder created: "${folder.displayName}" (ID: ${folder.id})`);
  },

  async delete_folder(args) {
    const { folderId, userId } = args as {
      folderId: string;
      userId: string;
    };
    const client = getAppClient();
    await client.deleteFolder(folderId, userId);
    return text("Folder deleted successfully");
  },

  async rename_folder(args) {
    const { folderId, newName, userId } = args as {
      folderId: string;
      newName: string;
      userId: string;
    };
    const client = getAppClient();
    const folder = await client.renameFolder(folderId, newName, userId);
    return text(`Folder renamed to "${folder.displayName}"`);
  },

  async move_folder(args) {
    const { folderId, destinationId, userId } = args as {
      folderId: string;
      destinationId: string;
      userId: string;
    };
    const client = getAppClient();
    const folder = await client.moveFolder(folderId, destinationId, userId);
    return text(
      `Folder "${folder.displayName}" moved to parent ${folder.parentFolderId}`
    );
  },

  async forward_email(args) {
    const { messageId, to, comment } = args as {
      messageId: string;
      to: Array<{ email: string; name?: string }>;
      comment?: string;
      userId: string;
    };
    const client = await getUserClient();
    await client.forwardEmail(messageId, to, comment);
    return text(`Email forwarded to ${to.map((r) => r.email).join(", ")}`);
  },

  async get_message_status(args) {
    const { messageId, userId } = args as {
      messageId: string;
      userId: string;
    };
    const client = getAppClient();
    const status = await client.getMessageStatus(messageId, userId);
    if (status === null) {
      return text("Message not found");
    }
    return text(`isRead: ${status.isRead}, flagStatus: ${status.flagStatus}`);
  },

  // ========== M365 GROUP TOOLS ==========

  async list_groups() {
    const client = getGroupsClient();
    const groups = await client.listGroups();
    if (groups.length === 0) {
      return text("No groups found");
    }
    const groupList = groups
      .map((g) => `- ${g.displayName}\n  ID: ${g.id}`)
      .join("\n");
    return text(`${groups.length} groups found:\n\n${groupList}`);
  },

  async get_group_conversations(args) {
    const { groupId, limit, since } = args as {
      groupId: string;
      limit?: number;
      since?: string;
    };
    const client = getGroupsClient();
    const conversations = await client.getGroupConversations(groupId, {
      top: limit,
      since: since ? new Date(since) : undefined,
    });
    if (conversations.length === 0) {
      return text("No conversations found");
    }
    const convList = conversations
      .map(
        (c) => `- ${c.topic}\n  Last: ${c.lastDeliveredDateTime}\n  ID: ${c.id}`
      )
      .join("\n\n");
    return text(`${conversations.length} conversations:\n\n${convList}`);
  },

  async get_group_conversation(args) {
    const { groupId, conversationId, includeAttachments } = args as {
      groupId: string;
      conversationId: string;
      includeAttachments?: boolean;
    };
    const client = getGroupsClient();
    const conversation = await client.getFullConversation(
      groupId,
      conversationId,
      includeAttachments ?? false
    );

    const lines = [
      `**Topic:** ${conversation.topic}`,
      `**Last Updated:** ${conversation.lastDeliveredDateTime}`,
      `**Has Attachments:** ${conversation.hasAttachments}`,
      "",
    ];

    for (const thread of conversation.threads) {
      lines.push(`## Thread: ${thread.topic || "(no topic)"}`);
      for (const post of thread.posts) {
        lines.push(
          `### From: ${post.from.name || post.from.address} (${post.receivedDateTime})`
        );
        lines.push(post.bodyContent);
        if (post.attachments && post.attachments.length > 0) {
          lines.push("\n**Attachments:**");
          for (const att of post.attachments) {
            lines.push(`- ${att.name} (${att.contentType}, ${att.size} bytes)`);
          }
        }
        lines.push("");
      }
    }

    return text(lines.join("\n"));
  },

  async search_group_conversations(args) {
    const { groupId, query, limit } = args as {
      groupId: string;
      query: string;
      limit?: number;
    };
    const client = getGroupsClient();
    const conversations = await client.getGroupConversations(groupId, {
      top: limit ?? 20,
    });

    const queryLower = query.toLowerCase();
    const matches = conversations.filter((c) =>
      c.topic.toLowerCase().includes(queryLower)
    );

    if (matches.length === 0) {
      return text(`No conversations found matching "${query}"`);
    }

    const convList = matches
      .map(
        (c) => `- ${c.topic}\n  Last: ${c.lastDeliveredDateTime}\n  ID: ${c.id}`
      )
      .join("\n\n");
    return text(
      `${matches.length} conversations matching "${query}":\n\n${convList}`
    );
  },
};

/**
 * Handler for MCP CallTool requests.
 *
 * Routes tool calls to the appropriate handler function based on tool name.
 * All handlers return MCP-formatted responses with `content` array containing
 * text results. Errors are caught and returned with `isError: true`.
 */
server.setRequestHandler(
  CallToolRequestSchema,
  // @ts-expect-error MCP SDK type mismatch - handler works correctly at runtime
  async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];

    if (!handler) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      return await handler(args ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Start Server
// ============================================================================

/**
 * Initialize and start the MCP server.
 *
 * Uses stdio transport for communication with Claude Code. The server
 * listens on stdin for MCP requests and writes responses to stdout.
 * Diagnostic messages are written to stderr (e.g., startup confirmation).
 */
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Desert Email MCP server started");
