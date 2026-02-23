/**
 * Draft email management — create, update, and send drafts
 *
 * Graph API endpoints:
 *   POST   /users/{mailbox}/messages           → create draft
 *   PATCH  /users/{mailbox}/messages/{id}       → update draft
 *   POST   /users/{mailbox}/messages/{id}/send  → send draft
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

interface GraphRecipient {
  emailAddress: { address: string };
}

function parseRecipients(csv: string): GraphRecipient[] {
  return csv.split(",").map((email) => ({
    emailAddress: { address: email.trim() },
  }));
}

// ── create-draft ────────────────────────────────────────────────

interface CreateDraftArgs {
  bcc?: string;
  body?: string;
  cc?: string;
  importance?: "normal" | "high" | "low";
  mailbox?: string;
  subject?: string;
  to?: string;
}

export async function handleCreateDraft(
  args: CreateDraftArgs
): Promise<MCPResponse> {
  const { mailbox } = args;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  if (!isWritableMailbox(mailbox)) {
    return {
      content: [
        {
          type: "text",
          text: `Creating drafts is not allowed in ${mailbox}. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  const { to, cc, bcc, subject, body, importance = "normal" } = args;

  try {
    const accessToken = await ensureAuthenticated();

    const draft: Record<string, unknown> = {
      subject: subject ?? "",
      importance,
      body: {
        contentType: body?.includes("<html") ? "html" : "text",
        content: body ?? "",
      },
    };

    if (to) {
      draft.toRecipients = parseRecipients(to);
    }
    if (cc) {
      draft.ccRecipients = parseRecipients(cc);
    }
    if (bcc) {
      draft.bccRecipients = parseRecipients(bcc);
    }

    const result = await callGraphAPI<{ id: string; subject: string }>(
      accessToken,
      "POST",
      `users/${mailbox}/messages`,
      draft
    );

    return {
      content: [
        {
          type: "text",
          text: `Draft created successfully.\n\nDraft ID: ${result.id}\nSubject: ${result.subject ?? "(no subject)"}`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
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
      content: [{ type: "text", text: `Error creating draft: ${msg}` }],
      isError: true,
    };
  }
}

// ── update-draft ────────────────────────────────────────────────

interface UpdateDraftArgs {
  bcc?: string;
  body?: string;
  cc?: string;
  id?: string;
  importance?: "normal" | "high" | "low";
  mailbox?: string;
  subject?: string;
  to?: string;
}

export async function handleUpdateDraft(
  args: UpdateDraftArgs
): Promise<MCPResponse> {
  const { mailbox, id } = args;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }
  if (!id) {
    return {
      content: [{ type: "text", text: "Draft message ID is required." }],
      isError: true,
    };
  }

  if (!isWritableMailbox(mailbox)) {
    return {
      content: [
        {
          type: "text",
          text: `Updating drafts is not allowed in ${mailbox}. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  const { to, cc, bcc, subject, body, importance } = args;

  try {
    const accessToken = await ensureAuthenticated();

    const patch: Record<string, unknown> = {};
    if (subject !== undefined) {
      patch.subject = subject;
    }
    if (importance !== undefined) {
      patch.importance = importance;
    }
    if (body !== undefined) {
      patch.body = {
        contentType: body.includes("<html") ? "html" : "text",
        content: body,
      };
    }
    if (to) {
      patch.toRecipients = parseRecipients(to);
    }
    if (cc) {
      patch.ccRecipients = parseRecipients(cc);
    }
    if (bcc) {
      patch.bccRecipients = parseRecipients(bcc);
    }

    await callGraphAPI(
      accessToken,
      "PATCH",
      `users/${mailbox}/messages/${id}`,
      patch
    );

    return {
      content: [
        {
          type: "text",
          text: `Draft ${id} updated successfully.`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
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
      content: [{ type: "text", text: `Error updating draft: ${msg}` }],
      isError: true,
    };
  }
}

// ── send-draft ──────────────────────────────────────────────────

interface SendDraftArgs {
  id?: string;
  mailbox?: string;
}

export async function handleSendDraft(
  args: SendDraftArgs
): Promise<MCPResponse> {
  const { mailbox, id } = args;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }
  if (!id) {
    return {
      content: [{ type: "text", text: "Draft message ID is required." }],
      isError: true,
    };
  }

  if (!isWritableMailbox(mailbox)) {
    return {
      content: [
        {
          type: "text",
          text: `Sending is not allowed from ${mailbox}. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const accessToken = await ensureAuthenticated();

    await callGraphAPI(
      accessToken,
      "POST",
      `users/${mailbox}/messages/${id}/send`
    );

    return {
      content: [{ type: "text", text: `Draft ${id} sent successfully.` }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
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
      content: [{ type: "text", text: `Error sending draft: ${msg}` }],
      isError: true,
    };
  }
}

// ── Tool definitions ────────────────────────────────────────────

export const draftTools: ToolDefinition[] = [
  {
    name: "create-draft",
    description:
      "Creates a new draft email in the mailbox. Use this to compose emails safely before sending. Returns the draft ID which can be used with send-draft.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        to: {
          type: "string",
          description: "Comma-separated recipient email addresses",
        },
        cc: {
          type: "string",
          description: "Comma-separated CC email addresses",
        },
        bcc: {
          type: "string",
          description: "Comma-separated BCC email addresses",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body (plain text or HTML)",
        },
        importance: {
          type: "string",
          description: "Email importance",
          enum: ["normal", "high", "low"],
        },
      },
      required: ["mailbox"],
      additionalProperties: false,
    },
    handler: handleCreateDraft as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "update-draft",
    description:
      "Updates an existing draft email. Only provide fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the draft message to update",
        },
        to: {
          type: "string",
          description: "Comma-separated recipient email addresses",
        },
        cc: {
          type: "string",
          description: "Comma-separated CC email addresses",
        },
        bcc: {
          type: "string",
          description: "Comma-separated BCC email addresses",
        },
        subject: {
          type: "string",
          description: "New email subject",
        },
        body: {
          type: "string",
          description: "New email body (plain text or HTML)",
        },
        importance: {
          type: "string",
          description: "Email importance",
          enum: ["normal", "high", "low"],
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleUpdateDraft as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "send-draft",
    description:
      "Sends an existing draft email. The draft must have recipients set.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the draft message to send",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleSendDraft as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];
