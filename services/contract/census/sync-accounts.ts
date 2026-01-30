/**
 * Monday.com Accounts Sync
 *
 * Pulls all contractors from the Monday.com CONTRACTORS board and links them
 * to census accounts by domain. This is the bridge that connects emails to
 * Monday — once a census account has a monday_account_id, you can trace:
 *
 *   Email → Census Account (by domain) → Monday Contractor → Estimates/Projects
 *
 * Usage:
 *   bun services/email/census/sync-accounts.ts
 *   bun services/email/census/sync-accounts.ts --dry-run
 *   bun services/email/census/sync-accounts.ts --stats
 */
import { query } from "@/services/monday/client";
import { BOARD_IDS } from "@/services/monday/types";
import { db } from "./db/connection";

// ============================================================================
// Regex Patterns (module-level for performance)
// ============================================================================

const RE_HTTP_PROTOCOL = /^https?:\/\//;
const RE_WWW_PREFIX = /^www\./;
const RE_TRAILING_SLASHES = /\/+$/;

// ============================================
// Types
// ============================================

interface MondayContractor {
  id: string;
  name: string;
  domain: string | null;
}

interface SyncResult {
  totalFetched: number;
  withDomain: number;
  matched: number;
  created: number;
  unmatched: number;
  errors: string[];
}

// ============================================
// Fetch all contractors from Monday
// ============================================

interface MondayItemsPage {
  cursor: string | null;
  items: Array<{
    id: string;
    name: string;
    column_values: Array<{ id: string; text: string | null }>;
  }>;
}

interface MondayBoardsResponse {
  boards: Array<{
    items_page: MondayItemsPage;
  }>;
}

async function fetchAllContractors(): Promise<MondayContractor[]> {
  const contractors: MondayContractor[] = [];
  let cursor: string | null = null;

  do {
    const cursorParam: string = cursor ? `, cursor: "${cursor}"` : "";

    const result: MondayBoardsResponse = await query<MondayBoardsResponse>(`
      query {
        boards(ids: ${BOARD_IDS.CONTRACTORS}) {
          items_page(limit: 500${cursorParam}) {
            cursor
            items {
              id
              name
              column_values(ids: ["company_domain"]) {
                id
                text
              }
            }
          }
        }
      }
    `);

    const page: MondayItemsPage | undefined = result.boards[0]?.items_page;
    const items = page?.items ?? [];

    for (const item of items) {
      const domainCol = item.column_values.find(
        (cv: { id: string; text: string | null }) => cv.id === "company_domain"
      );
      const rawDomain = domainCol?.text ?? null;

      // Clean domain — Monday stores it as "domain.com - https://domain.com"
      // or just "domain.com" or "https://domain.com"
      let domain: string | null = null;
      if (rawDomain) {
        // If it has " - ", take the part before it (that's the clean domain)
        let cleaned = rawDomain.includes(" - ")
          ? rawDomain.split(" - ")[0]
          : rawDomain;

        cleaned = cleaned
          .replace(RE_HTTP_PROTOCOL, "")
          .replace(RE_WWW_PREFIX, "")
          .replace(RE_TRAILING_SLASHES, "")
          .trim()
          .toLowerCase();

        // Skip empty after cleaning
        domain = cleaned.length > 0 ? cleaned : null;
      }

      contractors.push({ id: item.id, name: item.name, domain });
    }

    cursor = page?.cursor ?? null;
  } while (cursor);

  return contractors;
}

// ============================================
// Link contractors to census accounts
// ============================================

