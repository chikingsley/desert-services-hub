/**
 * Account Repository
 */
import { db } from "@lib/db/client";
import type { Account, AccountType } from "@lib/db/types";

function parseAccountRow(row: Record<string, unknown>): Account {
  return {
    id: row.id as number,
    domain: row.domain as string,
    name: row.name as string,
    type: (row.type as AccountType) ?? "contractor",
    contactCount: (row.contact_count as number) ?? 0,
    emailCount: (row.email_count as number) ?? 0,
    mondayAccountId: row.monday_account_id as string | null,
    mondayName: row.monday_name as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createAccount(
  domain: string,
  name: string,
  type: AccountType = "contractor"
): Promise<Account> {
  await db.run(
    `INSERT INTO accounts (domain, name, type) VALUES ($1, $2, $3)
     ON CONFLICT(domain) DO UPDATE SET name = $4, type = $5, updated_at = now()`,
    [domain, name, type, name, type]
  );

  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM accounts WHERE domain = ?"
    )
    .get(domain);

  if (!row) {
    throw new Error(`Failed to create/retrieve account for domain: ${domain}`);
  }
  return parseAccountRow(row);
}

export async function getAccountByDomain(
  domain: string
): Promise<Account | null> {
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM accounts WHERE domain = ?"
    )
    .get(domain);

  return row ? parseAccountRow(row) : null;
}

export async function getAccountIdByAlias(
  alias: string
): Promise<number | null> {
  const row = await db
    .query<{ account_id: number }, [string]>(
      "SELECT account_id FROM company_aliases WHERE alias = $1"
    )
    .get(alias.toLowerCase());

  return row?.account_id ?? null;
}

export async function addCompanyAlias(
  accountId: number,
  alias: string
): Promise<boolean> {
  try {
    await db.run(
      `INSERT INTO company_aliases (account_id, alias)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [accountId, alias.toLowerCase()]
    );
    return true;
  } catch {
    return false;
  }
}

export async function getAllAccounts(type?: AccountType): Promise<Account[]> {
  const query = type
    ? "SELECT * FROM accounts WHERE type = ? ORDER BY email_count DESC"
    : "SELECT * FROM accounts ORDER BY email_count DESC";

  const rows = type
    ? await db.query<Record<string, unknown>, [string]>(query).all(type)
    : await db.query<Record<string, unknown>, []>(query).all();

  return rows.map(parseAccountRow);
}

export async function updateAccountCounts(): Promise<void> {
  await db.run(`
    UPDATE accounts SET
      email_count = (
        SELECT COUNT(*) FROM emails WHERE account_id = accounts.id
      ),
      contact_count = (
        SELECT COUNT(DISTINCT from_email) FROM emails WHERE account_id = accounts.id
      ),
      updated_at = now()
  `);
}

export async function linkEmailToAccount(
  emailId: number,
  accountId: number
): Promise<void> {
  await db.run("UPDATE emails SET account_id = $1 WHERE id = $2", [
    accountId,
    emailId,
  ]);
}
