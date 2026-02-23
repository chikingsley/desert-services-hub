/**
 * Reply and forward email operations
 *
 * Graph API endpoints:
 *   POST /users/{mailbox}/messages/{id}/reply          → send reply
 *   POST /users/{mailbox}/messages/{id}/replyAll        → send reply-all
 *   POST /users/{mailbox}/messages/{id}/forward         → send forward
 *   POST /users/{mailbox}/messages/{id}/createReply     → draft reply
 *   POST /users/{mailbox}/messages/{id}/createForward   → draft forward
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import {
  formatWritableMailboxes,
  isWritableMailbox,
} from "@outlook/config/mailbox-permissions";
import { callGraphAPI } from "@outlook/utils/graph-api";

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
      { type: string; description: string; enum?: string[] }
    >;
    required: string[];
    additionalProperties?: boolean;
  };
  name: string;
}

function errorResponse(msg: string): MCPResponse {
  return { content: [{ type: "text", text: msg }], isError: true };
}

function authRequiredResponse(): MCPResponse {
  return errorResponse(
    "Authentication required. Please use the 'authenticate' tool first."
  );
}

// ── reply ───────────────────────────────────────────────────────

interface ReplyArgs {
  comment?: string;
  id?: string;
  mailbox?: string;
}

export async function handleReply(args: ReplyArgs): Promise<MCPResponse> {
  const { mailbox, id, comment } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }
  if (!comment) {
    return errorResponse("Reply comment/body is required.");
  }

  if (!isWritableMailbox(mailbox)) {
    return errorResponse(
      `Sending is not allowed from ${mailbox}. Allowed: ${formatWritableMailboxes()}`
    );
  }

  try {
    const accessToken = await ensureAuthenticated();
    await callGraphAPI(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${id}/reply`,
      { comment }
    );
    return {
      content: [{ type: "text", text: "Reply sent successfully." }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error sending reply: ${msg}`);
  }
}

// ── reply-all ───────────────────────────────────────────────────

export async function handleReplyAll(args: ReplyArgs): Promise<MCPResponse> {
  const { mailbox, id, comment } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }
  if (!comment) {
    return errorResponse("Reply comment/body is required.");
  }

  if (!isWritableMailbox(mailbox)) {
    return errorResponse(
      `Sending is not allowed from ${mailbox}. Allowed: ${formatWritableMailboxes()}`
    );
  }

  try {
    const accessToken = await ensureAuthenticated();
    await callGraphAPI(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${id}/replyAll`,
      { comment }
    );
    return {
      content: [{ type: "text", text: "Reply-all sent successfully." }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error sending reply-all: ${msg}`);
  }
}

// ── forward ─────────────────────────────────────────────────────

interface ForwardArgs {
  comment?: string;
  id?: string;
  mailbox?: string;
  to?: string;
}

export async function handleForward(args: ForwardArgs): Promise<MCPResponse> {
  const { mailbox, id, to, comment } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }
  if (!to) {
    return errorResponse("Recipient (to) is required for forwarding.");
  }

  if (!isWritableMailbox(mailbox)) {
    return errorResponse(
      `Sending is not allowed from ${mailbox}. Allowed: ${formatWritableMailboxes()}`
    );
  }

  try {
    const accessToken = await ensureAuthenticated();
    const toRecipients = to.split(",").map((email) => ({
      emailAddress: { address: email.trim() },
    }));
    await callGraphAPI(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${id}/forward`,
      { comment: comment ?? "", toRecipients }
    );
    return {
      content: [
        { type: "text", text: `Email forwarded to ${to} successfully.` },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error forwarding email: ${msg}`);
  }
}

// ── create-reply-draft ──────────────────────────────────────────

interface CreateReplyDraftArgs {
  comment?: string;
  id?: string;
  mailbox?: string;
}

export async function handleCreateReplyDraft(
  args: CreateReplyDraftArgs
): Promise<MCPResponse> {
  const { mailbox, id, comment } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }

  if (!isWritableMailbox(mailbox)) {
    return errorResponse(
      `Creating drafts is not allowed in ${mailbox}. Allowed: ${formatWritableMailboxes()}`
    );
  }

  try {
    const accessToken = await ensureAuthenticated();
    const body: Record<string, unknown> = {};
    if (comment) {
      body.comment = comment;
    }

    const result = await callGraphAPI<{ id: string; subject: string }>(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${id}/createReply`,
      body
    );
    return {
      content: [
        {
          type: "text",
          text: `Reply draft created.\n\nDraft ID: ${result.id}\nSubject: ${result.subject ?? "(no subject)"}\n\nUse update-draft to edit, then send-draft to send.`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error creating reply draft: ${msg}`);
  }
}

// ── create-forward-draft ────────────────────────────────────────

interface CreateForwardDraftArgs {
  comment?: string;
  id?: string;
  mailbox?: string;
  to?: string;
}

export async function handleCreateForwardDraft(
  args: CreateForwardDraftArgs
): Promise<MCPResponse> {
  const { mailbox, id, to, comment } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }

  if (!isWritableMailbox(mailbox)) {
    return errorResponse(
      `Creating drafts is not allowed in ${mailbox}. Allowed: ${formatWritableMailboxes()}`
    );
  }

  try {
    const accessToken = await ensureAuthenticated();
    const body: Record<string, unknown> = {};
    if (comment) {
      body.comment = comment;
    }
    if (to) {
      body.toRecipients = to.split(",").map((email) => ({
        emailAddress: { address: email.trim() },
      }));
    }

    const result = await callGraphAPI<{ id: string; subject: string }>(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${id}/createForward`,
      body
    );
    return {
      content: [
        {
          type: "text",
          text: `Forward draft created.\n\nDraft ID: ${result.id}\nSubject: ${result.subject ?? "(no subject)"}\n\nUse update-draft to edit recipients/body, then send-draft to send.`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error creating forward draft: ${msg}`);
  }
}

// ── Tool definitions ────────────────────────────────────────────

export const replyForwardTools: ToolDefinition[] = [
  {
    name: "reply",
    description:
      "Sends a reply to a specific email. The reply is sent immediately to the original sender.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to reply to",
        },
        comment: {
          type: "string",
          description: "Reply body text (placed above the quoted original)",
        },
      },
      required: ["mailbox", "id", "comment"],
      additionalProperties: false,
    },
    handler: handleReply as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "reply-all",
    description:
      "Sends a reply-all to a specific email. The reply is sent immediately to all original recipients.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to reply-all to",
        },
        comment: {
          type: "string",
          description: "Reply body text (placed above the quoted original)",
        },
      },
      required: ["mailbox", "id", "comment"],
      additionalProperties: false,
    },
    handler: handleReplyAll as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "forward",
    description:
      "Forwards a specific email to new recipients. The email is sent immediately.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to forward",
        },
        to: {
          type: "string",
          description: "Comma-separated recipient email addresses",
        },
        comment: {
          type: "string",
          description:
            "Optional comment to include above the forwarded message",
        },
      },
      required: ["mailbox", "id", "to"],
      additionalProperties: false,
    },
    handler: handleForward as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "create-reply-draft",
    description:
      "Creates a draft reply to a specific email. The draft can be edited with update-draft and sent with send-draft. Safer than reply — lets you review before sending.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to reply to",
        },
        comment: {
          type: "string",
          description: "Optional initial reply text",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleCreateReplyDraft as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "create-forward-draft",
    description:
      "Creates a draft forward of a specific email. The draft can be edited with update-draft and sent with send-draft. Use to to pre-set recipients.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to forward",
        },
        to: {
          type: "string",
          description: "Comma-separated recipient email addresses",
        },
        comment: {
          type: "string",
          description:
            "Optional comment to include above the forwarded message",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleCreateForwardDraft as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];
