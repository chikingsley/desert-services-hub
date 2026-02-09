/**
 * Sync API Handler
 *
 * HTTP handler for syncing permits from the Maricopa County portal.
 */

import {
  type CompanySyncResult,
  type SyncResult,
  syncCompanyPermits,
  syncPermits,
} from "@/handlers/sync";

let syncInFlight: Promise<SyncResult> | null = null;
let companySyncInFlight: Promise<CompanySyncResult> | null = null;

async function runSyncSingleton(): Promise<SyncResult> {
  if (!syncInFlight) {
    syncInFlight = syncPermits({}).finally(() => {
      syncInFlight = null;
    });
  }
  return await syncInFlight;
}

async function runCompanySyncSingleton(): Promise<CompanySyncResult> {
  if (!companySyncInFlight) {
    companySyncInFlight = syncCompanyPermits({}).finally(() => {
      companySyncInFlight = null;
    });
  }
  return await companySyncInFlight;
}

/**
 * POST /api/sync - Sync permits from portal
 *
 * Downloads the "Export to Excel" files from the portal and syncs
 * both company-permits and marketing-permits databases.
 */
export async function handleSync(): Promise<Response> {
  console.log("\n📡 SYNC request via API");

  try {
    const result = await runSyncSingleton();

    return Response.json(
      {
        ...result,
        timestamp: new Date().toISOString(),
      },
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`   ✗ Sync error: ${errorMsg}`);

    return Response.json(
      {
        success: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/company - Sync company permits from portal
 *
 * Downloads the "Export to Excel" file from "My Dust Control Applications"
 * and syncs the company permits table only.
 */
export async function handleCompanySync(): Promise<Response> {
  console.log("\n📡 COMPANY SYNC request via API");

  try {
    const result = await runCompanySyncSingleton();

    return Response.json(
      {
        ...result,
        timestamp: new Date().toISOString(),
      },
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`   ✗ Company sync error: ${errorMsg}`);

    return Response.json(
      {
        success: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
