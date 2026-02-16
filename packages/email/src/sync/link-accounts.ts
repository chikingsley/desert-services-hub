/**
 * Account Linking
 *
 * Links emails to accounts using domain-centric signals.
 */
import { db } from "@lib/db/hub";

const IGNORED_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
  "buildingconnected.com",
  "procore.com",
  "procoretech.com",
  "us02.procoretech.com",
  "bbbid.thebluebook.com",
  "thebluebook.com",
  "bidmail.com",
  "pype.io",
  "planhub.com",
  "message.planhub.com",
  "smartbidnet.com",
  "com2.smartbidnet.com",
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "avanan-mail.net",
]);

function isIgnoredDomain(domain: string): boolean {
  return IGNORED_DOMAINS.has(domain.toLowerCase());
}

async function findOrCreateAccountByDomain(
  domain: string,
  companyName?: string | null
): Promise<number> {
  const lowerDomain = domain.toLowerCase();

  if (isIgnoredDomain(lowerDomain)) {
    return -1;
  }

  const existing = await db
    .query<{ id: number }>("SELECT id FROM accounts WHERE domain = ?")
    .get(lowerDomain);

  if (existing) {
    if (companyName) {
      await db.run(
        "UPDATE accounts SET name = ? WHERE id = ? AND (name IS NULL OR name = '')",
        [companyName, existing.id]
      );
    }
    return existing.id;
  }

  const name = companyName || lowerDomain;
  const inserted = await db
    .query<{ id: number }>(
      `INSERT INTO accounts (domain, name, type)
       VALUES (?, ?, 'contractor')
       ON CONFLICT(domain) DO UPDATE SET
         name = COALESCE(NULLIF(accounts.name, ''), EXCLUDED.name),
         updated_at = now()
       RETURNING id`
    )
    .get(lowerDomain, name);

  return inserted?.id ?? -1;
}

interface AccountUpdateStmt {
  run: (...params: unknown[]) => Promise<unknown>;
}

async function updateEmailAccount(
  updateStmt: AccountUpdateStmt,
  accountId: number,
  emailId: number
): Promise<void> {
  await updateStmt.run(accountId, emailId, accountId);
}

async function linkPlatformEmailsByDomain(
  updateStmt: AccountUpdateStmt,
  stats: LinkStats
): Promise<void> {
  console.log("Signal 1: Platform emails with real sender domain...");
  const platformEmails = await db
    .query<{
      id: number;
      real_sender_domain: string;
      real_sender_company: string | null;
    }>(
      `SELECT id, real_sender_domain, real_sender_company
       FROM emails
       WHERE real_sender_domain IS NOT NULL
       AND (account_id IS NULL OR account_id <= 0)`
    )
    .all();

  for (const email of platformEmails) {
    stats.processed++;
    const accountId = await findOrCreateAccountByDomain(
      email.real_sender_domain,
      email.real_sender_company
    );
    if (accountId > 0) {
      await updateEmailAccount(updateStmt, accountId, email.id);
      stats.linkedByPlatformDomain++;
    } else {
      stats.skippedIgnoredDomain++;
    }
  }
}

async function linkForwardedEmailsByDomain(
  updateStmt: AccountUpdateStmt,
  stats: LinkStats
): Promise<void> {
  console.log("Signal 2: Forward emails with original sender domain...");
  const forwardEmails = await db
    .query<{ id: number; original_sender_domain: string }>(
      `SELECT id, original_sender_domain
       FROM emails
       WHERE original_sender_domain IS NOT NULL
       AND (account_id IS NULL OR account_id <= 0)`
    )
    .all();

  for (const email of forwardEmails) {
    stats.processed++;
    const accountId = await findOrCreateAccountByDomain(
      email.original_sender_domain
    );
    if (accountId > 0) {
      await updateEmailAccount(updateStmt, accountId, email.id);
      stats.linkedByForwardDomain++;
    } else {
      stats.skippedIgnoredDomain++;
    }
  }
}

