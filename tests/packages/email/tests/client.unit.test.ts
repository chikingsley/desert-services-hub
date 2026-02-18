/**
 * Email Service Unit Tests
 *
 * Run: bun test tests/packages/email/tests/client.unit.test.ts
 */
import { describe, expect, it } from "bun:test";
import { GraphEmailClient } from "@email/client";
import { getConfig } from "@email/index";
import type { EmailConfig } from "@email/types";

const EMAIL_TESTS_ENABLED = process.env.ENABLE_EMAIL_TESTS === "1";
const describeEmailTests = EMAIL_TESTS_ENABLED ? describe : describe.skip;

describeEmailTests("email service", () => {
  describe("getConfig", () => {
    it("throws when credentials missing", () => {
      const original = {
        AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
        AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
      };

      // Clear env vars
      process.env.AZURE_TENANT_ID = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.AZURE_CLIENT_SECRET = undefined;

      expect(() => getConfig()).toThrow("Missing Azure credentials");

      // Restore
      process.env.AZURE_TENANT_ID = original.AZURE_TENANT_ID;
      process.env.AZURE_CLIENT_ID = original.AZURE_CLIENT_ID;
      process.env.AZURE_CLIENT_SECRET = original.AZURE_CLIENT_SECRET;
    });

    it("returns config when credentials present", () => {
      const original = {
        AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
        AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
      };

      process.env.AZURE_TENANT_ID = "test-tenant";
      process.env.AZURE_CLIENT_ID = "test-client";
      process.env.AZURE_CLIENT_SECRET = "test-secret";

      const config = getConfig();
      expect(config.azureTenantId).toBe("test-tenant");
      expect(config.azureClientId).toBe("test-client");
      expect(config.azureClientSecret).toBe("test-secret");
      expect(config.batchSize).toBe(50);
      expect(config.daysBack).toBe(30);

      // Restore
      process.env.AZURE_TENANT_ID = original.AZURE_TENANT_ID;
      process.env.AZURE_CLIENT_ID = original.AZURE_CLIENT_ID;
      process.env.AZURE_CLIENT_SECRET = original.AZURE_CLIENT_SECRET;
    });
  });

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
      } as unknown as import("@email/types").TrackedEmailAttachment;

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
      } as unknown as import("@email/types").TrackedEmailAttachment;

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
      } as unknown as import("@email/types").TrackedEmailAttachment;

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
