/**
 * Account Linking
 *
 * Links emails to accounts using DOMAIN as the unique key.
 *
 * Signals (in order):
 * 1. Platform emails with real_sender_domain → link by domain
 * 2. Forward emails with original_sender_domain → link by domain
 * 3. Direct external emails with from_domain → link by domain
 * 4. Name lookup → match person name to known sender domains
 * 5. Company alias → match real_sender_company to saved aliases
 * 6. Conversation propagation → if sibling is linked, link this one
 *
 * NO derived names. Domain is the identifier. Display names come from
 * real data (platform extraction, manual entry, etc.) not guessing.
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = join(import.meta.dir, "../census.db");
const db = new Database(dbPath);

// ============================================================================
// Domain Configuration
// ============================================================================

/**
 * Domains to ignore when linking (internal, platforms, generic).
 */
const IGNORED_DOMAINS = new Set([
  // Internal
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
  // Platforms (we extract real sender from these)
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
  // Generic email providers
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  // Spam/internal
  "avanan-mail.net",
]);

function isIgnoredDomain(domain: string): boolean {
  return IGNORED_DOMAINS.has(domain.toLowerCase());
}

// ============================================================================
// Account Management
// ============================================================================

/**
 * Find or create an account by domain.
 * Domain is the unique key. Name is optional metadata.
 */
function findOrCreateAccountByDomain(
  domain: string,
  companyName?: string | null
): number {
  const lowerDomain = domain.toLowerCase();

  // Skip ignored domains
  if (isIgnoredDomain(lowerDomain)) {
    return -1;
  }

  // Try to find existing account with this domain
  const existing = db
    .query<{ id: number }, [string]>("SELECT id FROM accounts WHERE domain = ?")
    .get(lowerDomain);

  if (existing) {
    // If we have a company name and the account doesn't, update it
    if (companyName) {
      db.run(
        "UPDATE accounts SET name = ? WHERE id = ? AND (name IS NULL OR name = '')",
        [companyName, existing.id]
      );
    }
    return existing.id;
  }

  // Create new account with domain as key
  // Name is the company name if we have it, otherwise just the domain
  const name = companyName || lowerDomain;
  const result = db
    .query<{ id: number }, [string, string]>(
      `INSERT INTO accounts (domain, name, type, created_at, updated_at)
       VALUES (?, ?, 'contractor', datetime('now'), datetime('now'))
       RETURNING id`
    )
    .get(lowerDomain, name);

  return result?.id ?? -1;
}

// ============================================================================
// Linking
// ============================================================================

