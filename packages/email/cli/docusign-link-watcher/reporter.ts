import type { FoundLink, LinkRequest } from "./types";

export function reportFoundLink(found: FoundLink): void {
  console.log("\n========================================");
  console.log("  NEW DOCUSIGN LINK FOUND");
  console.log("========================================\n");
  console.log(`  Document: ${found.request.docusignSubject}`);
  console.log(`  Found in: ${found.foundInMailbox}`);
  console.log(
    `  Received: ${new Date(found.email.receivedDateTime).toLocaleString()}`
  );
  console.log(`\n  Signing URL:\n  ${found.signingUrl}`);
  if (found.securityCode) {
    console.log(`\n  Security Code: ${found.securityCode}`);
  }
  console.log("\n========================================\n");
}

export function printSummary(found: FoundLink[], pending: LinkRequest[]): void {
  console.log("\n--- Summary ---");
  console.log(`Found: ${found.length} link(s)`);
  console.log(`Pending: ${pending.length} request(s)`);

  if (found.length > 0) {
    console.log("\nLinks found:");
    for (const f of found) {
      console.log(`  ${f.request.docusignSubject}`);
      console.log(`    ${f.signingUrl}`);
      console.log(
        `    recipient: ${f.email.toRecipients?.[0]?.email ?? "unknown"}`
      );
      if (f.securityCode) {
        console.log(`    security code: ${f.securityCode}`);
      }
    }
  }
}
