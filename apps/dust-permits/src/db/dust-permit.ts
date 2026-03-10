/**
 * Dust Permit Repository
 *
 * CRUD and query operations for dust_permits_filed_by_desert_services.
 */
import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import { parseBoolInt } from "@lib/db/parsers";
import type { Permit, PermitStatus, UpsertPermitData } from "@lib/db/types";

type PermitRow =
  Database["public"]["Tables"]["dust_permits_filed_by_desert_services"]["Row"];

function parsePermitRow(row: PermitRow): Permit {
  return {
    id: row.id,
    projectName: row.project_name,
    facilityId: row.facility_id,
    accountId: row.account_id,
    projectId: row.project_id,
    companyName: row.company_name,
    portalCompanyId: row.portal_company_id,
    status: row.status as PermitStatus | null,
    submittedDate: row.submitted_date,
    effectiveDate: row.effective_date,
    expirationDate: row.expiration_date,
    closedDate: row.closed_date,
    previousAppId: row.previous_app_id,
    projectStartDate: row.project_start_date,
    projectEndDate: row.project_end_date,
    address: row.address,
    city: row.city,
    parcel: row.parcel,
    isBlockPermit: parseBoolInt(row.is_block_permit),
    isAccelerated: parseBoolInt(row.is_accelerated),
    invoiceNumber: row.invoice_number,
    invoiceCharges: row.invoice_charges,
    invoiceBalance: row.invoice_balance,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function toPermitUpsertParams(data: UpsertPermitData): unknown[] {
  return [
    data.id,
    data.projectName ?? null,
    data.facilityId ?? null,
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
    Number(data.isBlockPermit === true),
    Number(data.isAccelerated === true),
    data.invoiceNumber ?? null,
    data.invoiceCharges ?? null,
    data.invoiceBalance ?? null,
  ];
}

export async function upsertPermit(data: UpsertPermitData): Promise<void> {
  await db.run(
    `INSERT INTO dust_permits_filed_by_desert_services (
      id, project_name, facility_id, account_id, project_id, company_name, portal_company_id,
      status, submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    ON CONFLICT(id) DO UPDATE SET
      project_name = COALESCE(excluded.project_name, dust_permits_filed_by_desert_services.project_name),
      facility_id = COALESCE(excluded.facility_id, dust_permits_filed_by_desert_services.facility_id),
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
      updated_at = (extract(epoch FROM now()))::bigint`,
    toPermitUpsertParams(data)
  );
}

export async function getPermitById(id: string): Promise<Permit | null> {
  const row = await db
    .query<PermitRow, [string]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
    )
    .get(id);
  return row ? parsePermitRow(row) : null;
}

export async function getLatestDraftForPermit(
  permitId: string
): Promise<Permit | null> {
  const row = await db
    .query<PermitRow, [string]>(
      `SELECT *
       FROM dust_permits_filed_by_desert_services
       WHERE previous_app_id = $1
         AND status = 'Draft'
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`
    )
    .get(permitId);
  return row ? parsePermitRow(row) : null;
}

export async function getPermitsByProject(
  projectId: number
): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, [number]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE project_id = $1 ORDER BY submitted_date DESC"
    )
    .all(projectId);
  return rows.map(parsePermitRow);
}

export async function getPermitsByAccount(
  accountId: number
): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, [number]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE account_id = $1 ORDER BY submitted_date DESC"
    )
    .all(accountId);
  return rows.map(parsePermitRow);
}

export async function getPermitsByStatus(status: string): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, [string]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE status = $1 ORDER BY submitted_date DESC"
    )
    .all(status);
  return rows.map(parsePermitRow);
}

export async function getActivePermits(): Promise<Permit[]> {
  return await getPermitsByStatus("Active");
}

export async function getUnlinkedPermits(): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, []>(
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
    "UPDATE dust_permits_filed_by_desert_services SET account_id = $1, updated_at = (extract(epoch FROM now()))::bigint WHERE id = $2",
    [accountId, permitId]
  );
}

