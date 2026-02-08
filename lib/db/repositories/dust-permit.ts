/**
 * Dust Permit Repository
 *
 * CRUD and query operations for dust_permits_filed_by_desert_services.
 */
import { db } from "@lib/db/hub";
import { likeSearch } from "@lib/db/search";
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

export async function upsertPermit(data: UpsertPermitData): Promise<void> {
  await db.run(
    `INSERT INTO dust_permits_filed_by_desert_services (
      id, project_name, account_id, project_id, company_name, portal_company_id,
      status, submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_name = COALESCE(excluded.project_name, dust_permits_filed_by_desert_services.project_name),
      account_id = COALESCE(excluded.account_id, dust_permits_filed_by_desert_services.account_id),
      project_id = COALESCE(excluded.project_id, dust_permits_filed_by_desert_services.project_id),
      company_name = COALESCE(excluded.company_name, dust_permits_filed_by_desert_services.company_name),
      portal_company_id = COALESCE(excluded.portal_company_id, dust_permits_filed_by_desert_services.portal_company_id),
      status = COALESCE(excluded.status, dust_permits_filed_by_desert_services.status),
      submitted_date = COALESCE(excluded.submitted_date, dust_permits_filed_by_desert_services.submitted_date),
      effective_date = COALESCE(excluded.effective_date, dust_permits_filed_by_desert_services.effective_date),
      expiration_date = COALESCE(excluded.expiration_date, dust_permits_filed_by_desert_services.expiration_date),
      closed_date = COALESCE(excluded.closed_date, dust_permits_filed_by_desert_services.closed_date),
      previous_app_id = COALESCE(excluded.previous_app_id, dust_permits_filed_by_desert_services.previous_app_id),
      project_start_date = COALESCE(excluded.project_start_date, dust_permits_filed_by_desert_services.project_start_date),
      project_end_date = COALESCE(excluded.project_end_date, dust_permits_filed_by_desert_services.project_end_date),
      address = COALESCE(excluded.address, dust_permits_filed_by_desert_services.address),
      city = COALESCE(excluded.city, dust_permits_filed_by_desert_services.city),
      parcel = COALESCE(excluded.parcel, dust_permits_filed_by_desert_services.parcel),
      is_block_permit = excluded.is_block_permit,
      is_accelerated = excluded.is_accelerated,
      invoice_number = COALESCE(excluded.invoice_number, dust_permits_filed_by_desert_services.invoice_number),
      invoice_charges = COALESCE(excluded.invoice_charges, dust_permits_filed_by_desert_services.invoice_charges),
      invoice_balance = COALESCE(excluded.invoice_balance, dust_permits_filed_by_desert_services.invoice_balance),
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

export async function getPermitById(id: string): Promise<Permit | null> {
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = ?"
    )
    .get(id);
  return row ? parsePermitRow(row) : null;
}

export async function getPermitsByProject(
  projectId: number
): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE project_id = ? ORDER BY submitted_date DESC"
    )
    .all(projectId);
  return rows.map(parsePermitRow);
}

export async function getPermitsByAccount(
  accountId: number
): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE account_id = ? ORDER BY submitted_date DESC"
    )
    .all(accountId);
  return rows.map(parsePermitRow);
}

export async function getPermitsByStatus(status: string): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE status = ? ORDER BY submitted_date DESC"
    )
    .all(status);
  return rows.map(parsePermitRow);
}

export async function getActivePermits(): Promise<Permit[]> {
  return await getPermitsByStatus("Active");
}

export async function getUnlinkedPermits(): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, []>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE account_id IS NULL OR project_id IS NULL
       ORDER BY submitted_date DESC`
    )
    .all();
  return rows.map(parsePermitRow);
}

export async function linkPermitToAccount(
  permitId: string,
  accountId: number
): Promise<void> {
  await db.run(
    "UPDATE dust_permits_filed_by_desert_services SET account_id = ?, updated_at = unixepoch() WHERE id = ?",
    [accountId, permitId]
  );
}

