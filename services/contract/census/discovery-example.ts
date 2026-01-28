#!/usr/bin/env bun

/**
 * Example usage of Email Discovery Engine
 *
 * Usage:
 *   bun run discovery-example.ts <email-id>
 *   bun run discovery-example.ts 39009
 */

import { discoveryEngine } from "./discovery";

async function main() {
  const emailId = process.argv[2] ? Number.parseInt(process.argv[2], 10) : null;

  if (!emailId) {
    console.error("Usage: bun run discovery-example.ts <email-id>");
    console.error("Example: bun run discovery-example.ts 39009");
    process.exit(1);
  }

  console.log(`🔍 Discovering related emails for email ID: ${emailId}\n`);

  // Discover related emails (increase maxResults to see more)
  const result = await discoveryEngine.discover(emailId, {
    maxResults: 500, // Increased to show more project emails
    minConfidence: 0.3,
    includeFeedback: true,
  });

  // Display results
  console.log("=".repeat(80));
  console.log("DISCOVERY RESULTS");
  console.log("=".repeat(80));
  console.log(`\nSeed Email ID: ${result.seedEmailId}`);
  console.log(`Overall Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Total Emails Found: ${result.emails.length}`);
  console.log(`Total Attachments Found: ${result.attachments.length}`);
  console.log(`Groups Created: ${result.groups.length}`);

  // Display signals
  console.log(`\n${"-".repeat(80)}`);
  console.log("DISCOVERY SIGNALS");
  console.log("-".repeat(80));
  for (const signal of result.signals) {
    console.log(
      `\n${signal.type.toUpperCase()} (${(signal.confidence * 100).toFixed(0)}% confidence)`
    );
    console.log(`  ${signal.description}`);
    console.log(
      `  Email IDs: ${signal.emailIds.slice(0, 10).join(", ")}${signal.emailIds.length > 10 ? "..." : ""}`
    );
  }

  // Display groups
  console.log(`\n${"-".repeat(80)}`);
  console.log("EMAIL GROUPS");
  console.log("-".repeat(80));
  for (const group of result.groups) {
    console.log(`\n📁 ${group.name} (${group.type})`);
    console.log(`   Confidence: ${(group.confidence * 100).toFixed(0)}%`);
    console.log(`   Emails: ${group.emails.length}`);
    console.log(
      `   Email IDs: ${group.emails.slice(0, 5).join(", ")}${group.emails.length > 5 ? "..." : ""}`
    );
  }

  // Display discovered emails
  console.log(`\n${"-".repeat(80)}`);
  console.log("DISCOVERED EMAILS");
  console.log("-".repeat(80));
  for (const email of result.emails.slice(0, 10)) {
    console.log(`\n📧 ${email.subject || "(No Subject)"}`);
    console.log(`   ID: ${email.id}`);
    console.log(`   From: ${email.fromName || email.fromEmail}`);
    console.log(`   Date: ${email.receivedAt.split("T")[0]}`);
    console.log(`   Confidence: ${(email.confidence * 100).toFixed(0)}%`);
    console.log(`   Reasons: ${email.discoveryReason.join(", ")}`);
    if (email.groupId) {
      console.log(`   Group: ${email.groupId}`);
    }
  }

  if (result.emails.length > 10) {
    console.log(`\n... and ${result.emails.length - 10} more emails`);
  }

  // Display attachments
  console.log(`\n${"-".repeat(80)}`);
  console.log("DISCOVERED ATTACHMENTS");
  console.log("-".repeat(80));
  for (const attachment of result.attachments.slice(0, 10)) {
    console.log(`\n📎 ${attachment.name}`);
    console.log(`   ID: ${attachment.id}`);
    console.log(
      `   Size: ${attachment.size ? `${(attachment.size / 1024).toFixed(1)}KB` : "Unknown"}`
    );
    console.log(`   Confidence: ${(attachment.confidence * 100).toFixed(0)}%`);
    console.log(`   Reasons: ${attachment.discoveryReason.join(", ")}`);
    console.log(`   Related Emails: ${attachment.relatedEmailIds.join(", ")}`);
  }

  if (result.attachments.length > 10) {
    console.log(`\n... and ${result.attachments.length - 10} more attachments`);
  }

  // Example: Provide feedback
  console.log(`\n${"=".repeat(80)}`);
  console.log("FEEDBACK EXAMPLE");
  console.log("=".repeat(80));
  console.log("\nYou can provide feedback to improve discovery:");
  console.log("\nExample: Exclude an email that's not related");
  if (result.emails.length > 0) {
    const _exampleEmail = result.emails[0];
    console.log("\n  await discoveryEngine.provideFeedback({");
    console.log(`    emailId: ${emailId},`);
    console.log(`    action: 'exclude',`);
    console.log(`    reason: 'Not related to this project'`);
    console.log("  });");
  }

  console.log("\nExample: Include an email that was missed");
  console.log("\n  await discoveryEngine.provideFeedback({");
  console.log(`    emailId: ${emailId},`);
  console.log(`    action: 'include',`);
  console.log(`    reason: 'Related email that was missed'`);
  console.log("  });");

  console.log("\nExample: Regroup an email");
  console.log("\n  await discoveryEngine.provideFeedback({");
  console.log(`    emailId: ${emailId},`);
  console.log(`    action: 'regroup',`);
  console.log(`    targetGroupId: 'project-123'`);
  console.log("  });");

  // JSON output for programmatic use
  console.log(`\n${"=".repeat(80)}`);
  console.log("JSON OUTPUT (for UI/API)");
  console.log("=".repeat(80));
  console.log(
    "\n" +
      JSON.stringify(
        {
          seedEmailId: result.seedEmailId,
          totalEmails: result.emails.length,
          totalAttachments: result.attachments.length,
          groups: result.groups.map((g) => ({
            id: g.id,
            name: g.name,
            type: g.type,
            emailCount: g.emails.length,
            confidence: g.confidence,
          })),
          signals: result.signals.map((s) => ({
            type: s.type,
            confidence: s.confidence,
            description: s.description,
            emailCount: s.emailIds.length,
          })),
          overallConfidence: result.confidence,
        },
        null,
        2
      )
  );
}

main().catch(console.error);