export async function linkPermitToProject(
  permitId: string,
  projectId: number
): Promise<void> {
  await db.run(
    "UPDATE dust_permits_filed_by_desert_services SET project_id = $1, updated_at = (extract(epoch FROM now()))::bigint WHERE id = $2",
    [projectId, permitId]
  );
}

export async function ftsSearchPermits(
  query: string,
  limit = 20
): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow>(
      `SELECT *
       FROM dust_permits_filed_by_desert_services
       WHERE search_vector @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', $1)) DESC,
                (status = 'Active')::int DESC,
                expiration_date DESC NULLS LAST
       LIMIT $2`
    )
    .all(query, limit);
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
      "SELECT 1 as n FROM dust_permits_filed_by_desert_services WHERE id = $1 LIMIT 1"
    )
    .get(id);
  return row !== null;
}

export async function getExpiringPermits(withinDays = 30): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, [number]>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE status = 'Active'
         AND expiration_date IS NOT NULL
         AND expiration_date <= (CURRENT_DATE + MAKE_INTERVAL(days => $1))::text
       ORDER BY expiration_date`
    )
    .all(withinDays);
  return rows.map(parsePermitRow);
}

export async function getPermitsNeedingScrape(limit = 100): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, [number]>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE updated_at = created_at
         AND COALESCE(status, '') <> 'Draft'
         AND EXISTS (
           SELECT 1
           FROM aqdata_permits aq
           WHERE aq.id = dust_permits_filed_by_desert_services.id
         )
       ORDER BY created_at
       LIMIT $1`
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
       WHERE id = $1`,
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

export interface CompanyMatch {
  companyName: string;
  permitCount: number;
  portalCompanyId: string | null;
}

/**
 * Find a company by name in our permits database.
 * Case-insensitive exact match first, then ILIKE prefix/contains fallback.
 * Returns the best match (most permits filed) or null.
 */
export async function findCompanyByName(
  name: string
): Promise<CompanyMatch | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  // Exact case-insensitive match (most reliable)
  const exact = await db
    .query<
      { company_name: string; portal_company_id: string | null; cnt: number },
      [string]
    >(
      `SELECT company_name, portal_company_id, COUNT(*)::int AS cnt
       FROM dust_permits_filed_by_desert_services
       WHERE LOWER(company_name) = LOWER($1)
       GROUP BY company_name, portal_company_id
       ORDER BY cnt DESC
       LIMIT 1`
    )
    .get(trimmed);

  if (exact) {
    return {
      companyName: exact.company_name,
      portalCompanyId: exact.portal_company_id,
      permitCount: exact.cnt,
    };
  }

  // Fuzzy fallback: ILIKE contains match
  const fuzzy = await db
    .query<
      { company_name: string; portal_company_id: string | null; cnt: number },
      [string]
    >(
      `SELECT company_name, portal_company_id, COUNT(*)::int AS cnt
       FROM dust_permits_filed_by_desert_services
       WHERE company_name ILIKE '%' || $1 || '%'
       GROUP BY company_name, portal_company_id
       ORDER BY cnt DESC
       LIMIT 1`
    )
    .get(trimmed);

  if (fuzzy) {
    return {
      companyName: fuzzy.company_name,
      portalCompanyId: fuzzy.portal_company_id,
      permitCount: fuzzy.cnt,
    };
  }

  return null;
}

export async function getPermitsByPortalCompany(
  portalCompanyId: string
): Promise<Permit[]> {
  const rows = await db
    .query<PermitRow, [string]>(
      `SELECT * FROM dust_permits_filed_by_desert_services
       WHERE portal_company_id = $1
       ORDER BY submitted_date DESC`
    )
    .all(portalCompanyId);
  return rows.map(parsePermitRow);
}

export async function deleteRecentPermits(count: number): Promise<string[]> {
  const rows = await db
    .query<{ id: string }, [number]>(
      "SELECT id FROM dust_permits_filed_by_desert_services ORDER BY created_at DESC LIMIT $1"
    )
    .all(count);
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    for (const id of ids) {
      await db.run(
        "DELETE FROM dust_permits_filed_by_desert_services WHERE id = $1",
        [id]
      );
    }
  }
  return ids;
}
