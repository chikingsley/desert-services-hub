/**
 * Read email functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import config from "@outlook/config";
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
 * Arguments for read email handler
 */
interface ReadEmailArgs {
  id?: string;
  mailbox?: string;
}

/**
 * Email address structure from Graph API
 */
interface EmailAddress {
  address: string;
  name: string;
}

/**
 * Email recipient structure from Graph API
 */
interface EmailRecipient {
  emailAddress: EmailAddress;
}

/**
 * Email body structure from Graph API
 */
interface EmailBody {
  content: string;
  contentType: "html" | "text";
}

/**
 * Full email structure from Graph API
 */
interface GraphEmailDetail {
  bccRecipients?: EmailRecipient[];
  body?: EmailBody;
  bodyPreview?: string;
  ccRecipients?: EmailRecipient[];
  conversationId?: string;
  from?: { emailAddress: EmailAddress };
  hasAttachments: boolean;
  id: string;
  importance?: string;
  isRead: boolean;
  receivedDateTime: string;
  subject: string;
  toRecipients?: EmailRecipient[];
}

function formatRecipients(recipients: EmailRecipient[] | undefined): string {
  if (!recipients || recipients.length === 0) {
    return "None";
  }
  return recipients
    .map((r) => `${r.emailAddress.name} (${r.emailAddress.address})`)
    .join(", ");
}

function formatEmailBody(email: GraphEmailDetail): string {
  if (email.body) {
    return email.body.contentType === "html"
      ? email.body.content.replace(/<[^>]*>/g, "")
      : email.body.content;
  }
  return email.bodyPreview ?? "No content";
}

function formatGraphError(errorMessage: string): MCPResponse {
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
  return {
    content: [{ type: "text", text: `Failed to read email: ${errorMessage}` }],
    isError: true,
  };
}

/**
 * Read email handler
 * @param args - Tool arguments
 * @returns MCP response
 */
export async function handleReadEmail(
  args: ReadEmailArgs
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
      content: [{ type: "text", text: "Email ID is required." }],
      isError: true,
    };
  }

  let accessToken: string;
  try {
    accessToken = await ensureAuthenticated();
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
        { type: "text", text: `Error accessing email: ${errorMessage}` },
      ],
      isError: true,
    };
  }

  try {
    const endpoint = `users/${mailbox}/messages/${emailId}`;
    const email = (await callGraphAPI(accessToken, "GET", endpoint, null, {
      $select: config.EMAIL_DETAIL_FIELDS,
    })) as GraphEmailDetail | null;

    if (!email) {
      return {
        content: [
          { type: "text", text: `Email with ID ${emailId} not found.` },
        ],
      };
    }

    const sender = email.from
      ? `${email.from.emailAddress.name} (${email.from.emailAddress.address})`
      : "Unknown";
    const to = formatRecipients(email.toRecipients);
    const cc = formatRecipients(email.ccRecipients);
    const bcc = formatRecipients(email.bccRecipients);
    const date = new Date(email.receivedDateTime).toLocaleString();
    const body = formatEmailBody(email);

    const formattedEmail = `From: ${sender}
To: ${to}
${cc !== "None" ? `CC: ${cc}\n` : ""}${bcc !== "None" ? `BCC: ${bcc}\n` : ""}Subject: ${email.subject}
Date: ${date}
Importance: ${email.importance ?? "normal"}
Has Attachments: ${email.hasAttachments ? "Yes" : "No"}
${email.conversationId ? `Conversation ID: ${email.conversationId}\n` : ""}
${body}`;

    return { content: [{ type: "text", text: formattedEmail }] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error reading email: ${errorMessage}`);
    return formatGraphError(errorMessage);
  }
}

export default handleReadEmail;