interface LinkStats {
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

/**
 * Link emails to accounts using domain as the key.
 */
export function linkEmailsToAccounts(): LinkStats {
  const stats: LinkStats = {
    processed: 0,
    linkedByPlatformDomain: 0,
    linkedByForwardDomain: 0,
    linkedByDirectDomain: 0,
    linkedByNameLookup: 0,
    linkedByAlias: 0,
    linkedByConversation: 0,
    accountsCreated: 0,
    skippedIgnoredDomain: 0,
    skippedNoDomain: 0,
    errors: 0,
  };

  const accountsBefore =
    db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM accounts").get()
      ?.c ?? 0;

  // Prepare update statement
  const updateStmt = db.prepare(
    "UPDATE emails SET account_id = ? WHERE id = ? AND (account_id IS NULL OR account_id != ?)"
  );

  db.run("BEGIN TRANSACTION");

  try {
    // ========================================
    // Signal 1: Platform emails with real_sender_domain
    // ========================================
    console.log("Signal 1: Platform emails with real sender domain...");
    const platformEmails = db
      .query<
        {
          id: number;
          real_sender_domain: string;
          real_sender_company: string | null;
        },
        []
      >(
        `SELECT id, real_sender_domain, real_sender_company
         FROM emails
         WHERE real_sender_domain IS NOT NULL
         AND (account_id IS NULL OR account_id <= 0)`
      )
      .all();

    for (const email of platformEmails) {
      stats.processed++;
      const accountId = findOrCreateAccountByDomain(
        email.real_sender_domain,
        email.real_sender_company
      );
      if (accountId > 0) {
        updateStmt.run(accountId, email.id, accountId);
        stats.linkedByPlatformDomain++;
      } else {
        stats.skippedIgnoredDomain++;
      }
    }
    console.log(`  Linked ${stats.linkedByPlatformDomain} platform emails`);

    // ========================================
    // Signal 2: Forward emails with original_sender_domain
    // ========================================
    console.log("Signal 2: Forward emails with original sender domain...");
    const forwardEmails = db
      .query<{ id: number; original_sender_domain: string }, []>(
        `SELECT id, original_sender_domain
         FROM emails
         WHERE original_sender_domain IS NOT NULL
         AND (account_id IS NULL OR account_id <= 0)`
      )
      .all();

    for (const email of forwardEmails) {
      stats.processed++;
      const accountId = findOrCreateAccountByDomain(
        email.original_sender_domain
      );
      if (accountId > 0) {
        updateStmt.run(accountId, email.id, accountId);
        stats.linkedByForwardDomain++;
      } else {
        stats.skippedIgnoredDomain++;
      }
    }
    console.log(`  Linked ${stats.linkedByForwardDomain} forward emails`);

    // ========================================
    // Signal 3: Direct external emails with from_domain
    // ========================================
    console.log("Signal 3: Direct external emails by domain...");
    const directEmails = db
      .query<{ id: number; from_domain: string }, []>(
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
      const accountId = findOrCreateAccountByDomain(email.from_domain);
      if (accountId > 0) {
        updateStmt.run(accountId, email.id, accountId);
        stats.linkedByDirectDomain++;
      } else {
        stats.skippedIgnoredDomain++;
      }
    }
    console.log(`  Linked ${stats.linkedByDirectDomain} direct emails`);

    // ========================================
    // Signal 4: Name lookup (for Procore emails without domain)
    // ========================================
    console.log("Signal 4: Name lookup for platform emails without domain...");

    // Get platform emails that don't have a real_sender_domain but have a person name
    // Procore from_name format: "Julie Conover (Low Mountain Construction Inc)"
    const platformWithoutDomain = db
      .query<{ id: number; from_name: string }, []>(
        `SELECT id, from_name
         FROM emails
         WHERE is_platform_email = 1
         AND real_sender_domain IS NULL
         AND from_name LIKE '% (%'
         AND (account_id IS NULL OR account_id <= 0)`
      )
      .all();

    // Build a cache of name -> domain from all non-platform emails
    const nameToDomain = new Map<string, string>();
    const nameEmails = db
      .query<{ from_name: string; from_domain: string }, []>(
        `SELECT DISTINCT from_name, from_domain
         FROM emails
         WHERE from_domain IS NOT NULL
         AND (is_platform_email = 0 OR is_platform_email IS NULL)
         AND from_name IS NOT NULL`
      )
      .all();

    for (const e of nameEmails) {
      const lowerName = e.from_name.toLowerCase();
      const domain = e.from_domain.toLowerCase();
      // Don't overwrite with ignored domains
      if (!isIgnoredDomain(domain)) {
        nameToDomain.set(lowerName, domain);
      }
    }

    for (const email of platformWithoutDomain) {
      stats.processed++;

      // Extract person name (before parenthesis)
      const namePart = email.from_name.split("(")[0].trim();
      if (namePart.length < 3) {
        stats.skippedNoDomain++;
        continue;
      }

      // Look up this name
      const lowerName = namePart.toLowerCase();
      const domain = nameToDomain.get(lowerName);

      if (domain) {
        const accountId = findOrCreateAccountByDomain(domain);
        if (accountId > 0) {
          updateStmt.run(accountId, email.id, accountId);
          stats.linkedByNameLookup++;
        } else {
          stats.skippedIgnoredDomain++;
        }
      } else {
        stats.skippedNoDomain++;
      }
    }
    console.log(`  Linked ${stats.linkedByNameLookup} via name lookup`);

    // ========================================
    // Signal 5: Company alias lookup
    // ========================================
    console.log("Signal 5: Company alias lookup for platform emails...");

    // Get platform emails that still have no account but have real_sender_company
    const platformWithCompany = db
      .query<{ id: number; real_sender_company: string }, []>(
        `SELECT id, real_sender_company
         FROM emails
         WHERE is_platform_email = 1
         AND real_sender_company IS NOT NULL
         AND (account_id IS NULL OR account_id <= 0)`
      )
      .all();

    for (const email of platformWithCompany) {
      stats.processed++;
      // Look up in company_aliases table
      const aliasMatch = db
        .query<{ account_id: number }, [string]>(
          "SELECT account_id FROM company_aliases WHERE alias = ?"
        )
        .get(email.real_sender_company.toLowerCase());

      if (aliasMatch) {
        updateStmt.run(aliasMatch.account_id, email.id, aliasMatch.account_id);
        stats.linkedByAlias++;
      } else {
        stats.skippedNoDomain++;
      }
    }
    console.log(`  Linked ${stats.linkedByAlias} via company alias`);

    // ========================================
    // Signal 6: Conversation propagation
    // ========================================
    console.log("Signal 6: Propagating via conversation threads...");
    let conversationLinks = 0;
    let iterations = 0;
    const maxIterations = 10;

    do {
      conversationLinks = 0;

      // Find emails in conversations where at least one email is linked
      const unlinkedInLinkedConversations = db
        .query<{ id: number; conversation_id: string }, []>(
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

      for (const email of unlinkedInLinkedConversations) {
        // Get account_id from linked sibling
        const sibling = db
          .query<{ account_id: number }, [string]>(
            `SELECT account_id FROM emails
             WHERE conversation_id = ? AND account_id IS NOT NULL AND account_id > 0
             LIMIT 1`
          )
          .get(email.conversation_id);

        if (sibling) {
          updateStmt.run(sibling.account_id, email.id, sibling.account_id);
          conversationLinks++;
          stats.linkedByConversation++;
          stats.processed++;
        }
      }

      iterations++;
      if (conversationLinks > 0) {
        console.log(
          `  Iteration ${iterations}: linked ${conversationLinks} via conversation`
        );
      }
    } while (conversationLinks > 0 && iterations < maxIterations);

    db.run("COMMIT");

    // Count new accounts
    const accountsAfter =
      db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM accounts").get()
        ?.c ?? 0;
    stats.accountsCreated = accountsAfter - accountsBefore;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("Error during linking:", error);
    stats.errors++;
  }

  return stats;
}

/**
 * Print linking statistics.
 */
function printStats(stats: LinkStats): void {
  console.log("\n=== Account Linking Results ===\n");
  console.log(`Emails processed: ${stats.processed}`);
  console.log(`Linked by platform domain: ${stats.linkedByPlatformDomain}`);
  console.log(`Linked by forward domain: ${stats.linkedByForwardDomain}`);
  console.log(`Linked by direct domain: ${stats.linkedByDirectDomain}`);
  console.log(`Linked by name lookup: ${stats.linkedByNameLookup}`);
  console.log(`Linked by company alias: ${stats.linkedByAlias}`);
  console.log(`Linked by conversation: ${stats.linkedByConversation}`);
  console.log(`Skipped (ignored domain): ${stats.skippedIgnoredDomain}`);
  console.log(`Accounts created: ${stats.accountsCreated}`);

  const totalLinked =
    stats.linkedByPlatformDomain +
    stats.linkedByForwardDomain +
    stats.linkedByDirectDomain +
    stats.linkedByNameLookup +
    stats.linkedByAlias +
    stats.linkedByConversation;
  console.log(`\nTotal newly linked: ${totalLinked}`);

  // Show overall status
  const overall = db
    .query<{ total: number; linked: number }, []>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN account_id IS NOT NULL AND account_id > 0 THEN 1 ELSE 0 END) as linked
       FROM emails
       WHERE (is_internal = 0 OR is_internal IS NULL)
       AND (is_excluded = 0 OR is_excluded IS NULL)`
    )
    .get();

  if (overall) {
    const pct = ((overall.linked / overall.total) * 100).toFixed(1);
    console.log(
      `\nExternal emails linked to accounts: ${overall.linked}/${overall.total} (${pct}%)`
    );
  }
}

// CLI entry point
if (import.meta.main) {
  // Clear existing email-to-account links (but keep accounts with aliases)
  console.log("Clearing existing email links...");
  db.run("UPDATE emails SET account_id = NULL");

  // Only delete accounts that have NO aliases (preserve aliased accounts)
  const deletedAccounts = db.run(
    "DELETE FROM accounts WHERE id NOT IN (SELECT DISTINCT account_id FROM company_aliases)"
  );
  console.log(
    `Cleared email links. Removed ${deletedAccounts.changes} accounts (preserved ${
      db
        .query<{ c: number }, []>(
          "SELECT COUNT(DISTINCT account_id) as c FROM company_aliases"
        )
        .get()?.c ?? 0
    } aliased accounts).\n`
  );

  console.log("Starting account linking (domain as key)...\n");

  const stats = linkEmailsToAccounts();
  printStats(stats);

  // Show top accounts
  console.log("\n=== Top Accounts by Email Count ===");
  const topAccounts = db
    .query<{ name: string; domain: string; count: number }, []>(
      `SELECT a.name, a.domain, COUNT(e.id) as count
       FROM accounts a
       JOIN emails e ON e.account_id = a.id
       GROUP BY a.id
       ORDER BY count DESC
       LIMIT 20`
    )
    .all();

  for (const a of topAccounts) {
    console.log(`  ${a.domain.padEnd(35)} ${a.name.padEnd(35)} ${a.count}`);
  }
}
