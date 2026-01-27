#!/usr/bin/env bun
/**
 * Send test SWPPP notification emails to chi@desertservices.net
 *
 * Usage: bun run services/swppp/send-test-emails.ts
 */

import { GraphEmailClient } from "@/services/email/client";
import { getLogoAttachment, getTemplate } from "./templates";

const config = {
  azureTenantId: process.env.AZURE_TENANT_ID || "",
  azureClientId: process.env.AZURE_CLIENT_ID || "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
};

async function sendTestEmails() {
  console.log("🚀 SWPPP Email Test Script\n");

  // Initialize email client with user auth (required for sending)
  const client = new GraphEmailClient(config);
  console.log("Initializing user authentication...\n");
  await client.initUserAuth();

  // Test data
  const testVars = {
    vendorName: "Alta Environmental & Infrastructure",
    jobName: "SUNRISE APARTMENTS",
    customerName: "Fina CDM LLC",
    jobLocation: "Glendale, AZ, USA",
  };

  const recipient = { email: "chi@desertservices.net", name: "Chi Ejimofor" };
  const logo = await getLogoAttachment();

  // Test 1: SWPPP Plan Requested
  console.log("📧 Sending: SWPPP Plan Requested...");
  const requestedHtml = await getTemplate("swppp-plan-requested", testVars);
  await client.sendEmail({
    to: [recipient],
    subject: `[TEST] SWPPP Plan Requested - ${testVars.jobName}`,
    body: requestedHtml,
    bodyType: "html",
    attachments: [logo],
    skipSignature: true, // Template already has signature
  });
  console.log("✅ SWPPP Plan Requested email sent!\n");

  // Test 2: SWPPP Plan Received
  console.log("📧 Sending: SWPPP Plan Received...");
  const receivedHtml = await getTemplate("swppp-plan-received", testVars);
  await client.sendEmail({
    to: [recipient],
    subject: `[TEST] SWPPP Plan Received - ${testVars.jobName}`,
    body: receivedHtml,
    bodyType: "html",
    attachments: [logo],
    skipSignature: true, // Template already has signature
  });
  console.log("✅ SWPPP Plan Received email sent!\n");

  console.log("🎉 All test emails sent successfully!");
  console.log("Check chi@desertservices.net for the two test emails.");
}

sendTestEmails().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
