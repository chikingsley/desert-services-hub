/**
 * Marketing Permit Repository
 *
 * CRUD operations for marketing_permits (all Maricopa County permits).
 * Used for market intelligence and sales prospecting.
 */
import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import {
  parseBoolInt,
  parseJsonRecord,
  parseNumberOrNull,
} from "@lib/db/parsers";
import type {
  MarketingPermit,
  PermitStatus,
  UpsertMarketingPermitData,
} from "@lib/db/types";

type MarketingPermitRow =
  Database["public"]["Tables"]["marketing_permits"]["Row"];

function parseMarketingPermitRow(row: MarketingPermitRow): MarketingPermit {
  return {
    id: row.id,
    projectName: row.project_name,
    companyId: row.company_id,
    companyName: row.company_name,
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
    invoiceCharges: parseNumberOrNull(row.invoice_charges),
    invoiceBalance: parseNumberOrNull(row.invoice_balance),
    rawData: parseJsonRecord(row.raw_data),
    scrapedAt: parseNumberOrNull(row.scraped_at),
    detailScrapedAt: parseNumberOrNull(row.detail_scraped_at),
    createdAt: parseNumberOrNull(row.created_at) ?? 0,
  };
}

export async function upsertMarketingPermit(
  data: UpsertMarketingPermitData
): Promise<void> {
  await db.run(
    `INSERT INTO marketing_permits (
      id, project_name, company_id, company_name, status,
      submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance, raw_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT(id) DO UPDATE SET
      project_name = COALESCE(excluded.project_name, marketing_permits.project_name),
      company_id = COALESCE(excluded.company_id, marketing_permits.company_id),
      company_name = COALESCE(excluded.company_name, marketing_permits.company_name),
      status = COALESCE(excluded.status, marketing_permits.status),
      submitted_date = COALESCE(excluded.submitted_date, marketing_permits.submitted_date),
      effective_date = COALESCE(excluded.effective_date, marketing_permits.effective_date),
      expiration_date = COALESCE(excluded.expiration_date, marketing_permits.expiration_date),
      closed_date = COALESCE(excluded.closed_date, marketing_permits.closed_date),
      previous_app_id = COALESCE(excluded.previous_app_id, marketing_permits.previous_app_id),
      project_start_date = COALESCE(excluded.project_start_date, marketing_permits.project_start_date),
      project_end_date = COALESCE(excluded.project_end_date, marketing_permits.project_end_date),
      address = COALESCE(excluded.address, marketing_permits.address),
      city = COALESCE(excluded.city, marketing_permits.city),
      parcel = COALESCE(excluded.parcel, marketing_permits.parcel),
      is_block_permit = COALESCE(excluded.is_block_permit, marketing_permits.is_block_permit),
      is_accelerated = COALESCE(excluded.is_accelerated, marketing_permits.is_accelerated),
      invoice_number = COALESCE(excluded.invoice_number, marketing_permits.invoice_number),
      invoice_charges = COALESCE(excluded.invoice_charges, marketing_permits.invoice_charges),
      invoice_balance = COALESCE(excluded.invoice_balance, marketing_permits.invoice_balance),
      raw_data = COALESCE(excluded.raw_data, marketing_permits.raw_data),
      scraped_at = (extract(epoch FROM now()))::bigint`,
    [
      data.id,
      data.projectName ?? null,
      data.companyId ?? null,
      data.companyName ?? null,
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
      data.rawData ? JSON.stringify(data.rawData) : null,
    ]
  );
}

export async function markDetailScraped(id: string): Promise<void> {
  await db.run(
    `UPDATE marketing_permits
     SET detail_scraped_at = (extract(epoch FROM now()))::bigint
     WHERE id = $1`,
    [id]
  );
}

export async function getMarketingPermit(
  id: string
): Promise<MarketingPermit | null> {
  const row = await db
    .query<MarketingPermitRow, [string]>(
      "SELECT * FROM marketing_permits WHERE id = $1"
    )
    .get(id);
  return row ? parseMarketingPermitRow(row) : null;
}

export async function getMarketingPermits(options?: {
  status?: string;
  companyName?: string;
  limit?: number;
  offset?: number;
}): Promise<MarketingPermit[]> {
  let sql = "SELECT * FROM marketing_permits WHERE 1=1";
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options?.status) {
    sql += ` AND status = $${paramIndex++}`;
    params.push(options.status);
  }

  if (options?.companyName) {
    sql += ` AND company_name ILIKE $${paramIndex++}`;
    params.push(`%${options.companyName}%`);
  }

  sql += " ORDER BY submitted_date DESC";

  if (options?.limit) {
    sql += ` LIMIT $${paramIndex++}`;
    params.push(options.limit);
  }

  if (options?.offset) {
    sql += ` OFFSET $${paramIndex++}`;
    params.push(options.offset);
  }

  const rows = await db.query<MarketingPermitRow>(sql).all(...params);
  return rows.map(parseMarketingPermitRow);
}

export async function getActivePermitsByCompany(): Promise<
  { companyName: string; count: number }[]
> {
  const rows = await db
    .query<{ company_name: string; count: number }, []>(
      `SELECT company_name, COUNT(*) as count
       FROM marketing_permits
       WHERE status = 'Active'
       GROUP BY company_name
       ORDER BY count DESC`
    )
    .all();
  return rows.map((r) => ({
    companyName: r.company_name,
    count: Number(r.count),
  }));
}

export async function getMarketingPermitCount(): Promise<number> {
  const row = await db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM marketing_permits"
    )
    .get();
  return row?.count ?? 0;
}

export async function getPermitsNeedingDetailScrape(
  limit = 100
): Promise<MarketingPermit[]> {
  const rows = await db
    .query<MarketingPermitRow, [number]>(
      `SELECT * FROM marketing_permits
       WHERE detail_scraped_at IS NULL
       ORDER BY scraped_at DESC NULLS LAST
       LIMIT $1`
    )
    .all(limit);
  return rows.map(parseMarketingPermitRow);
}
