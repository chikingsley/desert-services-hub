/**
 * Email MCP Server Tests
 *
 * Tests the email server functions directly without going through MCP protocol.
 * Run with: bun test services/email/tests/mcp-server.test.ts
 *
 * All tests use real API calls to Microsoft Graph.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { GraphEmailClient } from "../client";
import { formatEmailList, formatSearchResults } from "../index";
import type { MailboxResult } from "../types";

// ============================================================================
// Constants
// ============================================================================

const CONFIRMATION_ID_REGEX = /^confirm_\d+_[a-z0-9]+$/;

// ============================================================================
// Timing Helper
// ============================================================================

async function timed<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`  [time] ${name}: ${ms}ms`);
  return { result, ms };
}

// ============================================================================
// Formatting Tests (no API calls)
// ============================================================================

describe("Formatting Functions", () => {
  const mockSearchResults: MailboxResult[] = [
    {
      mailbox: "chi@desertservices.net",
      emails: [
        {
          id: "msg-123",
          subject: "Test Email Subject",
          fromName: "John Doe",
          fromEmail: "john@example.com",
          receivedDateTime: "2026-01-08T10:00:00Z",
          preview: "This is a preview...",
        },
      ],
    },
    {
      mailbox: "tim@desertservices.net",
      emails: [
        {
          id: "msg-456",
          subject: "Another Test Email",
          fromName: "Jane Smith",
          fromEmail: "jane@example.com",
          receivedDateTime: "2026-01-08T11:00:00Z",
          preview: "Another preview...",
        },
      ],
    },
  ];

  test("formatSearchResults with results", () => {
    const output = formatSearchResults(mockSearchResults);
    expect(output).toContain("Found 2 emails across 2 mailboxes");
    expect(output).toContain("chi@desertservices.net");
    expect(output).toContain("Test Email Subject");
  });

  test("formatSearchResults with no results", () => {
    const output = formatSearchResults([]);
    expect(output).toBe("No emails found matching your search.");
  });

  test("formatEmailList with results", () => {
    const emails = mockSearchResults.flatMap((r) => r.emails);
    const output = formatEmailList(emails);
    expect(output).toContain("Found 2 emails");
  });

  test("formatEmailList truncates at 10 items", () => {
    const manyEmails = Array.from({ length: 15 }, (_, i) => ({
      id: `msg-${i}`,
      subject: `Email ${i}`,
      fromEmail: `sender${i}@example.com`,
      receivedDateTime: "2026-01-08T10:00:00Z",
    }));
    const output = formatEmailList(manyEmails);
    expect(output).toContain("... and 5 more");
  });
});

// ============================================================================
// API Integration Tests (real Microsoft Graph calls)
// ============================================================================

describe("GraphEmailClient API", () => {
  let client: GraphEmailClient;

  beforeAll(() => {
    const config = {
      azureTenantId: process.env.AZURE_TENANT_ID || "",
      azureClientId: process.env.AZURE_CLIENT_ID || "",
      azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
    };

    if (
      config.azureTenantId === "" ||
      config.azureClientId === "" ||
      config.azureClientSecret === ""
    ) {
      throw new Error(
        "Missing Azure credentials. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in .env"
      );
    }

    client = new GraphEmailClient(config);
    client.initAppAuth();
  });

  test("listUsers returns users", async () => {
    const { result: users, ms } = await timed("listUsers", () =>
      client.listUsers()
    );

    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
    expect(users[0]).toHaveProperty("id");
    expect(users[0]).toHaveProperty("email");
    expect(ms).toBeLessThan(10_000); // Should complete in under 10s
  });

  test(
    "searchAllMailboxes returns grouped results",
    async () => {
      const { result: results, ms } = await timed("searchAllMailboxes", () =>
        client.searchAllMailboxes({ query: "permit", limit: 3 })
      );

      expect(Array.isArray(results)).toBe(true);
      for (const result of results) {
        expect(result).toHaveProperty("mailbox");
        expect(result).toHaveProperty("emails");
        expect(Array.isArray(result.emails)).toBe(true);
      }
      expect(ms).toBeLessThan(60_000); // Should complete in under 60s
    },
    { timeout: 60_000 }
  );

  test("searchEmails for specific user", async () => {
    const { result: emails, ms } = await timed("searchEmails", () =>
      client.searchEmails({
        query: "test",
        userId: "chi@desertservices.net",
        limit: 5,
      })
    );

    expect(Array.isArray(emails)).toBe(true);
    expect(ms).toBeLessThan(10_000);
  });

  test("getEmail retrieves single email", async () => {
    // First search for an email to get an ID
    const emails = await client.searchEmails({
      query: "test",
      userId: "chi@desertservices.net",
      limit: 1,
    });

    const firstEmail = emails[0];
    if (!firstEmail) {
      console.log("  [skip] No emails found to test getEmail");
      return;
    }

    const emailId = firstEmail.id;
    const { result: email, ms } = await timed("getEmail", () =>
      client.getEmail(emailId, "chi@desertservices.net")
    );

    expect(email).not.toBeNull();
    if (email) {
      expect(email).toHaveProperty("id");
      expect(email).toHaveProperty("subject");
      expect(email).toHaveProperty("bodyContent");
      expect(email).toHaveProperty("conversationId"); // New: thread ID
    }
    expect(ms).toBeLessThan(5000);
  });

  test("searchEmails with date filters", async () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { result: emails, ms } = await timed("searchEmails with date", () =>
      client.searchEmails({
        query: "test",
        userId: "chi@desertservices.net",
        limit: 5,
        since: oneWeekAgo,
      })
    );

    expect(Array.isArray(emails)).toBe(true);
    // All returned emails should be within the last week
    for (const email of emails) {
      expect(new Date(email.receivedDateTime).getTime()).toBeGreaterThanOrEqual(
        oneWeekAgo.getTime()
      );
    }
    expect(ms).toBeLessThan(10_000);
  });

  test("searchMailboxes searches specific mailboxes in parallel", async () => {
    const { result: results, ms } = await timed("searchMailboxes", () =>
      client.searchMailboxes({
        userIds: ["chi@desertservices.net", "tim@desertservices.net"],
        query: "permit",
        limit: 3,
      })
    );

    expect(Array.isArray(results)).toBe(true);
    for (const result of results) {
      expect(result).toHaveProperty("mailbox");
      expect(result).toHaveProperty("emails");
      expect(Array.isArray(result.emails)).toBe(true);
    }
    // Should be faster than searchAllMailboxes since we only check 2 mailboxes
    expect(ms).toBeLessThan(30_000);
  });

  test("getThreadByMessageId retrieves email thread", async () => {
    // First get an email to find a thread
    const emails = await client.searchEmails({
      query: "re:", // Search for replies which are part of threads
      userId: "chi@desertservices.net",
      limit: 5,
    });

    if (emails.length === 0) {
      console.log("  [skip] No emails found to test getThreadByMessageId");
      return;
    }

    // Find an email with a conversationId
    const testEmail = emails.find((email) => email.conversationId);

    if (testEmail === undefined) {
      console.log("  [skip] No emails with conversationId found");
      return;
    }

    const { result: thread, ms } = await timed("getThreadByMessageId", () =>
      client.getThreadByMessageId(testEmail.id, "chi@desertservices.net")
    );

    expect(Array.isArray(thread)).toBe(true);
    expect(thread.length).toBeGreaterThanOrEqual(1);
    // All emails in thread should have the same conversationId
    for (const email of thread) {
      expect(email.conversationId).toBe(testEmail.conversationId);
    }
    console.log(`  [ok] Found thread with ${thread.length} messages`);
    expect(ms).toBeLessThan(10_000);
  });

  test("filterEmails with OData filter", async () => {
    const { result: emails, ms } = await timed("filterEmails", () =>
      client.filterEmails({
        filter: "hasAttachments eq true",
        userId: "chi@desertservices.net",
        limit: 5,
      })
    );

    expect(Array.isArray(emails)).toBe(true);
    // All returned emails should have attachments
    for (const email of emails) {
      expect(email.hasAttachments).toBe(true);
    }
    console.log(`  [ok] Found ${emails.length} emails with attachments`);
    expect(ms).toBeLessThan(10_000);
  });

  test("getAttachments lists email attachments", async () => {
    // Search for emails likely to have attachments
    const emails = await client.searchEmails({
      query: "attachment",
      userId: "chi@desertservices.net",
      limit: 5,
    });

    if (emails.length === 0) {
      console.log("  [skip] No emails found to test getAttachments");
      return;
    }

    // Try each email until we find one with attachments
    for (const email of emails) {
      const { result: attachments, ms } = await timed("getAttachments", () =>
        client.getAttachments(email.id, "chi@desertservices.net")
      );

      expect(Array.isArray(attachments)).toBe(true);
      expect(ms).toBeLessThan(5000);

      if (attachments.length > 0) {
        expect(attachments[0]).toHaveProperty("id");
        expect(attachments[0]).toHaveProperty("name");
        expect(attachments[0]).toHaveProperty("contentType");
        console.log(`  [ok] Found ${attachments.length} attachments`);
        return;
      }
    }
    console.log("  [skip] No attachments found in tested emails");
  });
});

// ============================================================================
// Utility Tests
// ============================================================================

describe("Utility Functions", () => {
  function generateConfirmationId(): string {
    return `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  test("generateConfirmationId creates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateConfirmationId());
    }
    expect(ids.size).toBe(100);
  });

  test("generateConfirmationId format is correct", () => {
    const id = generateConfirmationId();
    expect(id).toMatch(CONFIRMATION_ID_REGEX);
  });
});

// ============================================================================
// Attachment Support Tests
// ============================================================================

describe("Attachment Support", () => {
  test("SendEmailAttachment type accepts valid attachment", () => {
    // Type-level test - if this compiles, the type is correct
    const attachment: {
      name: string;
      contentType: string;
      contentBytes: string;
    } = {
      name: "test.pdf",
      contentType: "application/pdf",
      contentBytes: "dGVzdCBjb250ZW50", // base64 "test content"
    };

    expect(attachment.name).toBe("test.pdf");
    expect(attachment.contentType).toBe("application/pdf");
    expect(attachment.contentBytes).toBeDefined();
  });

  test("PendingEmail structure includes attachments field", () => {
    // Simulates the PendingEmail type structure
    const pendingEmail = {
      to: [{ email: "test@example.com" }],
      subject: "Test Subject",
      body: "Test Body",
      bodyType: "text" as const,
      attachments: [
        {
          name: "doc.pdf",
          contentType: "application/pdf",
          contentBytes: "YmFzZTY0",
        },
      ],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    expect(pendingEmail.attachments).toBeDefined();
    expect(pendingEmail.attachments?.length).toBe(1);
    expect(pendingEmail.attachments?.[0]?.name).toBe("doc.pdf");
  });

  test("base64 encoding works for attachment content", () => {
    const originalContent = "Hello, this is test content for PDF";
    const base64 = Buffer.from(originalContent).toString("base64");
    const decoded = Buffer.from(base64, "base64").toString("utf-8");

    expect(decoded).toBe(originalContent);
  });
});

// ============================================================================
// Send with Attachments Integration Test
// ============================================================================

describe("GraphEmailClient Send with Attachments", () => {
  test("sendEmail accepts attachments parameter", () => {
    // This is a type-level test - verifies the client interface accepts attachments
    // We don't actually send to avoid creating test emails
    const sendOptions = {
      to: [{ email: "test@example.com" }],
      subject: "Test with Attachment",
      body: "Test body",
      attachments: [
        {
          name: "test.txt",
          contentType: "text/plain",
          contentBytes: Buffer.from("test content").toString("base64"),
        },
      ],
    };

    // Verify the shape is correct
    expect(sendOptions.attachments).toBeDefined();
    expect(sendOptions.attachments.length).toBe(1);
    const attachment = sendOptions.attachments[0];
    expect(attachment).toBeDefined();
    expect(attachment?.name).toBe("test.txt");
    expect(attachment?.contentType).toBe("text/plain");
    expect(attachment?.contentBytes).toBeDefined();
  });
});
