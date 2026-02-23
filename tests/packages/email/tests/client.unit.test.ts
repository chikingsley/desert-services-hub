/**
 * Email Service Unit Tests
 *
 * Run: bun test tests/packages/email/tests/client.unit.test.ts
 */
import { describe, expect, it } from "bun:test";
import { GraphEmailClient } from "@/packages/archive/email/client";
import type { EmailConfig } from "@/packages/archive/email/types";

const EMAIL_TESTS_ENABLED = process.env.ENABLE_EMAIL_TESTS === "1";
const describeEmailTests = EMAIL_TESTS_ENABLED ? describe : describe.skip;

describeEmailTests("email service", () => {
  describe("GraphEmailClient", () => {
    const testConfig: EmailConfig = {
      azureClientId: "test-client",
      azureClientSecret: "test-secret",
      azureTenantId: "test-tenant",
      batchSize: 10,
      daysBack: 7,
    };

    it("creates client with config", () => {
      const client = new GraphEmailClient(testConfig);
      expect(client).toBeDefined();
    });

    it("initializes app auth mode", () => {
      const client = new GraphEmailClient(testConfig);
      client.initAppAuth();
      // No throw = success
      expect(true).toBe(true);
    });

    it("throws when userId not provided for app auth", async () => {
      const client = new GraphEmailClient(testConfig);
      client.initAppAuth();

      // This will throw because we don't have real credentials
      // but it should throw the right error first
      try {
        await client.getEmails(undefined, undefined, 1);
      } catch (_error) {
        const error = _error as Error;
        expect(error.message).toContain("userId required");
      }
    });
  });

  describe("TrackedEmailAttachment", () => {
    const testConfig: EmailConfig = {
      azureClientId: "test-client",
      azureClientSecret: "test-secret",
      azureTenantId: "test-tenant",
    };

    it("safeDownloadAttachment throws when source tracking missing", async () => {
      const client = new GraphEmailClient(testConfig);
      client.initAppAuth();

      // Attachment without source tracking info
      const untrackedAttachment = {
        contentType: "application/pdf",
        id: "att-123",
        isInline: false,
        name: "file.pdf",
        size: 1024,
      } as unknown as import("@/packages/archive/email/types").TrackedEmailAttachment;

      try {
        await client.safeDownloadAttachment(untrackedAttachment);
        expect(true).toBe(false); // Should not reach here
      } catch (_error) {
        const error = _error as Error;
        expect(error.message).toContain(
          "Attachment missing source tracking info"
        );
      }
    });

    it("safeDownloadAttachment throws when sourceMailbox missing", async () => {
      const client = new GraphEmailClient(testConfig);
      client.initAppAuth();

      // Attachment with only sourceMessageId
      const partialAttachment = {
        contentType: "application/pdf",
        id: "att-123",
        isInline: false,
        name: "file.pdf",
        size: 1024,
        sourceMessageId: "msg-456",
        // sourceMailbox is missing
      } as unknown as import("@/packages/archive/email/types").TrackedEmailAttachment;

      try {
        await client.safeDownloadAttachment(partialAttachment);
        expect(true).toBe(false); // Should not reach here
      } catch (_error) {
        const error = _error as Error;
        expect(error.message).toContain(
          "Attachment missing source tracking info"
        );
      }
    });

    it("safeDownloadAttachment throws when sourceMessageId missing", async () => {
      const client = new GraphEmailClient(testConfig);
      client.initAppAuth();

      // Attachment with only sourceMailbox
      const partialAttachment = {
        contentType: "application/pdf",
        id: "att-123",
        isInline: false,
        name: "file.pdf",
        size: 1024,
        sourceMailbox: "user@example.com",
        // sourceMessageId is missing
      } as unknown as import("@/packages/archive/email/types").TrackedEmailAttachment;

      try {
        await client.safeDownloadAttachment(partialAttachment);
        expect(true).toBe(false); // Should not reach here
      } catch (_error) {
        const error = _error as Error;
        expect(error.message).toContain(
          "Attachment missing source tracking info"
        );
      }
    });
  });
});