async function linkDirectExternalEmailsByDomain(
  updateStmt: AccountUpdateStmt,
  stats: LinkStats
): Promise<void> {
  console.log("Signal 3: Direct external emails by domain...");
  const directEmails = await db
    .query<{ id: number; from_domain: string }>(
      `SELECT id, from_domain
       FROM emails
       WHERE from_domain IS NOT NULL
       AND (account_id IS NULL OR account_id <= 0)
       AND (is_internal = 0 OR is_internal IS NULL)
       AND (is_platform_email = 0 OR is_platform_email IS NULL)
       AND (is_excluded = 0 OR is_excluded IS NULL)`
    )
    .all();

  for (const email of directEmails) {
    stats.processed++;
    const accountId = await findOrCreateAccountByDomain(email.from_domain);
    if (accountId > 0) {
      await updateEmailAccount(updateStmt, accountId, email.id);
      stats.linkedByDirectDomain++;
    } else {
      stats.skippedIgnoredDomain++;
    }
  }
}

function toLookupName(value: string | null): string | null {
  const namePart = (value?.split("(")[0] ?? "").trim();
  return namePart.length >= 3 ? namePart.toLowerCase() : null;
}

async function buildNameDomainLookup(): Promise<Map<string, string>> {
  const nameToDomain = new Map<string, string>();
  const nameEmails = await db
    .query<{ from_name: string; from_domain: string }>(
      `SELECT DISTINCT from_name, from_domain
       FROM emails
       WHERE from_domain IS NOT NULL
       AND from_name IS NOT NULL
       AND (is_platform_email = 0 OR is_platform_email IS NULL)`
    )
    .all();

  for (const email of nameEmails) {
    const domain = email.from_domain.toLowerCase();
    if (isIgnoredDomain(domain)) {
      continue;
    }
    nameToDomain.set(email.from_name.toLowerCase(), domain);
  }

  return nameToDomain;
}

async function linkPlatformEmailsByNameLookup(
  updateStmt: AccountUpdateStmt,
  stats: LinkStats
): Promise<void> {
  console.log("Signal 4: Name lookup for platform emails without domain...");
  const platformWithoutDomain = await db
    .query<{ id: number; from_name: string | null }>(
      `SELECT id, from_name
       FROM emails
       WHERE is_platform_email = 1
       AND real_sender_domain IS NULL
       AND from_name LIKE '% (%'
       AND (account_id IS NULL OR account_id <= 0)`
    )
    .all();
  const nameToDomain = await buildNameDomainLookup();

  for (const email of platformWithoutDomain) {
    stats.processed++;

    const nameKey = toLookupName(email.from_name);
    if (!nameKey) {
      stats.skippedNoDomain++;
      continue;
    }

    const matchedDomain = nameToDomain.get(nameKey);
    if (!matchedDomain) {
      stats.skippedNoDomain++;
      continue;
    }

    const accountId = await findOrCreateAccountByDomain(matchedDomain);
    if (accountId > 0) {
      await updateEmailAccount(updateStmt, accountId, email.id);
      stats.linkedByNameLookup++;
    } else {
      stats.skippedIgnoredDomain++;
    }
  }
}

async function linkPlatformEmailsByCompanyAlias(
  updateStmt: AccountUpdateStmt,
  stats: LinkStats
): Promise<void> {
  console.log("Signal 5: Company alias lookup...");
  const platformWithCompany = await db
    .query<{ id: number; real_sender_company: string }>(
      `SELECT id, real_sender_company
       FROM emails
       WHERE is_platform_email = 1
       AND real_sender_company IS NOT NULL
       AND (account_id IS NULL OR account_id <= 0)`
    )
    .all();

  for (const email of platformWithCompany) {
    stats.processed++;
    const aliasMatch = await db
      .query<{ account_id: number }>(
        "SELECT account_id FROM company_aliases WHERE alias = ?"
      )
      .get(email.real_sender_company.toLowerCase());

    if (!aliasMatch) {
      stats.skippedNoDomain++;
      continue;
    }

    await updateEmailAccount(updateStmt, aliasMatch.account_id, email.id);
    stats.linkedByAlias++;
  }
}

