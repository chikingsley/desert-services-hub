/**
 * Sync Services
 *
 * Orchestrates synchronization of permit data from CSV files and XLS exports
 * into the local SQLite databases.
 *
 * @module src/db/sync/service
 */

import { Database } from "bun:sqlite";
import { downloadCompanyPermits } from "@/portal/sync-company";
import { downloadMarketingPermits } from "@/portal/sync-marketing";
import { withBrowser } from "@/portal/utils/browser";
import type { PermitRow } from "./csv-parser";
import { type PortalPermit, parsePermitExport } from "./permit-parser";
import { getTableCount, insertPermits } from "./upsert";

export interface SyncStats {
  newRecords: number;
  totalInDb: number;
}

export interface SyncResult {
  success: boolean;
  companyPermits: SyncStats;
  marketingPermits: SyncStats;
  error?: string;
}

export type SyncOptions = Record<string, never>;

// Database paths
const COMPANY_PERMITS_DB_PATH = "src/db/company-permits.sqlite";
const MARKETING_PERMITS_DB_PATH = "src/db/marketing-permits.sqlite";

/**
 * Sync permits from CSV exports to SQLite databases.
 */
export async function runSync(_input: SyncOptions): Promise<SyncResult> {
  console.log("🌐 Syncing from Maricopa Portal (Export to Excel)\n");

  return await withBrowser<SyncResult>(
    { operation: "sync" },
    async (instance) => {
      const { page } = instance;

      const companyXlsPath = await downloadCompanyPermits(page);
      const marketingXlsPath = await downloadMarketingPermits(page);

      const companyStats = await syncFromXls(
        companyXlsPath,
        COMPANY_PERMITS_DB_PATH,
        "permits"
      );

      const marketingStats = await syncFromXls(
        marketingXlsPath,
        MARKETING_PERMITS_DB_PATH,
        "scraped_permits"
      );

      console.log("\n🎉 Done!");

      return {
        success: true,
        companyPermits: companyStats,
        marketingPermits: marketingStats,
      };
    }
  );
}

/**
 * Sync from a downloaded XLS file (Maricopa HTML Table format)
 */
export async function syncFromXls(
  xlsPath: string,
  dbPath = COMPANY_PERMITS_DB_PATH,
  tableName = "permits"
): Promise<SyncStats> {
  console.log(`📂 Syncing from: ${xlsPath}`);
  console.log(`   Target: ${dbPath} → ${tableName}`);

  const content = await Bun.file(xlsPath).text();
  const parsed = parsePermitExport(content, xlsPath);

  const db = new Database(dbPath);

  // Map PortalPermit (from xls-parser) to PermitRow format
  const rows: PermitRow[] = parsed.map((p: PortalPermit) => ({
    id: p.id,
    project_name: p.projectName,
    company_id: p.companyId,
    company_name: p.companyName,
    status: p.status,
    submitted_date: p.submittedDate,
    effective_date: p.effectiveDate,
    expiration_date: p.expirationDate,
    closed_date: p.closedDate,
    previous_app_id: p.previousAppId,
    project_start_date: p.projectStartDate,
    project_end_date: p.projectEndDate,
    address: p.address,
    city: p.city,
    parcel: p.parcel,
    is_block_permit: p.isBlockPermit ? 1 : 0,
    is_accelerated: p.isAccelerated ? 1 : 0,
    invoice_number: p.invoiceNumber,
    invoice_charges: p.invoiceCharges,
    invoice_balance: p.invoiceBalance,
  }));

  if (rows.length > 0) {
    insertPermits(db, rows, tableName);
    console.log(`   ✅ Upserted ${rows.length} records`);
  }

  const totalInDb = getTableCount(db, tableName);
  db.close();

  return {
    newRecords: parsed.length,
    totalInDb,
  };
}
