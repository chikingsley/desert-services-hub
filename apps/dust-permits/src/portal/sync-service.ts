/**
 * Permit Sync Service
 *
 * Orchestrates synchronization of permit data from the Maricopa portal
 * XLS exports into the hub Postgres database.
 *
 * @module src/portal/sync-service
 */

import { db } from "@lib/db/client";
import { getPermitCount, upsertPermit } from "@lib/db/repositories/dust-permit";
import {
  getMarketingPermitCount,
  upsertMarketingPermit,
} from "@lib/db/repositories/marketing-permit";
import type { PortalPermit } from "@/portal/permit-parser";
import { parsePermitExport } from "@/portal/permit-parser";
import { downloadCompanyPermits } from "@/portal/sync-company";
import { downloadMarketingPermits } from "@/portal/sync-marketing";
import { withBrowser } from "@/portal/utils/browser";

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

export interface CompanySyncResult {
  success: boolean;
  companyPermits: SyncStats;
  error?: string;
}

/**
 * Full sync: company permits + marketing permits from portal XLS exports.
 */
export async function runSync(): Promise<SyncResult> {
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
        companyPermits: companyStats,
        marketingPermits: marketingStats,
        success: true,
      };
    }
  );
}

/**
 * Company-only sync — used by payment-triggered flows which only need
 * the invoice→permit mapping and don't need to scrape all marketing permits.
 */
export async function runCompanySync(): Promise<CompanySyncResult> {
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
        companyPermits: companyStats,
        success: true,
      };
    }
  );
}

/**
 * Parse a downloaded XLS export and upsert all permits into Postgres.
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

  return { newRecords: parsed.length, totalInDb };
}

async function upsertCompanyPermit(p: PortalPermit): Promise<void> {
  await upsertPermit({
    address: p.address,
    city: p.city,
    closedDate: p.closedDate,
    companyName: p.companyName,
    effectiveDate: p.effectiveDate,
    expirationDate: p.expirationDate,
    facilityId: p.facilityId,
    id: p.id,
    invoiceBalance: p.invoiceBalance,
    invoiceCharges: p.invoiceCharges,
    invoiceNumber: p.invoiceNumber,
    isAccelerated: p.isAccelerated,
    isBlockPermit: p.isBlockPermit,
    parcel: p.parcel,
    portalCompanyId: p.companyId,
    previousAppId: p.previousAppId,
    projectEndDate: p.projectEndDate,
    projectName: p.projectName,
    projectStartDate: p.projectStartDate,
    status: p.status,
    submittedDate: p.submittedDate,
  });
}

async function upsertMarketingFromPortal(p: PortalPermit): Promise<void> {
  await upsertMarketingPermit({
    address: p.address,
    city: p.city,
    closedDate: p.closedDate,
    companyId: p.companyId,
    companyName: p.companyName,
    effectiveDate: p.effectiveDate,
    expirationDate: p.expirationDate,
    id: p.id,
    invoiceBalance: p.invoiceBalance,
    invoiceCharges: p.invoiceCharges,
    invoiceNumber: p.invoiceNumber,
    isAccelerated: p.isAccelerated,
    isBlockPermit: p.isBlockPermit,
    parcel: p.parcel,
    previousAppId: p.previousAppId,
    projectEndDate: p.projectEndDate,
    projectName: p.projectName,
    projectStartDate: p.projectStartDate,
    status: p.status,
    submittedDate: p.submittedDate,
  });
}
