/**
 * Sync Services
 *
 * Orchestrates synchronization of permit data from XLS exports
 * into the hub Postgres database.
 *
 * @module src/db/sync/service
 */

import { db } from "@lib/db/hub";
import { getPermitCount, upsertPermit } from "@lib/db/repositories/dust-permit";
import {
  getMarketingPermitCount,
  upsertMarketingPermit,
} from "@lib/db/repositories/marketing-permit";
import { downloadCompanyPermits } from "@/portal/sync-company";
import { downloadMarketingPermits } from "@/portal/sync-marketing";
import { withBrowser } from "@/portal/utils/browser";
import { type PortalPermit, parsePermitExport } from "./permit-parser";

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

/**
 * Sync permits from portal XLS exports to Postgres.
 */
export async function runSync(_input: SyncOptions): Promise<SyncResult> {
  console.log("Syncing from Maricopa Portal (Export to Excel)\n");

  return await withBrowser<SyncResult>(
    { operation: "sync" },
    async (instance) => {
      const { page } = instance;

      const companyXlsPath = await downloadCompanyPermits(page);
      const marketingXlsPath = await downloadMarketingPermits(page);

      const companyStats = await syncFromXls(companyXlsPath, "company");
      const marketingStats = await syncFromXls(marketingXlsPath, "marketing");

      console.log("\nDone!");

      return {
        success: true,
        companyPermits: companyStats,
        marketingPermits: marketingStats,
      };
    }
  );
}

export interface CompanySyncResult {
  success: boolean;
  companyPermits: SyncStats;
  error?: string;
}

/**
 * Sync only company permits from portal XLS export to Postgres.
 *
 * Used by payment-triggered flows which only need invoice/permit mapping.
 */
export async function runCompanySync(
  _input: SyncOptions
): Promise<CompanySyncResult> {
  console.log(
    "Syncing COMPANY permits from Maricopa Portal (Export to Excel)\n"
  );

  return await withBrowser<CompanySyncResult>(
    { operation: "sync" },
    async (instance) => {
      const { page } = instance;

      const companyXlsPath = await downloadCompanyPermits(page);
      const companyStats = await syncFromXls(companyXlsPath, "company");

      console.log("\nDone!");

      return {
        success: true,
        companyPermits: companyStats,
      };
    }
  );
}

/**
 * Sync from a downloaded XLS file into Postgres.
 */
export async function syncFromXls(
  xlsPath: string,
  target: "company" | "marketing"
): Promise<SyncStats> {
  console.log(`Syncing from: ${xlsPath}`);
  console.log(`  Target: ${target} permits (Postgres)`);

  const content = await Bun.file(xlsPath).text();
  const parsed = parsePermitExport(content, xlsPath);

  if (parsed.length > 0) {
    await db.transaction(async () => {
      for (const p of parsed) {
        if (target === "company") {
          await upsertCompanyPermit(p);
        } else {
          await upsertMarketingFromPortal(p);
        }
      }
    });
    console.log(`  Upserted ${parsed.length} records`);
  }

  const totalInDb =
    target === "company"
      ? await getPermitCount()
      : await getMarketingPermitCount();

  return {
    newRecords: parsed.length,
    totalInDb,
  };
}

async function upsertCompanyPermit(p: PortalPermit): Promise<void> {
  await upsertPermit({
    id: p.id,
    projectName: p.projectName,
    facilityId: p.facilityId,
    companyName: p.companyName,
    portalCompanyId: p.companyId,
    status: p.status,
    submittedDate: p.submittedDate,
    effectiveDate: p.effectiveDate,
    expirationDate: p.expirationDate,
    closedDate: p.closedDate,
    previousAppId: p.previousAppId,
    projectStartDate: p.projectStartDate,
    projectEndDate: p.projectEndDate,
    address: p.address,
    city: p.city,
    parcel: p.parcel,
    isBlockPermit: p.isBlockPermit,
    isAccelerated: p.isAccelerated,
    invoiceNumber: p.invoiceNumber,
    invoiceCharges: p.invoiceCharges,
    invoiceBalance: p.invoiceBalance,
  });
}

async function upsertMarketingFromPortal(p: PortalPermit): Promise<void> {
  await upsertMarketingPermit({
    id: p.id,
    projectName: p.projectName,
    companyId: p.companyId,
    companyName: p.companyName,
    status: p.status,
    submittedDate: p.submittedDate,
    effectiveDate: p.effectiveDate,
    expirationDate: p.expirationDate,
    closedDate: p.closedDate,
    previousAppId: p.previousAppId,
    projectStartDate: p.projectStartDate,
    projectEndDate: p.projectEndDate,
    address: p.address,
    city: p.city,
    parcel: p.parcel,
    isBlockPermit: p.isBlockPermit,
    isAccelerated: p.isAccelerated,
    invoiceNumber: p.invoiceNumber,
    invoiceCharges: p.invoiceCharges,
    invoiceBalance: p.invoiceBalance,
  });
}