async function propagateConversationAccountLinks(
  updateStmt: AccountUpdateStmt,
  stats: LinkStats
): Promise<void> {
  console.log("Signal 6: Conversation propagation...");
  let conversationLinks = 0;
  let iterations = 0;
  const maxIterations = 10;

  do {
    conversationLinks = 0;

    const unlinked = await db
      .query<{ id: number; conversation_id: string }>(
        `SELECT e.id, e.conversation_id
         FROM emails e
         WHERE e.conversation_id IS NOT NULL
         AND (e.account_id IS NULL OR e.account_id <= 0)
         AND EXISTS (
           SELECT 1 FROM emails e2
           WHERE e2.conversation_id = e.conversation_id
           AND e2.account_id IS NOT NULL AND e2.account_id > 0
         )`
      )
      .all();

    for (const email of unlinked) {
      const sibling = await db
        .query<{ account_id: number }>(
          `SELECT account_id FROM emails
           WHERE conversation_id = ? AND account_id IS NOT NULL AND account_id > 0
           LIMIT 1`
        )
        .get(email.conversation_id);

      if (!sibling) {
        continue;
      }

      await updateEmailAccount(updateStmt, sibling.account_id, email.id);
      conversationLinks++;
      stats.linkedByConversation++;
      stats.processed++;
    }

    iterations++;
  } while (conversationLinks > 0 && iterations < maxIterations);
}

export interface LinkStats {
  processed: number;
  linkedByPlatformDomain: number;
  linkedByForwardDomain: number;
  linkedByDirectDomain: number;
  linkedByNameLookup: number;
  linkedByAlias: number;
  linkedByConversation: number;
  accountsCreated: number;
  skippedIgnoredDomain: number;
  skippedNoDomain: number;
  errors: number;
}

export async function linkEmailsToAccounts(): Promise<LinkStats> {
  const stats: LinkStats = {
    accountsCreated: 0,
    errors: 0,
    linkedByAlias: 0,
    linkedByConversation: 0,
    linkedByDirectDomain: 0,
    linkedByForwardDomain: 0,
    linkedByNameLookup: 0,
    linkedByPlatformDomain: 0,
    processed: 0,
    skippedIgnoredDomain: 0,
    skippedNoDomain: 0,
  };

  const accountsBefore =
    (await db.query<{ c: number }>("SELECT COUNT(*) as c FROM accounts").get())
      ?.c ?? 0;

  const updateStmt = db.prepare(
    "UPDATE emails SET account_id = ? WHERE id = ? AND (account_id IS NULL OR account_id != ?)"
  );

  try {
    await db.transaction(async () => {
      await linkPlatformEmailsByDomain(updateStmt, stats);
      await linkForwardedEmailsByDomain(updateStmt, stats);
      await linkDirectExternalEmailsByDomain(updateStmt, stats);
      await linkPlatformEmailsByNameLookup(updateStmt, stats);
      await linkPlatformEmailsByCompanyAlias(updateStmt, stats);
      await propagateConversationAccountLinks(updateStmt, stats);
    });

    const accountsAfter =
      (
        await db
          .query<{ c: number }>("SELECT COUNT(*) as c FROM accounts")
          .get()
      )?.c ?? 0;
    stats.accountsCreated = accountsAfter - accountsBefore;
  } catch (error) {
    console.error("Error during account linking:", error);
    stats.errors++;
  }

  return stats;
}

if (import.meta.main) {
  linkEmailsToAccounts()
    .then((stats) => {
      const totalLinked =
        stats.linkedByPlatformDomain +
        stats.linkedByForwardDomain +
        stats.linkedByDirectDomain +
        stats.linkedByNameLookup +
        stats.linkedByAlias +
        stats.linkedByConversation;
      console.log(
        `Linked ${totalLinked} emails. Accounts created: ${stats.accountsCreated}`
      );
    })
    .catch((error) => {
      console.error("linkEmailsToAccounts failed:", error);
      process.exit(1);
    });
}
