/**
 * Enrich accounts with PDL Company Cleaner
 *
 * DURABLE: Saves after each enrichment, can resume anytime
 * RATE LIMITED: 10 req/min (6 second delay between calls)
 *
 * Run: bun services/enrichment/enrich-accounts.ts
 * Check status: bun services/enrichment/enrich-accounts.ts --status
 *
 * Free tier: 10,000/month - we have 3,580 accounts = ~36% of limit
 * Runtime: ~6 hours for all accounts (rate limited)
 */
import { Database } from "bun:sqlite";
import { cleanCompany } from "@email/enrichment/pdl/company";

const HUB_DB_PATH = "apps/contract/hub.db";
const RATE_LIMIT_DELAY_MS = 6500; // 6.5 seconds between calls (safe margin)

// ============================================================================
// Database setup
// ============================================================================

function getDb(): Database {
  const db = new Database(HUB_DB_PATH);
  ensureColumns(db);
  return db;
}

function ensureColumns(db: Database): void {
  // Add pdl_enrichment column if it doesn't exist
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(accounts)")
    .all();

  const hasEnrichment = columns.some((c) => c.name === "pdl_enrichment");
  if (!hasEnrichment) {
    db.run("ALTER TABLE accounts ADD COLUMN pdl_enrichment TEXT");
    console.log("Added pdl_enrichment column to accounts table");
  }

  const hasEnrichedAt = columns.some((c) => c.name === "pdl_enriched_at");
  if (!hasEnrichedAt) {
    db.run("ALTER TABLE accounts ADD COLUMN pdl_enriched_at TEXT");
    console.log("Added pdl_enriched_at column to accounts table");
  }
}

// ============================================================================
// Status check
// ============================================================================

interface StatusRow {
  total: number;
  enriched: number;
  pending: number;
  with_domain: number;
  without_domain: number;
}

