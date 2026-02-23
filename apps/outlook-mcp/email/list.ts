/**
 * List emails functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import config from "@outlook/config";
import { resolveFolderPath } from "@outlook/email/folder-utils";
import { callGraphAPIPaginated } from "@outlook/utils/graph-api";

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
 * Arguments for list emails handler
 */
interface ListEmailsArgs {
  count?: number;
  folder?: string;
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
 * Email from structure from Graph API
 */
interface EmailFrom {
  emailAddress: EmailAddress;
}

/**
 * Email structure from Graph API
 */
interface GraphEmail {
  from?: EmailFrom;
  id: string;
  isRead: boolean;
  receivedDateTime: string;
  subject: string;
}

/**
 * Graph API paginated response
 */
interface GraphPaginatedResponse {
  "@odata.count"?: number;
  value: GraphEmail[];
}

/**
 * List emails handler
 * @param args - Tool arguments
 * @returns MCP response
 */
export async function handleListEmails(
  args: ListEmailsArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const folder = args.folder ?? "inbox";
  const requestedCount = args.count ?? 10;

  try {
    // Get access token
    const accessToken = await ensureAuthenticated();

    // Resolve the folder path
    const endpoint = await resolveFolderPath(accessToken, folder, mailbox);

    // Add query parameters
    const queryParams = {
      $top: Math.min(50, requestedCount), // Use 50 per page for efficiency
      $orderby: "receivedDateTime desc",
      $select: config.EMAIL_SELECT_FIELDS,
    };

    // Make API call with pagination support
    const response = (await callGraphAPIPaginated(
      accessToken,
      "GET",
      endpoint,
      queryParams,
      requestedCount
    )) as GraphPaginatedResponse;

    if (!response.value || response.value.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No emails found in ${folder}.`,
          },
        ],
      };
    }

    // Format results
    const emailList = response.value
      .map((email, index) => {
        const sender = email.from
          ? email.from.emailAddress
          : { name: "Unknown", address: "unknown" };
        const date = new Date(email.receivedDateTime).toLocaleString();
        const readStatus = email.isRead ? "" : "[UNREAD] ";

        return `${index + 1}. ${readStatus}${date} - From: ${sender.name} (${sender.address})\nSubject: ${email.subject}\nID: ${email.id}\n`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${response.value.length} emails in ${folder}:\n\n${emailList}`,
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
          text: `Error listing emails: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

export default handleListEmails;
