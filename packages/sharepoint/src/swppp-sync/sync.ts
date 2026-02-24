/**
 * SWPPP Sync — Core Logic
 *
 * Fetches SWPPP Master Excel data from SharePoint via Graph API,
 * upserts into Supabase Postgres swppp_work_orders table, and links contractors
 * to accounts.
 */

import { db } from "@lib/db/client";
import type { SwpppProject } from "@sharepoint/swppp/client";
import { SwpppMasterClient } from "@sharepoint/swppp/client";
import { WORKSHEETS, type WorksheetName } from "@sharepoint/swppp/config";

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  duration: number;
  rowsSynced: number;
  worksheet: WorksheetName;
}

export interface SyncSummary {
  duration: number;
  results: SyncResult[];
  totalLinked: number;
  totalRows: number;
  totalUnlinked: number;
}

// ============================================================================
// Upsert
// ============================================================================

function excelDateToISO(excelDate: number | string | null): string | null {
  if (excelDate === null || excelDate === "") {
    return null;
  }
  if (typeof excelDate === "string") {
    return excelDate;
  }
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + excelDate * 86_400_000);
  return date.toISOString().split("T")[0] ?? null;
}

async function upsertWorkOrders(projects: SwpppProject[]): Promise<number> {
  let count = 0;
  for (const p of projects) {
    await db.run(
      `INSERT INTO swppp_work_orders (
        row_number, worksheet, date, contractor, job_name, address,
        contact, phone, work_description, date_entered, comments,
        invoice, work_completed, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
      ON CONFLICT(worksheet, row_number) DO UPDATE SET
        date = excluded.date,
        contractor = excluded.contractor,
        job_name = excluded.job_name,
        address = excluded.address,
        contact = excluded.contact,
        phone = excluded.phone,
        work_description = excluded.work_description,
        date_entered = excluded.date_entered,
        comments = excluded.comments,
        invoice = excluded.invoice,
        work_completed = excluded.work_completed,
        synced_at = excluded.synced_at`,
      [
        p.rowNumber,
        p.worksheet,
        excelDateToISO(p.date),
        p.contractor,
        p.jobName,
        p.address,
        p.contact,
        p.phone,
        p.workDescription,
        excelDateToISO(p.dateEntered),
        p.comments,
        p.invoice,
        p.workCompleted,
      ]
    );
    count++;
  }
  return count;
}

// ============================================================================
// Account Linking
// ============================================================================

/**
 * Link swppp_work_orders.contractor → accounts.id
 * Uses exact name match, then company_aliases fallback.
 */
export async function linkContractorsToAccounts(): Promise<{
  linked: number;
  total: number;
}> {
  // Exact name match
  await db.run(`
    UPDATE swppp_work_orders SET account_id = (
      SELECT a.id FROM accounts a
      WHERE LOWER(TRIM(a.name)) = LOWER(TRIM(swppp_work_orders.contractor))
      ORDER BY a.id
      LIMIT 1
    ) WHERE account_id IS NULL
      AND contractor IS NOT NULL
      AND contractor <> ''
  `);

  // Company alias match
  await db.run(`
    UPDATE swppp_work_orders SET account_id = (
      SELECT ca.account_id FROM company_aliases ca
      WHERE LOWER(ca.alias) = LOWER(TRIM(swppp_work_orders.contractor))
      ORDER BY ca.account_id
      LIMIT 1
    ) WHERE account_id IS NULL
      AND contractor IS NOT NULL
      AND contractor <> ''
  `);

  const stats = await db
    .query<{ total: number; linked: number }, []>(`
      SELECT COUNT(*) as total, COUNT(account_id) as linked
      FROM swppp_work_orders
    `)
    .get();

  return { linked: stats?.linked ?? 0, total: stats?.total ?? 0 };
}

// ============================================================================
// Sync
// ============================================================================

export async function syncWorksheet(
  client: SwpppMasterClient,
  worksheet: WorksheetName
): Promise<SyncResult> {
  const start = Date.now();
  const projects = await client.getProjects(worksheet);
  const rowsSynced = await upsertWorkOrders(projects);

  return {
    worksheet,
    rowsSynced,
    duration: Date.now() - start,
  };
}

export async function syncAll(): Promise<SyncSummary> {
  const start = Date.now();
  const client = new SwpppMasterClient();

  const worksheets: WorksheetName[] = [
    WORKSHEETS.NEED_TO_SCHEDULE,
    WORKSHEETS.CONFIRMED_SCHEDULE,
    WORKSHEETS.BILLING_VERIFICATION,
  ];

  const results: SyncResult[] = [];
  for (const worksheet of worksheets) {
    const result = await syncWorksheet(client, worksheet);
    results.push(result);
  }

  // Link contractors to accounts after sync
  const { linked, total } = await linkContractorsToAccounts();

  return {
    results,
    totalRows: results.reduce((sum, r) => sum + r.rowsSynced, 0),
    totalLinked: linked,
    totalUnlinked: total - linked,
    duration: Date.now() - start,
  };
}

// ============================================================================
// Status
// ============================================================================

export async function getStatus(): Promise<{
  byWorksheet: Array<{ worksheet: string; count: number }>;
  total: number;
  linked: number;
  unlinked: number;
  uniqueContractors: number;
  linkedContractors: number;
}> {
  const byWorksheet = await db
    .query<{ worksheet: string; count: number }, []>(`
      SELECT worksheet, COUNT(*) as count
      FROM swppp_work_orders
      GROUP BY worksheet
      ORDER BY worksheet
    `)
    .all();

  const stats = await db
    .query<
      { total: number; linked: number; unique_c: number; linked_c: number },
      []
    >(`
      SELECT
        COUNT(*) as total,
        COUNT(account_id) as linked,
        COUNT(DISTINCT contractor) as unique_c,
        COUNT(DISTINCT CASE WHEN account_id IS NOT NULL THEN contractor END) as linked_c
      FROM swppp_work_orders
    `)
    .get();

  return {
    byWorksheet,
    total: stats?.total ?? 0,
    linked: stats?.linked ?? 0,
    unlinked: (stats?.total ?? 0) - (stats?.linked ?? 0),
    uniqueContractors: stats?.unique_c ?? 0,
    linkedContractors: stats?.linked_c ?? 0,
  };
}
