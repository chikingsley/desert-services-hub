export async function runPostProcessing(): Promise<void> {
  const { enrichEmailDomains } = await import("@email/sync/enrichment");
  const { processPlatformEmails } = await import(
    "@contract/db/lib/platform-extraction"
  );
  const { linkEmailsToAccounts } = await import(
    "@contract/db/lib/link-accounts"
  );

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
