/**
 * Spam Domain Management CLI
 *
 * Add domains to exclusion list and backfill all existing emails from those domains.
 * Usage: bun packages/email/src/commands/spam-domains.ts <domain1> [domain2] [domain3] ...
 */

import { db } from "@lib/db/client";

const insertRule = db.query(`
  INSERT INTO domain_rules (domain, is_excluded, reason)
  VALUES ($1, true, $2)
  ON CONFLICT (domain) DO UPDATE SET is_excluded = true, reason = $2, reviewed_at = now()
`);

const backfillEmails = db.query(`
  UPDATE emails
  SET is_excluded = 1
  WHERE from_domain = $1 AND is_excluded = 0
`);

const countAffected = db.query<{ cnt: string }>(`
  SELECT count(*)::text as cnt
  FROM emails
  WHERE from_domain = $1 AND is_excluded = 0
`);

async function excludeDomain(
  domain: string,
  reason = "manual_review"
): Promise<number> {
  // Add/update the domain rule
  await insertRule.run(domain, reason);

  // Get count of emails that will be backfilled
  const countRow = await countAffected.get(domain);
  const count = Number(countRow?.cnt ?? 0);

  // Backfill all existing emails from this domain
  if (count > 0) {
    await backfillEmails.run(domain);
  }

  return count;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(
      "Usage: bun spam-domains.ts <domain1> [domain2] ... [--reason '<reason>']"
    );
    console.log(
      "Example: bun spam-domains.ts spam.com phishing.net --reason 'political_spam'"
    );
    process.exit(1);
  }

  // Extract reason if provided
  let reason = "manual_review";
  const reasonIndex = args.indexOf("--reason");
  const domains = reasonIndex !== -1 ? args.slice(0, reasonIndex) : args;

  if (reasonIndex !== -1 && reasonIndex + 1 < args.length) {
    reason = args[reasonIndex + 1];
  }

  console.log(
    `\nExcluding ${domains.length} domain(s) with reason: "${reason}"\n`
  );

  for (const domain of domains) {
    const count = await excludeDomain(domain, reason);
    console.log(
      `${domain.padEnd(40)} — ${count.toString().padEnd(4)} email(s) excluded`
    );
  }

  console.log("\nDone!");
}

await main();
