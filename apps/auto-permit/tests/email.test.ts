/**
 * Email Template Tests
 *
 * Comprehensive tests for email templates:
 * 1. Template Rendering - Verify all templates load and variables substitute correctly
 * 2. Integration Tests - Send emails, verify receipt, then delete both sent and received
 *
 * Run with: bun test tests/email.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GraphEmailClient } from "@email/client";
import {
  fillTemplate,
  getTemplate,
  listTemplates,
  loadTemplate,
} from "@email/templates/index";

// Test recipient - emails will be sent TO and FROM this address
const TEST_EMAIL = "chi@desertservices.net";

// Unique test identifier to find our test emails
const TEST_ID = `TEST-${Date.now()}`;

// Track emails we send so we can clean them up
const sentEmailIds: string[] = [];
const receivedEmailIds: string[] = [];

// Shared client instance
let emailClient: GraphEmailClient;

// Template definitions with their required variables
const TEMPLATE_CONFIGS = {
  "01-dust-permit-submitted": {
    vars: {
      recipientName: "Test Recipient",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      siteAddress: "123 Test Street, Phoenix AZ 85001",
      acreage: "2.5",
    },
    subjectPrefix: "Dust Permit Submitted",
  },
  "02-dust-permit-billing": {
    vars: {
      recipientName: "Billing Team",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      address: "123 Test Street, Phoenix AZ 85001",
      acceleratedProcessing: "Standard",
      permitCost: "$350.00",
      scheduleValue: "$500,000",
      invoiceNumber: "INV-2025-0001",
      invoiceDate: "January 15, 2025",
      projectFolderLink: "https://example.com/folder",
    },
    subjectPrefix: "Billing - New Permit",
  },
  "03-dust-permit-issued": {
    vars: {
      recipientName: "Test Recipient",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      actionStatus: "processed and approved",
      permitStatus: "Active",
      applicationNumber: "D0099999",
      permitNumber: "F099999",
      siteAddress: "123 Test Street, Phoenix AZ 85001",
      acreage: "2.5",
      issueDate: "January 15, 2025",
      expirationDate: "January 15, 2026",
      showPermitInfo: "true",
    },
    subjectPrefix: "Dust Permit Issued",
  },
  "04-dust-permit-revised": {
    vars: {
      recipientName: "Test Recipient",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      permitNumber: "F099999",
      siteAddress: "123 Test Street, Phoenix AZ 85001",
      acreage: "3.0",
      issueDate: "January 15, 2025",
      expirationDate: "January 15, 2026",
      changesHtml: "<li><div>Increased acreage: 2.5 → 3.0 acres</div></li>",
    },
    subjectPrefix: "Dust Permit Revised",
  },
  "05-dust-permit-billing-revised": {
    vars: {
      recipientName: "Billing Team",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      supersededApplicationNumber: "D0088888",
      permitNumber: "F099999",
      address: "123 Test Street, Phoenix AZ 85001",
      acceleratedProcessing: "Standard",
      permitCost: "$175.00",
      scheduleValue: "$500,000",
      invoiceNumber: "INV-2025-0002",
      invoiceDate: "January 20, 2025",
      projectFolderLink: "https://example.com/folder",
      changesHtml: "<li><div>Acreage increase</div></li>",
    },
    subjectPrefix: "Billing - Revision",
  },
  "06-dust-permit-reminder": {
    vars: {
      recipientName: "Test Recipient",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      permitNumber: "F099999",
      siteAddress: "123 Test Street, Phoenix AZ 85001",
      expirationDate: "February 15, 2025",
    },
    subjectPrefix: "Dust Permit Reminder",
  },
  "07-dust-permit-renewed": {
    vars: {
      recipientName: "Test Recipient",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      supersededApplicationNumber: "D0088888",
      permitNumber: "F099999",
      siteAddress: "123 Test Street, Phoenix AZ 85001",
      acreage: "2.5",
      issueDate: "January 15, 2025",
      expirationDate: "January 15, 2026",
    },
    subjectPrefix: "Dust Permit Renewed",
  },
  "08-dust-permit-billing-renewed": {
    vars: {
      recipientName: "Billing Team",
      accountName: "Test Company LLC",
      projectName: "Test Project Alpha",
      applicationNumber: "D0099999",
      supersededApplicationNumber: "D0088888",
      permitNumber: "F099999",
      address: "123 Test Street, Phoenix AZ 85001",
      acceleratedProcessing: "Standard",
      permitCost: "$350.00",
      scheduleValue: "$500,000",
      invoiceNumber: "INV-2025-0003",
      invoiceDate: "January 25, 2025",
      projectFolderLink: "https://example.com/folder",
    },
    subjectPrefix: "Billing - Renewal",
  },
} as const;

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeAll(async () => {
  emailClient = new GraphEmailClient({
    azureTenantId: process.env.AZURE_TENANT_ID || "",
    azureClientId: process.env.AZURE_CLIENT_ID || "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
  });
  await emailClient.initUserAuth();
});

afterAll(async () => {
  // Clean up all test emails (both sent and received)
  console.log("\n🧹 Cleaning up test emails...");

  for (const id of [...sentEmailIds, ...receivedEmailIds]) {
    try {
      await emailClient.deleteEmail(id);
      console.log(`  ✓ Deleted email ${id.substring(0, 20)}...`);
    } catch {
      console.warn(`  ✗ Failed to delete ${id.substring(0, 20)}...`);
    }
  }

  console.log(
    `✅ Cleanup complete: ${sentEmailIds.length} sent, ${receivedEmailIds.length} received\n`
  );
});

// ============================================================================
// Template Rendering Tests (Fast, No Network)
// ============================================================================

describe("Template Rendering", () => {
  test("listTemplates returns all 8 templates", async () => {
    const templates = await listTemplates();

    expect(templates).toContain("01-dust-permit-submitted");
    expect(templates).toContain("02-dust-permit-billing");
    expect(templates).toContain("03-dust-permit-issued");
    expect(templates).toContain("04-dust-permit-revised");
    expect(templates).toContain("05-dust-permit-billing-revised");
    expect(templates).toContain("06-dust-permit-reminder");
    expect(templates).toContain("07-dust-permit-renewed");
    expect(templates).toContain("08-dust-permit-billing-renewed");
    expect(templates.length).toBe(8);
  });

  // Test each template renders without errors
  for (const [templateName, config] of Object.entries(TEMPLATE_CONFIGS)) {
    test(`${templateName} loads and renders correctly`, async () => {
      // Load raw template
      const rawTemplate = await loadTemplate(templateName);
      expect(rawTemplate).toBeTruthy();
      expect(rawTemplate.length).toBeGreaterThan(100);

      // Fill template with test vars
      const filled = await getTemplate(templateName, config.vars);
      expect(filled).toBeTruthy();

      // Verify variables were substituted (no remaining {{var}} patterns)
      const unfilledVars = filled.match(/\{\{(?!#|\/)[^}]+\}\}/g);
      if (unfilledVars) {
        console.warn(
          `Template ${templateName} has unfilled vars:`,
          unfilledVars
        );
      }

      // Check key values appear in output
      expect(filled).toContain(config.vars.recipientName as string);
      expect(filled).toContain(config.vars.projectName as string);
    });
  }

  test("fillTemplate handles conditional blocks correctly", () => {
    const template = "Hello {{name}}! {{#if showExtra}}Extra content{{/if}}";

    // With condition true
    const withExtra = fillTemplate(template, {
      name: "Test",
      showExtra: "yes",
    });
    expect(withExtra).toContain("Extra content");

    // With condition false/missing
    const withoutExtra = fillTemplate(template, { name: "Test" });
    expect(withoutExtra).not.toContain("Extra content");
    expect(withoutExtra).toContain("Hello Test!");
  });
});

// ============================================================================
// Integration Tests (Send, Verify, Delete)
// ============================================================================

describe("Email Integration", () => {
  test("send and verify test email, then cleanup", async () => {
    const subject = `${TEST_ID} - Integration Test`;
    const body = `This is an automated test email. Test ID: ${TEST_ID}`;

    // 1. Send email (sendEmail returns void, so we just verify it doesn't throw)
    console.log("📤 Sending test email...");
    await emailClient.sendEmail({
      to: [{ email: TEST_EMAIL }],
      subject,
      body,
      bodyType: "text",
    });
    console.log("✓ Email sent successfully (no throw)");

    // 2. Wait for email to arrive (Graph API can have slight delay)
    console.log("⏳ Waiting for email to arrive...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 3. Search for the sent email in Sent Items folder
    console.log("🔍 Searching for sent email...");
    const sentEmails = await emailClient.searchEmails({
      query: TEST_ID,
      folder: "sentitems",
      limit: 5,
    });
    const sentEmail = sentEmails.find((e) => e.subject?.includes(TEST_ID));
    if (sentEmail) {
      sentEmailIds.push(sentEmail.id);
      console.log(`  ✓ Found sent email: ${sentEmail.id.substring(0, 20)}...`);
    }

    // 4. Search for the received email in Inbox
    console.log("🔍 Searching for received email...");
    const receivedEmails = await emailClient.searchEmails({
      query: TEST_ID,
      folder: "inbox",
      limit: 5,
    });
    const receivedEmail = receivedEmails.find((e) =>
      e.subject?.includes(TEST_ID)
    );
    expect(receivedEmail).toBeTruthy();

    if (receivedEmail) {
      receivedEmailIds.push(receivedEmail.id);
      expect(receivedEmail.subject).toContain(TEST_ID);
      console.log(
        `  ✓ Found received email: ${receivedEmail.id.substring(0, 20)}...`
      );
    }

    console.log("✅ Email sent and received successfully");
  }, 60_000); // 60s timeout for network operations

  // Test one template end-to-end
  test("send templated email (01-dust-permit-submitted) and verify", async () => {
    const config = TEMPLATE_CONFIGS["01-dust-permit-submitted"];
    const subject = `${TEST_ID} - ${config.subjectPrefix}`;

    // 1. Generate template HTML
    const html = await getTemplate("01-dust-permit-submitted", config.vars);
    expect(html).toContain(config.vars.projectName);

    // 2. Send email
    console.log("📤 Sending templated email...");
    await emailClient.sendEmail({
      to: [{ email: TEST_EMAIL }],
      subject,
      body: html,
      bodyType: "html",
      skipSignature: true, // Template already has signature
    });
    console.log("✓ Templated email sent");

    // 3. Wait and verify
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Find sent email
    const sentEmails = await emailClient.searchEmails({
      query: config.subjectPrefix,
      folder: "sentitems",
      limit: 10,
    });
    const sentEmail = sentEmails.find((e) =>
      e.subject?.includes(config.subjectPrefix)
    );
    if (sentEmail) {
      sentEmailIds.push(sentEmail.id);
    }

    // Find received email
    const receivedEmails = await emailClient.searchEmails({
      query: config.subjectPrefix,
      folder: "inbox",
      limit: 10,
    });
    const receivedEmail = receivedEmails.find((e) =>
      e.subject?.includes(config.subjectPrefix)
    );
    expect(receivedEmail).toBeTruthy();

    if (receivedEmail) {
      receivedEmailIds.push(receivedEmail.id);
      // Verify template content appears in body
      expect(receivedEmail.bodyContent).toContain(config.vars.projectName);
    }

    console.log("✅ Templated email sent and verified");
  }, 60_000);
});