function getStatus(db: Database): StatusRow {
  const row = db
    .query<StatusRow, []>(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pdl_enrichment IS NOT NULL THEN 1 ELSE 0 END) as enriched,
      SUM(CASE WHEN pdl_enrichment IS NULL THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN domain IS NOT NULL AND domain <> '' THEN 1 ELSE 0 END) as with_domain,
      SUM(CASE WHEN domain IS NULL OR domain = '' THEN 1 ELSE 0 END) as without_domain
    FROM accounts
  `
    )
    .get();

  return (
    row ?? {
      total: 0,
      enriched: 0,
      pending: 0,
      with_domain: 0,
      without_domain: 0,
    }
  );
}

function printStatus(db: Database): void {
  const status = getStatus(db);
  const pct =
    status.total > 0
      ? ((status.enriched / status.total) * 100).toFixed(1)
      : "0";
  const remainingMinutes = Math.ceil(
    (status.pending * RATE_LIMIT_DELAY_MS) / 1000 / 60
  );
  const remainingHours = (remainingMinutes / 60).toFixed(1);

  console.log("\n=== PDL Account Enrichment Status ===\n");
  console.log(`Total accounts:     ${status.total}`);
  console.log(`Enriched:           ${status.enriched} (${pct}%)`);
  console.log(`Pending:            ${status.pending}`);
  console.log(`  - With domain:    ${status.with_domain}`);
  console.log(`  - Without domain: ${status.without_domain}`);
  console.log(
    `\nEstimated time remaining: ${remainingHours} hours (~${remainingMinutes} min)`
  );
  console.log("");
}

// ============================================================================
// Enrichment
// ============================================================================

interface AccountRow {
  id: number;
  name: string;
  domain: string | null;
}

function getPendingAccounts(db: Database, limit?: number): AccountRow[] {
  const sql = `
    SELECT id, name, domain
    FROM accounts
    WHERE pdl_enrichment IS NULL
    ORDER BY id
    ${limit ? `LIMIT ${limit}` : ""}
  `;
  return db.query<AccountRow, []>(sql).all();
}

function saveEnrichment(db: Database, accountId: number, result: object): void {
  db.run(
    `
    UPDATE accounts
    SET pdl_enrichment = ?,
        pdl_enriched_at = datetime('now')
    WHERE id = ?
  `,
    [JSON.stringify(result), accountId]
  );
}

function serializeError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === "object") {
    // Handle PDL error responses which may be objects
    const obj = err as Record<string, unknown>;
    if (obj.message) {
      return String(obj.message);
    }
    if (obj.error) {
      return String(obj.error);
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error (non-serializable)";
    }
  }
  return String(err);
}

async function enrichAccount(
  account: AccountRow
): Promise<{ success: boolean; data?: object; error?: string }> {
  // Use name + website if we have domain, otherwise just name
  const params = account.domain?.trim()
    ? { name: account.name, website: account.domain }
    : { name: account.name };

  const result = await cleanCompany(params);

  if (result.success) {
    return {
      success: true,
      data: {
        input: params,
        output: result.company,
        fuzzyMatch: result.fuzzyMatch,
        timeMs: result.timeMs,
      },
    };
  }

  const errorStr = serializeError(result.error);
  return {
    success: false,
    data: {
      input: params,
      error: errorStr,
      timeMs: result.timeMs,
    },
    error: errorStr,
  };
}

async function runEnrichment(db: Database, batchSize?: number): Promise<void> {
  const pending = getPendingAccounts(db, batchSize);

  if (pending.length === 0) {
    console.log("All accounts already enriched!");
    return;
  }

  const status = getStatus(db);
  console.log(`\nStarting enrichment: ${pending.length} accounts to process`);
  console.log(`Already enriched: ${status.enriched}/${status.total}`);
  console.log(`Rate limit: ${RATE_LIMIT_DELAY_MS}ms between calls\n`);

  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < pending.length; i++) {
    const account = pending[i];
    const progress = `[${status.enriched + i + 1}/${status.total}]`;

    try {
      const result = await enrichAccount(account);

      // Save immediately (durable!)
      saveEnrichment(db, account.id, result.data ?? {});

      if (result.success) {
        successCount++;
        console.log(`${progress} ✓ ${account.name}`);
      } else {
        errorCount++;
        console.log(`${progress} ✗ ${account.name}: ${result.error}`);
      }
    } catch (err) {
      errorCount++;
      const errorMsg = serializeError(err);
      saveEnrichment(db, account.id, {
        input: { name: account.name },
        error: errorMsg,
      });
      console.log(`${progress} ✗ ${account.name}: ${errorMsg}`);
    }

    // Progress report every 50 accounts
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000 / 60;
      const rate = (i + 1) / elapsed;
      const remaining = (pending.length - i - 1) / rate;
      console.log(
        `\n--- Progress: ${i + 1}/${pending.length} | ${elapsed.toFixed(1)}min elapsed | ~${remaining.toFixed(1)}min remaining ---\n`
      );
    }

    // Rate limit (skip after last item)
    if (i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log("\n=== Enrichment Complete ===");
  console.log(`Processed: ${pending.length} accounts in ${totalTime} minutes`);
  console.log(`Success: ${successCount} | Errors: ${errorCount}`);
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const db = getDb();

  if (args.includes("--status") || args.includes("-s")) {
    printStatus(db);
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
PDL Account Enrichment

Usage:
  bun services/enrichment/enrich-accounts.ts           # Run enrichment (all pending)
  bun services/enrichment/enrich-accounts.ts --status  # Check progress
  bun services/enrichment/enrich-accounts.ts --batch 100  # Process 100 accounts
  bun services/enrichment/enrich-accounts.ts --test    # Test with 3 accounts

Options:
  --status, -s    Show enrichment status
  --batch N       Process N accounts then stop
  --test          Test mode: process 3 accounts
  --help, -h      Show this help
`);
    return;
  }

  // Test mode
  if (args.includes("--test")) {
    console.log("Test mode: processing 3 accounts\n");
    await runEnrichment(db, 3);
    printStatus(db);
    return;
  }

  // Batch mode
  const batchIdx = args.indexOf("--batch");
  if (batchIdx !== -1 && args[batchIdx + 1]) {
    const batchSize = Number.parseInt(args[batchIdx + 1], 10);
    if (Number.isNaN(batchSize) || batchSize < 1) {
      console.error("Invalid batch size");
      process.exit(1);
    }
    await runEnrichment(db, batchSize);
    printStatus(db);
    return;
  }

  // Full run
  printStatus(db);
  await runEnrichment(db);
  printStatus(db);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
