/**
 * Email thread/conversation retrieval
 *
 * Graph API approach:
 *   GET /users/{mailbox}/messages?$filter=conversationId eq '{id}'
 *
 * The conversationId groups messages in the same thread, similar to
 * Gmail's thread ID. Use read-email first to get the conversationId
 * from an email's headers, then use get-thread to pull all messages.
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import config from "@outlook/config";
import { callGraphAPIPaginated } from "@outlook/utils/graph-api";

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

interface GraphEmail {
  bodyPreview: string;
  from?: { emailAddress: { address: string; name: string } };
  id: string;
  isRead: boolean;
  receivedDateTime: string;
  subject: string;
}

function errorResponse(msg: string): MCPResponse {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// ── get-thread ──────────────────────────────────────────────────

interface GetThreadArgs {
  conversationId?: string;
  mailbox?: string;
}

export async function handleGetThread(
  args: GetThreadArgs
): Promise<MCPResponse> {
  const { mailbox, conversationId } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!conversationId) {
    return errorResponse("Conversation ID is required.");
  }

  try {
    const accessToken = await ensureAuthenticated();

    const response = await callGraphAPIPaginated<GraphEmail>(
      accessToken,
      "GET",
      `users/${mailbox}/messages`,
      {
        $filter: `conversationId eq '${conversationId}'`,
        $orderby: "receivedDateTime asc",
        $select: config.EMAIL_SELECT_FIELDS,
        $top: 50,
      },
      50
    );

    const messages = response.value ?? [];
    if (messages.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No messages found for this conversation ID.",
          },
        ],
      };
    }

    const lines = messages.map((email, i) => {
      const sender = email.from
        ? `${email.from.emailAddress.name} (${email.from.emailAddress.address})`
        : "Unknown";
      const date = new Date(email.receivedDateTime).toLocaleString();
      const readStatus = email.isRead ? "" : "[UNREAD] ";
      return `${i + 1}. ${readStatus}${date}\n   From: ${sender}\n   Subject: ${email.subject}\n   Preview: ${email.bodyPreview.slice(0, 150)}${email.bodyPreview.length > 150 ? "..." : ""}\n   ID: ${email.id}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `Thread: ${messages.length} message(s)\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return errorResponse(
        "Authentication required. Please use the 'authenticate' tool first."
      );
    }
    return errorResponse(`Error retrieving thread: ${msg}`);
  }
}

// ── Tool definitions ────────────────────────────────────────────

export const threadTools: ToolDefinition[] = [
  {
    name: "get-thread",
    description:
      "Retrieves all messages in an email conversation/thread. Use read-email first to get the conversationId, then pass it here to see the full thread history.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        conversationId: {
          type: "string",
          description:
            "Conversation ID from the email (found via read-email in the conversationId field)",
        },
      },
      required: ["mailbox", "conversationId"],
      additionalProperties: false,
    },
    handler: handleGetThread as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];
