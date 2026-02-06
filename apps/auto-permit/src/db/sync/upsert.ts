/**
 * Database Upsert Utilities
 *
 * Handles upserting permit data into SQLite databases.
 *
 * @module src/db/sync/upsert
 */

import type { Database } from "bun:sqlite";
import { formatDate, type PermitRow } from "./csv-parser";

/**
 * Insert or replace permits in the database.
 */
export function insertPermits(
  db: Database,
  permits: PermitRow[],
  table: string
): number {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO ${table} (
      id, project_name, company_id, company_name, status,
      submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance
    ) VALUES (
      $id, $project_name, $company_id, $company_name, $status,
      $submitted_date, $effective_date, $expiration_date, $closed_date,
      $previous_app_id, $project_start_date, $project_end_date,
      $address, $city, $parcel, $is_block_permit, $is_accelerated,
      $invoice_number, $invoice_charges, $invoice_balance
    )
  `);

  let count = 0;
  const tx = db.transaction(() => {
    for (const p of permits) {
      insertStmt.run({
        $id: p.id,
        $project_name: p.project_name,
        $company_id: p.company_id,
        $company_name: p.company_name,
        $status: p.status,
        $submitted_date: p.submitted_date,
        $effective_date: p.effective_date,
        $expiration_date: p.expiration_date,
        $closed_date: p.closed_date,
        $previous_app_id: p.previous_app_id,
        $project_start_date: p.project_start_date,
        $project_end_date: p.project_end_date,
        $address: p.address,
        $city: p.city,
        $parcel: p.parcel,
        $is_block_permit: p.is_block_permit,
        $is_accelerated: p.is_accelerated,
        $invoice_number: p.invoice_number,
        $invoice_charges: p.invoice_charges,
        $invoice_balance: p.invoice_balance,
      });
      count++;
    }
  });
  tx();
  return count;
}

/**
 * Get the cutoff date (latest submitted_date) from the table.
 */
export function getCutoffDate(db: Database, table: string): string {
  const result = db
    .query(`SELECT MAX(submitted_date) as d FROM ${table}`)
    .get() as { d: string | null } | null;

  const rawDate = result?.d ?? "2000-01-01";
  return formatDate(rawDate) ?? "2000-01-01";
}

/**
 * Get the total count of records in a table.
 */
export function getTableCount(db: Database, table: string): number {
  const result = db.query(`SELECT COUNT(*) as c FROM ${table}`).get() as {
    c: number;
  };
  return result.c;
}
