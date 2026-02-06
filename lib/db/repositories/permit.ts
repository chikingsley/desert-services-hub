/**
 * Permit Repository
 *
 * CRUD and query operations for dust control permits.
 */
import { db } from "@lib/db/hub";
import type { Permit, PermitStatus, UpsertPermitData } from "@lib/db/types";

function parsePermitRow(row: Record<string, unknown>): Permit {
  return {
    id: row.id as string,
    projectName: row.project_name as string | null,
    accountId: row.account_id as number | null,
    projectId: row.project_id as number | null,
    companyName: row.company_name as string | null,
    portalCompanyId: row.portal_company_id as string | null,
    status: row.status as PermitStatus | null,
    submittedDate: row.submitted_date as string | null,
    effectiveDate: row.effective_date as string | null,
    expirationDate: row.expiration_date as string | null,
    closedDate: row.closed_date as string | null,
    previousAppId: row.previous_app_id as string | null,
    projectStartDate: row.project_start_date as string | null,
    projectEndDate: row.project_end_date as string | null,
    address: row.address as string | null,
    city: row.city as string | null,
    parcel: row.parcel as string | null,
    isBlockPermit: row.is_block_permit === 1,
    isAccelerated: row.is_accelerated === 1,
    invoiceNumber: row.invoice_number as string | null,
    invoiceCharges: row.invoice_charges as number | null,
    invoiceBalance: row.invoice_balance as number | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function upsertPermit(data: UpsertPermitData): void {
  db.run(
    `INSERT INTO permits (
      id, project_name, account_id, project_id, company_name, portal_company_id,
      status, submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_name = COALESCE(excluded.project_name, permits.project_name),
      account_id = COALESCE(excluded.account_id, permits.account_id),
      project_id = COALESCE(excluded.project_id, permits.project_id),
      company_name = COALESCE(excluded.company_name, permits.company_name),
      portal_company_id = COALESCE(excluded.portal_company_id, permits.portal_company_id),
      status = COALESCE(excluded.status, permits.status),
      submitted_date = COALESCE(excluded.submitted_date, permits.submitted_date),
      effective_date = COALESCE(excluded.effective_date, permits.effective_date),
      expiration_date = COALESCE(excluded.expiration_date, permits.expiration_date),
      closed_date = COALESCE(excluded.closed_date, permits.closed_date),
      previous_app_id = COALESCE(excluded.previous_app_id, permits.previous_app_id),
      project_start_date = COALESCE(excluded.project_start_date, permits.project_start_date),
      project_end_date = COALESCE(excluded.project_end_date, permits.project_end_date),
      address = COALESCE(excluded.address, permits.address),
      city = COALESCE(excluded.city, permits.city),
      parcel = COALESCE(excluded.parcel, permits.parcel),
      is_block_permit = excluded.is_block_permit,
      is_accelerated = excluded.is_accelerated,
      invoice_number = COALESCE(excluded.invoice_number, permits.invoice_number),
      invoice_charges = COALESCE(excluded.invoice_charges, permits.invoice_charges),
      invoice_balance = COALESCE(excluded.invoice_balance, permits.invoice_balance),
      updated_at = unixepoch()`,
    [
      data.id,
      data.projectName ?? null,
      data.accountId ?? null,
      data.projectId ?? null,
      data.companyName ?? null,
      data.portalCompanyId ?? null,
      data.status ?? null,
      data.submittedDate ?? null,
      data.effectiveDate ?? null,
      data.expirationDate ?? null,
      data.closedDate ?? null,
      data.previousAppId ?? null,
      data.projectStartDate ?? null,
      data.projectEndDate ?? null,
      data.address ?? null,
      data.city ?? null,
      data.parcel ?? null,
      data.isBlockPermit ? 1 : 0,
      data.isAccelerated ? 1 : 0,
      data.invoiceNumber ?? null,
      data.invoiceCharges ?? null,
      data.invoiceBalance ?? null,
    ]
  );
}

export function getPermitById(id: string): Permit | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM permits WHERE id = ?"
    )
    .get(id);
  return row ? parsePermitRow(row) : null;
}

export function getPermitsByProject(projectId: number): Permit[] {
  return db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM permits WHERE project_id = ? ORDER BY submitted_date DESC"
    )
    .all(projectId)
    .map(parsePermitRow);
}

export function getPermitsByAccount(accountId: number): Permit[] {
  return db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM permits WHERE account_id = ? ORDER BY submitted_date DESC"
    )
    .all(accountId)
    .map(parsePermitRow);
}

export function getPermitsByStatus(status: string): Permit[] {
  return db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM permits WHERE status = ? ORDER BY submitted_date DESC"
    )
    .all(status)
    .map(parsePermitRow);
}

export function getActivePermits(): Permit[] {
  return getPermitsByStatus("Active");
}

export function getUnlinkedPermits(): Permit[] {
  return db
    .query<Record<string, unknown>, []>(
      `SELECT * FROM permits
       WHERE account_id IS NULL OR project_id IS NULL
       ORDER BY submitted_date DESC`
    )
    .all()
    .map(parsePermitRow);
}

export function linkPermitToAccount(permitId: string, accountId: number): void {
  db.run(
    "UPDATE permits SET account_id = ?, updated_at = unixepoch() WHERE id = ?",
    [accountId, permitId]
  );
}

export function linkPermitToProject(permitId: string, projectId: number): void {
  db.run(
    "UPDATE permits SET project_id = ?, updated_at = unixepoch() WHERE id = ?",
    [projectId, permitId]
  );
}

export function searchPermits(query: string): Permit[] {
  const pattern = `%${query}%`;
  return db
    .query<Record<string, unknown>, [string, string, string, string]>(
      `SELECT * FROM permits
       WHERE project_name LIKE ? OR company_name LIKE ? OR address LIKE ? OR id LIKE ?
       ORDER BY submitted_date DESC`
    )
    .all(pattern, pattern, pattern, pattern)
    .map(parsePermitRow);
}

export function getRenewalChain(permitId: string): Permit[] {
  const chain: Permit[] = [];
  let current = getPermitById(permitId);

  while (current) {
    chain.push(current);
    if (current.previousAppId) {
      current = getPermitById(current.previousAppId);
    } else {
      break;
    }
  }

  return chain.reverse();
}

export function getPermitStats(): {
  total: number;
  active: number;
  closed: number;
  linkedToAccount: number;
  linkedToProject: number;
} {
  const total =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM permits")
      .get()?.count ?? 0;

  const active =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM permits WHERE status = 'Active'"
      )
      .get()?.count ?? 0;

  const closed =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM permits WHERE status = 'Closed'"
      )
      .get()?.count ?? 0;

  const linkedToAccount =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM permits WHERE account_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  const linkedToProject =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM permits WHERE project_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  return { total, active, closed, linkedToAccount, linkedToProject };
}
