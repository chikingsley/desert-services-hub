export async function runPostProcessing(): Promise<void> {
  const { enrichEmailDomains } = await import("@lib/linking/enrichment");
  const { processPlatformEmails } = await import(
    "@email/sync/platform-extraction"
  );
  const { linkEmailsToAccounts } = await import("@lib/linking/link-accounts");

  console.log(`\n${"=".repeat(60)}`);
  console.log("EXTRACTING PLATFORM SENDERS");
  console.log(`${"=".repeat(60)}\n`);
  await enrichEmailDomains();
  await processPlatformEmails();

  console.log(`\n${"=".repeat(60)}`);
  console.log("LINKING TO ACCOUNTS");
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
}
