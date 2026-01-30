/**
 * Account Repository
 */
import { db } from "../connection";
import type { Account, AccountType } from "../types";

function parseAccountRow(row: Record<string, unknown>): Account {
  return {
    id: row.id as number,
    domain: row.domain as string,
    name: row.name as string,
    type: (row.type as AccountType) ?? "contractor",
    contactCount: (row.contact_count as number) ?? 0,
    emailCount: (row.email_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createAccount(
  domain: string,
  name: string,
  type: AccountType = "contractor"
): Account {
  db.run(
    `INSERT INTO accounts (domain, name, type) VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET name = ?, type = ?, updated_at = datetime('now')`,
    [domain, name, type, name, type]
  );

  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM accounts WHERE domain = ?"
    )
    .get(domain);

  if (!row) {
    throw new Error(`Failed to create/retrieve account for domain: ${domain}`);
  }
  return parseAccountRow(row);
}

export function getAccountByDomain(domain: string): Account | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM accounts WHERE domain = ?"
    )
    .get(domain);

  return row ? parseAccountRow(row) : null;
}

export function getAccountIdByAlias(alias: string): number | null {
  const row = db
    .query<{ account_id: number }, [string]>(
      "SELECT account_id FROM company_aliases WHERE alias = ?"
    )
    .get(alias.toLowerCase());

  return row?.account_id ?? null;
}

export function addCompanyAlias(accountId: number, alias: string): boolean {
  try {
    db.run(
      "INSERT OR IGNORE INTO company_aliases (account_id, alias) VALUES (?, ?)",
      [accountId, alias.toLowerCase()]
    );
    return true;
  } catch {
    return false;
  }
}

export function getAllAccounts(type?: AccountType): Account[] {
  const query = type
    ? "SELECT * FROM accounts WHERE type = ? ORDER BY email_count DESC"
    : "SELECT * FROM accounts ORDER BY email_count DESC";

  const rows = type
    ? db.query<Record<string, unknown>, [string]>(query).all(type)
    : db.query<Record<string, unknown>, []>(query).all();

  return rows.map(parseAccountRow);
}

export function updateAccountCounts(): void {
  db.run(`
    UPDATE accounts SET
      email_count = (
        SELECT COUNT(*) FROM emails WHERE account_id = accounts.id
      ),
      contact_count = (
        SELECT COUNT(DISTINCT from_email) FROM emails WHERE account_id = accounts.id
      ),
      updated_at = datetime('now')
  `);
}

export function linkEmailToAccount(emailId: number, accountId: number): void {
  db.run("UPDATE emails SET account_id = ? WHERE id = ?", [accountId, emailId]);
}
