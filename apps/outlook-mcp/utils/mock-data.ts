/**
 * Mock data functions for test mode
 */
import type {
  EmailMessage,
  GraphApiListResponse,
  GraphApiQueryParams,
  HttpMethod,
  MailFolder,
} from "@outlook/types";

/**
 * Single email response for testing
 */
function getMockSingleEmail(): EmailMessage {
  return {
    id: "simulated-email-id",
    subject: "Simulated Email Subject",
    from: {
      emailAddress: {
        name: "Simulated Sender",
        address: "sender@example.com",
      },
    },
    toRecipients: [
      {
        emailAddress: {
          name: "Recipient Name",
          address: "recipient@example.com",
        },
      },
    ],
    ccRecipients: [],
    bccRecipients: [],
    receivedDateTime: new Date().toISOString(),
    bodyPreview: "This is a simulated email preview...",
    body: {
      contentType: "text",
      content:
        "This is the full content of the simulated email. Since we can't connect to the real Microsoft Graph API, we're returning this placeholder content instead.",
    },
    hasAttachments: false,
    importance: "normal",
    isRead: false,
    internetMessageHeaders: [],
  };
}

/**
 * Email list response for testing
 */
function getMockEmailList(): GraphApiListResponse<EmailMessage> {
  return {
    value: [
      {
        id: "simulated-email-1",
        subject: "Important Meeting Tomorrow",
        from: {
          emailAddress: {
            name: "John Doe",
            address: "john@example.com",
          },
        },
        toRecipients: [
          {
            emailAddress: {
              name: "You",
              address: "you@example.com",
            },
          },
        ],
        ccRecipients: [],
        receivedDateTime: new Date().toISOString(),
        bodyPreview: "Let's discuss the project status...",
        hasAttachments: false,
        importance: "high",
        isRead: false,
      },
      {
        id: "simulated-email-2",
        subject: "Weekly Report",
        from: {
          emailAddress: {
            name: "Jane Smith",
            address: "jane@example.com",
          },
        },
        toRecipients: [
          {
            emailAddress: {
              name: "You",
              address: "you@example.com",
            },
          },
        ],
        ccRecipients: [],
        receivedDateTime: new Date(Date.now() - 86_400_000).toISOString(), // Yesterday
        bodyPreview: "Please find attached the weekly report...",
        hasAttachments: true,
        importance: "normal",
        isRead: true,
      },
      {
        id: "simulated-email-3",
        subject: "Question about the project",
        from: {
          emailAddress: {
            name: "Bob Johnson",
            address: "bob@example.com",
          },
        },
        toRecipients: [
          {
            emailAddress: {
              name: "You",
              address: "you@example.com",
            },
          },
        ],
        ccRecipients: [],
        receivedDateTime: new Date(Date.now() - 172_800_000).toISOString(), // 2 days ago
        bodyPreview: "I had a question about the timeline...",
        hasAttachments: false,
        importance: "normal",
        isRead: false,
      },
    ],
  };
}

/**
 * Mail folders response for testing
 */
function getMockMailFolders(): GraphApiListResponse<MailFolder> {
  return {
    value: [
      { id: "inbox", displayName: "Inbox" },
      { id: "drafts", displayName: "Drafts" },
      { id: "sentItems", displayName: "Sent Items" },
      { id: "deleteditems", displayName: "Deleted Items" },
    ],
  };
}

/**
 * Simulates Microsoft Graph API responses for testing
 * @param method - HTTP method
 * @param path - API path
 * @param _data - Request data (unused in mock)
 * @param _queryParams - Query parameters (unused in mock)
 * @returns Simulated API response
 */
export function simulateGraphAPIResponse(
  method: HttpMethod,
  path: string,
  _data: unknown,
  _queryParams: GraphApiQueryParams
): unknown {
  console.error(`Simulating response for: ${method} ${path}`);

  if (method === "GET") {
    if (path.includes("messages") && !path.includes("sendMail")) {
      // Simulate a successful email list/search response
      if (path.includes("/messages/")) {
        // Single email response
        return getMockSingleEmail();
      }
      // Email list response
      return getMockEmailList();
    }

    if (path.includes("mailFolders")) {
      // Simulate a mail folders response
      return getMockMailFolders();
    }
  }

  if (method === "POST" && path.includes("sendMail")) {
    // Simulate a successful email send
    return {};
  }

  // If we get here, we don't have a simulation for this endpoint
  console.error(`No simulation available for: ${method} ${path}`);
  return {};
}