export async function linkPermitToProject(
  permitId: string,
  projectId: number
): Promise<void> {
  await db.run(
    "UPDATE dust_permits_filed_by_desert_services SET project_id = ?, updated_at = unixepoch() WHERE id = ?",
    [projectId, permitId]
  );
}

export async function searchPermits(query: string): Promise<Permit[]> {
  const rows = await likeSearch<Record<string, unknown>>({
    table: "dust_permits_filed_by_desert_services",
    columns: ["project_name", "company_name", "address", "id"],
    query,
    orderBy: "submitted_date DESC",
  });
  return rows.map(parsePermitRow);
}

export async function getRenewalChain(permitId: string): Promise<Permit[]> {
  const chain: Permit[] = [];
  let current = await getPermitById(permitId);

  while (current) {
    chain.push(current);
    if (current.previousAppId) {
      current = await getPermitById(current.previousAppId);
    } else {
      break;
    }
  }

  return chain.reverse();
}

export async function getPermitStats(): Promise<{
  total: number;
  active: number;
  closed: number;
  linkedToAccount: number;
  linkedToProject: number;
}> {
  const total =
    (
      await db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services"
        )
        .get()
    )?.count ?? 0;

  const active =
    (
      await db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services WHERE status = 'Active'"
        )
        .get()
    )?.count ?? 0;

  const closed =
    (
      await db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services WHERE status = 'Closed'"
        )
        .get()
    )?.count ?? 0;

  const linkedToAccount =
    (
      await db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services WHERE account_id IS NOT NULL"
        )
        .get()
    )?.count ?? 0;

  const linkedToProject =
    (
      await db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services WHERE project_id IS NOT NULL"
        )
        .get()
    )?.count ?? 0;

  return { total, active, closed, linkedToAccount, linkedToProject };
}

export async function permitExists(id: string): Promise<boolean> {
  const row = await db
    .query<{ n: number }, [string]>(
      "SELECT 1 as n FROM dust_permits_filed_by_desert_services WHERE id = ? LIMIT 1"
    )
    .get(id);
  return row !== null;
}

export async function getExpiringPermits(
  withinDays = 30
): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE status = 'Active'
         AND expiration_date IS NOT NULL
         AND expiration_date <= (CURRENT_DATE + MAKE_INTERVAL(days => ?))::text
       ORDER BY expiration_date`
    )
    .all(withinDays);
  return rows.map(parsePermitRow);
}

export async function getPermitsNeedingScrape(
  limit = 100
): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE updated_at = created_at
       ORDER BY created_at
       LIMIT ?`
    )
    .all(limit);
  return rows.map(parsePermitRow);
}

export async function markPermitScraped(
  id: string,
  details?: Partial<UpsertPermitData>
): Promise<void> {
  if (details) {
    await upsertPermit({ id, ...details });
  } else {
    await db.run(
      `UPDATE dust_permits_filed_by_desert_services
       SET updated_at = (extract(epoch FROM now()))::bigint
       WHERE id = ?`,
      [id]
    );
  }
}

export async function getPermitCount(): Promise<number> {
  const row = await db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services"
    )
    .get();
  return row?.count ?? 0;
}

export async function getPermitsByPortalCompany(
  portalCompanyId: string
): Promise<Permit[]> {
  const rows = await db
    .query<Record<string, unknown>, [string]>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE portal_company_id = ?
       ORDER BY submitted_date DESC`
    )
    .all(portalCompanyId);
  return rows.map(parsePermitRow);
}

export async function deleteRecentPermits(
  count: number
): Promise<string[]> {
  const rows = await db
    .query<{ id: string }, [number]>(
      "SELECT id FROM dust_permits_filed_by_desert_services ORDER BY created_at DESC LIMIT ?"
    )
    .all(count);
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    for (const id of ids) {
      await db.run(
        "DELETE FROM dust_permits_filed_by_desert_services WHERE id = ?",
        [id]
      );
    }
  }
  return ids;
}
