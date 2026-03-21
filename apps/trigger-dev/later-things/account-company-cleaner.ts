import {
  buildCompanyCleanerInput,
  shouldAttemptPdlCompanyCleaner,
} from "@accounts/pdl-cleaner";
import { db } from "@lib/db/client";
import { isConfigured, RATE_LIMIT_DELAY } from "@/packages/enrichment/pdl/client";
import { cleanCompany } from "@/packages/enrichment/pdl/company";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const DEFAULT_BATCH_LIMIT = 1;
const MAX_BATCH_LIMIT = 5;
const DEFAULT_RECENT_DAYS = 14;

interface AccountCleanerRow {
  createdAt: string | null;
  domain: string | null;
  id: number;
  mondayAccountId: string | null;
  name: string;
  pdlEnrichedAt: string | null;
  updatedAt: string | null;
}

interface AccountCleanerRunResult {
  accountId: number;
  fuzzyMatch: boolean | null;
  input: { name?: string; website?: string } | null;
  reason: string | null;
  repairedDomain: string | null;
  status: "enriched" | "skipped";
  success: boolean | null;
}

const cleanerSchema = z.object({
  accountId: z.number().int().positive().optional(),
  force: z.boolean().default(false),
  limit: z.number().int().min(1).max(MAX_BATCH_LIMIT).default(DEFAULT_BATCH_LIMIT),
  recentDays: z.number().int().min(1).max(90).default(DEFAULT_RECENT_DAYS),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccountById(accountId: number): Promise<AccountCleanerRow | null> {
  return await db
    .query<AccountCleanerRow, [number]>(
      `SELECT
         id,
         name,
         domain,
         monday_account_id AS "mondayAccountId",
         pdl_enriched_at AS "pdlEnrichedAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM accounts
       WHERE id = $1`
    )
    .get(accountId);
}

async function getPendingAccounts(
  limit: number,
  recentDays: number
): Promise<AccountCleanerRow[]> {
  return await db
    .query<AccountCleanerRow, [number, number]>(
      `SELECT
         id,
         name,
         domain,
         monday_account_id AS "mondayAccountId",
         pdl_enriched_at AS "pdlEnrichedAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM accounts
       WHERE type = 'contractor'
         AND monday_account_id IS NULL
         AND pdl_enriched_at IS NULL
         AND created_at >= now() - make_interval(days => $2)
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT $1`
    )
    .all(limit, recentDays);
}

async function persistCleanerAttempt(
  accountId: number,
  payload: unknown
): Promise<void> {
  await db.run(
    `UPDATE accounts
     SET pdl_enrichment = $1::jsonb,
         pdl_enriched_at = now(),
         updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(payload), accountId]
  );
}

async function runCleanerForAccount(
  row: AccountCleanerRow,
  options: { force?: boolean; source: string }
): Promise<AccountCleanerRunResult> {
  const decision = shouldAttemptPdlCompanyCleaner(row, {
    force: options.force,
  });

  if (!decision.shouldAttempt) {
    return {
      accountId: row.id,
      fuzzyMatch: null,
      input: null,
      reason: decision.reason,
      repairedDomain: null,
      status: "skipped",
      success: null,
    };
  }

  const result = await cleanCompany(decision.input);
  await persistCleanerAttempt(row.id, {
    attemptedAt: new Date().toISOString(),
    input: decision.input,
    repairedDomain: decision.repairedDomain,
    source: options.source,
    result,
  });

  return {
    accountId: row.id,
    fuzzyMatch: result.fuzzyMatch,
    input: decision.input,
    reason: null,
    repairedDomain: decision.repairedDomain,
    status: "enriched",
    success: result.success,
  };
}

async function runCleanerBatch(options: {
  accountId?: number;
  force?: boolean;
  limit: number;
  recentDays: number;
  source: string;
}): Promise<{
  processed: number;
  results: AccountCleanerRunResult[];
  skipped: boolean;
}> {
  if (!isConfigured()) {
    logger.warn("Skipping account-company-cleaner; PDL is not configured");
    return { processed: 0, results: [], skipped: true };
  }

  const rows = options.accountId
    ? [await getAccountById(options.accountId)].filter(
        (row): row is AccountCleanerRow => Boolean(row)
      )
    : await getPendingAccounts(options.limit, options.recentDays);

  const results: AccountCleanerRunResult[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const builtInput = buildCompanyCleanerInput(row);
    const result = await runCleanerForAccount(row, {
      force: options.force,
      source: options.source,
    });
    results.push(result);

    logger.info("Account company cleaner processed account", {
      accountId: row.id,
      input: builtInput?.input ?? null,
      result,
    });

    if (index < rows.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  return { processed: rows.length, results, skipped: false };
}

export const accountCompanyCleaner = schemaTask({
  id: "account-company-cleaner",
  schema: cleanerSchema,
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async ({ accountId, force, limit, recentDays }) => {
    return await runCleanerBatch({
      accountId,
      force,
      limit: accountId ? 1 : limit,
      recentDays,
      source: "manual",
    });
  },
});
