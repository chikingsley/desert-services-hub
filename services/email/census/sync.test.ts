/**
 * Tests for Email Sync
 *
 * Tests the sync functionality including:
 * - Email fetching and storage
 * - Attachment metadata storage
 * - PDF upload to MinIO
 * - Upsert behavior (re-syncing same emails)
 * - Date filtering
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureBucket, fileExists, getFile, minioClient } from "@/lib/minio";
import { GraphEmailClient } from "../client";
import {
  db,
  getEmailByMessageId,
  getOrCreateMailbox,
  type InsertEmailData,
  insertEmail,
} from "./db";

// Test constants
const TEST_MAILBOX = "estimating@desertservices.net";
const EMAIL_ATTACHMENTS_BUCKET = "email-attachments";

// Create graph client for tests
function createTestClient(): GraphEmailClient {
  const client = new GraphEmailClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });
  client.initAppAuth();
  return client;
}

describe("Email Sync", () => {
  let client: GraphEmailClient;

  beforeAll(() => {
    client = createTestClient();
  });

  describe("Graph API Connection", () => {
    test("should connect to Graph API", async () => {
      // Simple test - fetch 1 email to verify connection
      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: "receivedDateTime ge 2025-01-01",
        limit: 1,
      });

      expect(Array.isArray(emails)).toBe(true);
    });
  });

  describe("Date Filtering", () => {
    test("should filter emails by date range", async () => {
      const after = new Date("2025-01-15");
      const before = new Date("2025-01-20");

      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: `receivedDateTime ge ${after.toISOString()} and receivedDateTime lt ${before.toISOString()}`,
        limit: 50,
      });

      // All emails should be within the date range
      for (const email of emails) {
        const receivedTime = email.receivedDateTime.getTime();
        expect(receivedTime).toBeGreaterThanOrEqual(after.getTime());
        expect(receivedTime).toBeLessThan(before.getTime());
      }
    });

    test("should filter emails after a specific date", async () => {
      const after = new Date("2025-01-20");

      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: `receivedDateTime ge ${after.toISOString()}`,
        limit: 10,
      });

      for (const email of emails) {
        expect(email.receivedDateTime.getTime()).toBeGreaterThanOrEqual(
          after.getTime()
        );
      }
    });

    test("should filter emails before a specific date", async () => {
      const before = new Date("2025-01-10");

      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: `receivedDateTime lt ${before.toISOString()}`,
        limit: 10,
      });

      for (const email of emails) {
        expect(email.receivedDateTime.getTime()).toBeLessThan(before.getTime());
      }
    });
  });

  describe("Email Body Content", () => {
    test("should fetch emails with HTML body content", async () => {
      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: "receivedDateTime ge 2025-01-01",
        limit: 5,
      });

      expect(emails.length).toBeGreaterThan(0);

      for (const email of emails) {
        // bodyContent should contain HTML
        expect(email.bodyContent).toBeDefined();
        expect(typeof email.bodyContent).toBe("string");
        // Most emails have some HTML
        if (email.bodyContent.length > 50) {
          expect(
            email.bodyContent.includes("<") ||
              email.bodyContent.includes("&nbsp;")
          ).toBe(true);
        }
      }
    });

    test("should preserve links in HTML body", async () => {
      // Find a BuildingConnected email which has action links
      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: "from/emailAddress/address eq 'team@buildingconnected.com'",
        limit: 1,
      });

      if (emails.length > 0) {
        const email = emails[0];
        // BuildingConnected emails have bid action links
        expect(email.bodyContent).toContain("href=");
      }
    });
  });

  describe("Attachment Metadata", () => {
    test("should fetch attachment list for emails with attachments", async () => {
      // Find an email with attachments
      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: "hasAttachments eq true",
        limit: 5,
      });

      expect(emails.length).toBeGreaterThan(0);

      const emailWithAttachments = emails[0];
      const attachments = await client.getAttachments(
        emailWithAttachments.id,
        TEST_MAILBOX
      );

      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments.length).toBeGreaterThan(0);

      // Check attachment structure
      const att = attachments[0];
      expect(att.id).toBeDefined();
      expect(att.name).toBeDefined();
      expect(typeof att.name).toBe("string");
    });

    test("should download PDF attachment as buffer", async () => {
      // Find an email with PDF attachment
      const emails = await client.filterEmails({
        userId: TEST_MAILBOX,
        filter: "hasAttachments eq true",
        limit: 20,
      });

      let pdfBuffer: Buffer | null = null;

      for (const email of emails) {
        const attachments = await client.getAttachments(email.id, TEST_MAILBOX);
        const pdfAttachment = attachments.find(
          (a) =>
            a.contentType === "application/pdf" ||
            a.name.toLowerCase().endsWith(".pdf")
        );

        if (pdfAttachment) {
          pdfBuffer = await client.downloadAttachment(
            email.id,
            pdfAttachment.id,
            TEST_MAILBOX
          );
          break;
        }
      }

      expect(pdfBuffer).not.toBeNull();
      if (pdfBuffer) {
        // PDF files start with %PDF
        expect(pdfBuffer.toString("utf8", 0, 4)).toBe("%PDF");
      }
    });
  });

  describe("Database Upsert", () => {
    test("should insert new email", () => {
      const testMessageId = `_TEST_${Date.now()}_${Math.random().toString(36)}`;
      const mailbox = getOrCreateMailbox(TEST_MAILBOX);

      const emailData: InsertEmailData = {
        messageId: testMessageId,
        mailboxId: mailbox.id,
        conversationId: null,
        subject: "Test Email",
        fromEmail: "test@example.com",
        fromName: "Test Sender",
        toEmails: [TEST_MAILBOX],
        ccEmails: [],
        receivedAt: new Date().toISOString(),
        hasAttachments: false,
        attachmentNames: [],
        bodyPreview: "Test body preview",
        bodyFull: "Test full body content",
      };

      const id = insertEmail(emailData);
      expect(id).toBeGreaterThan(0);

      // Verify it was inserted
      const retrieved = getEmailByMessageId(testMessageId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.subject).toBe("Test Email");

      // Cleanup
      db.run("DELETE FROM emails WHERE message_id = ?", [testMessageId]);
    });

    test("should update existing email on re-insert (upsert)", () => {
      const testMessageId = `_TEST_UPSERT_${Date.now()}`;
      const mailbox = getOrCreateMailbox(TEST_MAILBOX);

      // First insert
      const emailData1: InsertEmailData = {
        messageId: testMessageId,
        mailboxId: mailbox.id,
        conversationId: null,
        subject: "Original Subject",
        fromEmail: "test@example.com",
        fromName: "Test Sender",
        toEmails: [TEST_MAILBOX],
        ccEmails: [],
        receivedAt: new Date().toISOString(),
        hasAttachments: false,
        attachmentNames: [],
        bodyPreview: "Original preview",
        bodyFull: "Original full body",
      };

      insertEmail(emailData1);

      // Second insert with updated content
      const emailData2: InsertEmailData = {
        ...emailData1,
        subject: "Updated Subject",
        bodyFull: "Updated full body",
      };

      insertEmail(emailData2);

      // Verify it was updated, not duplicated
      const retrieved = getEmailByMessageId(testMessageId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.subject).toBe("Updated Subject");
      expect(retrieved?.bodyFull).toBe("Updated full body");

      // Check there's only one record
      const count = db
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) as count FROM emails WHERE message_id = ?"
        )
        .get(testMessageId);
      expect(count?.count).toBe(1);

      // Cleanup
      db.run("DELETE FROM emails WHERE message_id = ?", [testMessageId]);
    });
  });
});

describe("MinIO Email Attachments", () => {
  const TEST_EMAIL_ID = 999_999;
  const TEST_ATTACHMENT_ID = "test-att-id";
  const TEST_PDF_CONTENT = Buffer.from("%PDF-1.4 test email attachment");

  beforeAll(async () => {
    // Ensure bucket exists
    await ensureBucket(EMAIL_ATTACHMENTS_BUCKET);
  });

  test("should upload email attachment to MinIO", async () => {
    const objectKey = `${TEST_EMAIL_ID}/${TEST_ATTACHMENT_ID}/test-contract.pdf`;

    await minioClient.putObject(
      EMAIL_ATTACHMENTS_BUCKET,
      objectKey,
      TEST_PDF_CONTENT,
      TEST_PDF_CONTENT.length,
      { "Content-Type": "application/pdf" }
    );

    const exists = await fileExists(EMAIL_ATTACHMENTS_BUCKET, objectKey);
    expect(exists).toBe(true);
  });

  test("should retrieve email attachment from MinIO", async () => {
    const objectKey = `${TEST_EMAIL_ID}/${TEST_ATTACHMENT_ID}/test-contract.pdf`;

    const data = await getFile(EMAIL_ATTACHMENTS_BUCKET, objectKey);

    // getFile returns Uint8Array, convert to Buffer for comparison
    expect(Buffer.from(data).toString()).toBe(TEST_PDF_CONTENT.toString());
  });

  test("should organize attachments by email ID", async () => {
    // Upload attachments for different "emails"
    const email1Key = `${TEST_EMAIL_ID}/att1/doc1.pdf`;
    const email2Key = `${TEST_EMAIL_ID + 1}/att1/doc1.pdf`;

    await minioClient.putObject(
      EMAIL_ATTACHMENTS_BUCKET,
      email1Key,
      TEST_PDF_CONTENT
    );
    await minioClient.putObject(
      EMAIL_ATTACHMENTS_BUCKET,
      email2Key,
      TEST_PDF_CONTENT
    );

    // Both should exist independently
    expect(await fileExists(EMAIL_ATTACHMENTS_BUCKET, email1Key)).toBe(true);
    expect(await fileExists(EMAIL_ATTACHMENTS_BUCKET, email2Key)).toBe(true);
  });

  afterAll(async () => {
    // Cleanup test files
    const testKeys = [
      `${TEST_EMAIL_ID}/${TEST_ATTACHMENT_ID}/test-contract.pdf`,
      `${TEST_EMAIL_ID}/att1/doc1.pdf`,
      `${TEST_EMAIL_ID + 1}/att1/doc1.pdf`,
    ];

    for (const key of testKeys) {
      try {
        await minioClient.removeObject(EMAIL_ATTACHMENTS_BUCKET, key);
      } catch {
        // Ignore errors during cleanup
      }
    }
  });
});