function linkContractorsToAccounts(
  contractors: MondayContractor[],
  dryRun: boolean
): SyncResult {
  const result: SyncResult = {
    totalFetched: contractors.length,
    withDomain: 0,
    matched: 0,
    created: 0,
    unmatched: 0,
    errors: [],
  };

  const getAccountByDomain = db.query<
    { id: number; name: string; monday_account_id: string | null },
    [string]
  >("SELECT id, name, monday_account_id FROM accounts WHERE domain = ?");

  const updateAccountMonday = db.query<null, [string, string, string]>(
    `UPDATE accounts
     SET monday_account_id = ?, monday_name = ?, updated_at = datetime('now')
     WHERE domain = ?`
  );

  const _insertAccount = db.query<null, [string, string, string, string]>(
    `INSERT OR IGNORE INTO accounts (domain, name, type, monday_account_id, monday_name)
     VALUES (?, ?, 'contractor', ?, ?)`
  );

  for (const contractor of contractors) {
    if (!contractor.domain) {
      continue;
    }

    result.withDomain++;

    const existing = getAccountByDomain.get(contractor.domain);

    if (existing) {
      // Account exists — link it to Monday
      if (existing.monday_account_id) {
        // Already linked
        result.matched++;
      } else {
        if (!dryRun) {
          updateAccountMonday.run(
            contractor.id,
            contractor.name,
            contractor.domain
          );
        }
        result.matched++;
        console.log(
          `  ✓ Linked: ${contractor.domain} → ${contractor.name} (monday:${contractor.id})`
        );
      }
    } else if (dryRun) {
      // No census account for this domain — create one
      result.unmatched++;
      console.log(
        `  ? Would create: ${contractor.domain} → ${contractor.name}`
      );
    } else {
      // No census account for this domain — create one
      try {
        db.run(
          `INSERT OR IGNORE INTO accounts (domain, name, type, monday_account_id, monday_name)
           VALUES (?, ?, 'contractor', ?, ?)`,
          [contractor.domain, contractor.name, contractor.id, contractor.name]
        );
        result.created++;
        console.log(
          `  + Created: ${contractor.domain} → ${contractor.name} (monday:${contractor.id})`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`${contractor.name}: ${msg}`);
      }
    }
  }

  return result;
}

// ============================================
// Stats
// ============================================

function printStats(): void {
  const total = db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM accounts")
    .get();

  const withMonday = db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM accounts WHERE monday_account_id IS NOT NULL"
    )
    .get();

  const withoutMonday = db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM accounts WHERE monday_account_id IS NULL"
    )
    .get();

  const emailsWithAccount = db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM emails WHERE account_id IS NOT NULL AND is_internal = 0 AND is_excluded = 0"
    )
    .get();

  const emailsWithMondayAccount = db
    .query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM emails e
       JOIN accounts a ON e.account_id = a.id
       WHERE a.monday_account_id IS NOT NULL
       AND e.is_internal = 0 AND e.is_excluded = 0`
    )
    .get();

  const totalExternal = db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM emails WHERE is_internal = 0 AND is_excluded = 0"
    )
    .get();

  console.log(`\n${"=".repeat(50)}`);
  console.log("ACCOUNT LINKING STATS");
  console.log("=".repeat(50));
  console.log(`Total census accounts:           ${total?.count ?? 0}`);
  console.log(`  Linked to Monday:              ${withMonday?.count ?? 0}`);
  console.log(`  Not linked to Monday:          ${withoutMonday?.count ?? 0}`);
  console.log("");
  console.log(`External emails:                 ${totalExternal?.count ?? 0}`);
  console.log(
    `  With census account:           ${emailsWithAccount?.count ?? 0}`
  );
  console.log(
    `  With Monday-linked account:    ${emailsWithMondayAccount?.count ?? 0}`
  );
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const statsOnly = args.includes("--stats");

  if (statsOnly) {
    printStats();
    process.exit(0);
  }

  console.log("=".repeat(50));
  console.log("MONDAY ACCOUNTS SYNC");
  console.log("=".repeat(50));
  if (dryRun) {
    console.log("DRY RUN — no changes will be written\n");
  }

  try {
    console.log("Fetching contractors from Monday.com...");
    const contractors = await fetchAllContractors();
    console.log(`Fetched ${contractors.length} contractors\n`);

    console.log("Linking to census accounts...");
    const result = linkContractorsToAccounts(contractors, dryRun);

    console.log(`\n${"=".repeat(50)}`);
    console.log("SYNC COMPLETE");
    console.log("=".repeat(50));
    console.log(`Monday contractors fetched:  ${result.totalFetched}`);
    console.log(`  With domain:              ${result.withDomain}`);
    console.log(`  Matched existing account: ${result.matched}`);
    console.log(`  Created new account:      ${result.created}`);
    if (dryRun) {
      console.log(`  Would create:             ${result.unmatched}`);
    }

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      for (const err of result.errors.slice(0, 10)) {
        console.log(`  - ${err}`);
      }
    }

    printStats();
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}
