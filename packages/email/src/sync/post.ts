/**
 * Email Sync — Post Processing Only
 *
 * Runs the post-sync pipeline (domain enrichment → platform sender extraction
 * → account linking) without fetching any new mail from Graph.
 */

import { enrichEmailDomains } from "@email/sync/enrichment";
import { linkEmailsToAccounts } from "@email/sync/link-accounts";
import { processPlatformEmails } from "@email/sync/platform-extraction";
import { db } from "@lib/db/hub";

export async function runEmailPostProcessing(): Promise<void> {
  console.log("=".repeat(60));
  console.log("EMAIL POST-PROCESSING");
  console.log("=".repeat(60));

  console.log("\nStep 1: Enriching with domain info");
  await enrichEmailDomains();

  console.log(`\n${"=".repeat(60)}`);
  console.log("EXTRACTING PLATFORM SENDERS");
  console.log(`${"=".repeat(60)}\n`);
  await processPlatformEmails();

  console.log(`\n${"=".repeat(60)}`);
  console.log("LINKING EMAILS TO ACCOUNTS");
  console.log(`${"=".repeat(60)}\n`);
  const linkStats = await linkEmailsToAccounts();
  const totalLinked =
    linkStats.linkedByPlatformDomain +
    linkStats.linkedByForwardDomain +
    linkStats.linkedByDirectDomain +
    linkStats.linkedByNameLookup +
    linkStats.linkedByAlias +
    linkStats.linkedByConversation;
  console.log(`Newly linked: ${totalLinked}`);
  console.log(`Accounts created: ${linkStats.accountsCreated}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("POST-PROCESSING COMPLETE");
  console.log("=".repeat(60));
  const finalStats = await db
    .query<{ total: number; linked: number }>(
      `SELECT COUNT(*) as total,
       SUM(CASE WHEN account_id IS NOT NULL AND account_id > 0 THEN 1 ELSE 0 END) as linked
       FROM emails`
    )
    .get();
  if (finalStats) {
    const pct = finalStats.total
      ? ((finalStats.linked / finalStats.total) * 100).toFixed(1)
      : "0.0";
    console.log(`Total emails: ${finalStats.total.toLocaleString()}`);
    console.log(
      `Linked to accounts: ${finalStats.linked.toLocaleString()} (${pct}%)`
    );
  }
}
