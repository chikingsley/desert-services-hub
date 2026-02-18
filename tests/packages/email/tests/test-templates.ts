/**
 * Test dust permit email templates
 *
 * Usage:
 *   bun packages/email/tests/test-templates.ts [template-name]
 *
 * Examples:
 *   bun packages/email/tests/test-templates.ts                    # List all templates
 *   bun packages/email/tests/test-templates.ts dust-permit-issued # Send test email
 */

import { GraphEmailClient } from "@email/client";
import {
  getLogoAttachment,
  getTemplate,
  listTemplates,
} from "@email/email-templates";

const EMAIL_TESTS_ENABLED = process.env.ENABLE_EMAIL_TESTS === "1";

const config = {
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
};

// Test data for each template
const TEST_DATA: Record<string, Record<string, string>> = {
  "dust-permit-billing": {
    recipientName: "Team",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064940",
    address: "6111 S All-America Way, Tempe AZ 85283",
    acceleratedProcessing: "No",
    permitCost: "$150.00",
    scheduleValue: "$5,000.00",
    invoiceNumber: "INV-2025-001",
    invoiceDate: "December 18, 2025",
    projectFolderLink: "https://example.sharepoint.com/projects/kiwanis",
  },
  "dust-permit-billing-renewed": {
    recipientName: "Team",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064942",
    supersededApplicationNumber: "D0064940",
    permitNumber: "F054321",
    address: "6111 S All-America Way, Tempe AZ 85283",
    acceleratedProcessing: "No",
    permitCost: "$150.00",
    scheduleValue: "$5,000.00",
    invoiceNumber: "INV-2025-003",
    invoiceDate: "December 18, 2025",
    projectFolderLink: "https://example.sharepoint.com/projects/kiwanis",
  },
  "dust-permit-billing-revised": {
    recipientName: "Team",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064941",
    supersededApplicationNumber: "D0064940",
    permitNumber: "F054321",
    address: "6111 S All-America Way, Tempe AZ 85283",
    acceleratedProcessing: "No",
    permitCost: "$50.00",
    scheduleValue: "$5,000.00",
    invoiceNumber: "INV-2025-002",
    invoiceDate: "December 18, 2025",
    projectFolderLink: "https://example.sharepoint.com/projects/kiwanis",
    changesHtml:
      "<li><div>Increased acreage: 1.2 → 2.5 acres</div></li><li><div>Updated superintendent contact</div></li>",
  },
  "dust-permit-issued": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    actionStatus: "processed and approved",
    permitStatus: "Active",
    applicationNumber: "D0064940",
    permitNumber: "F054321",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    acreage: "1.2",
    issueDate: "December 18, 2025",
    expirationDate: "December 18, 2026",
    showPermitInfo: "true",
  },
  "dust-permit-reminder": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064940",
    permitNumber: "F054321",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    expirationDate: "January 15, 2026",
  },
  "dust-permit-renewed": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064942",
    supersededApplicationNumber: "D0064940",
    permitNumber: "F054321",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    acreage: "1.2",
    issueDate: "December 18, 2025",
    expirationDate: "December 18, 2026",
  },
  "dust-permit-revised": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064941",
    permitNumber: "F054321",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    acreage: "2.5",
    issueDate: "December 18, 2025",
    expirationDate: "December 18, 2026",
    changesHtml:
      "<li><div>Increased acreage: 1.2 → 2.5 acres</div></li><li><div>Updated superintendent contact</div></li>",
  },
  "dust-permit-submitted": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064940",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    acreage: "1.2",
  },
};

const SUBJECT_LINES: Record<string, string> = {
  "dust-permit-billing": "[TEST] Dust Permit Billing - Kiwanis Playground",
  "dust-permit-billing-renewed":
    "[TEST] Dust Permit Renewal Billing - Kiwanis Playground",
  "dust-permit-billing-revised":
    "[TEST] Dust Permit Revision Billing - Kiwanis Playground",
  "dust-permit-issued": "[TEST] Dust Permit Approved - Kiwanis Playground",
  "dust-permit-reminder":
    "[TEST] Dust Permit Expiring Soon - Kiwanis Playground",
  "dust-permit-renewed": "[TEST] Dust Permit Renewed - Kiwanis Playground",
  "dust-permit-revised": "[TEST] Dust Permit Revised - Kiwanis Playground",
  "dust-permit-submitted": "[TEST] Dust Permit Submitted - Kiwanis Playground",
};

async function main() {
  const args = process.argv.slice(2);
  const templateName = args[0];

  // List templates if no argument
  if (!templateName) {
    console.log("\nAvailable templates:");
    const templates = await listTemplates();
    for (const t of templates.toSorted()) {
      console.log(`  - ${t}`);
    }
    console.log(
      "\nUsage: bun packages/email/tests/test-templates.ts <template-name>"
    );
    console.log(
      "Example: bun packages/email/tests/test-templates.ts dust-permit-issued"
    );
    return;
  }

  // Check if template has test data
  const testData = TEST_DATA[templateName];
  if (!testData) {
    console.error(`No test data for template: ${templateName}`);
    console.log("\nAvailable templates with test data:");
    for (const t of Object.keys(TEST_DATA).toSorted()) {
      console.log(`  - ${t}`);
    }
    return;
  }

  // Generate HTML
  console.log(`\nGenerating ${templateName} template...`);
  const html = await getTemplate(templateName, testData);
  const logo = await getLogoAttachment();

  // Initialize email client
  const email = new GraphEmailClient(config);
  await email.initUserAuth();

  // Send to self
  const subject = SUBJECT_LINES[templateName] ?? `[TEST] ${templateName}`;
  console.log(`\nSending test email: "${subject}"`);
  console.log("To: chi@desertservices.net");

  await email.sendEmail({
    attachments: [logo],
    body: html,
    bodyType: "html",
    subject,
    to: [{ email: "chi@desertservices.net" }],
  });

  console.log("\n✓ Email sent successfully!");
}

if (EMAIL_TESTS_ENABLED) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  console.log(
    "[skip] Template script disabled. Set ENABLE_EMAIL_TESTS=1 to run."
  );
}
