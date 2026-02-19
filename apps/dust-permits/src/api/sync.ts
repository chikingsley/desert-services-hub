/**
 * Sync API Handler
 *
 * HTTP handler for syncing permits from the Maricopa County portal.
 * Runs company-only or full (company + marketing) XLS exports and
 * upserts results into Postgres.
 */

import { runCompanySync, runSync } from "@/portal/sync-service";

// In-flight singletons — prevent concurrent sync runs on the same browser
let syncInFlight: Promise<Response> | null = null;
let companySyncInFlight: Promise<Response> | null = null;

/**
 * POST /api/sync - Full sync (company + marketing permits)
 */
export async function handleSync(): Promise<Response> {
  console.log("\n[sync] Full sync request received");

  if (!syncInFlight) {
    syncInFlight = (async () => {
      try {
        const result = await runSync();
        return Response.json(
          { ...result, timestamp: new Date().toISOString() },
          { status: result.success ? 200 : 500 }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[sync] Full sync error: ${msg}`);
        return Response.json(
          { error: msg, success: false, timestamp: new Date().toISOString() },
          { status: 500 }
        );
      }
    })().finally(() => {
      syncInFlight = null;
    });
  }

  return await syncInFlight;
}

/**
 * POST /api/sync/company - Company-only sync (faster, for payment flows)
 */
export async function handleCompanySync(): Promise<Response> {
  console.log("\n[sync] Company sync request received");

  if (!companySyncInFlight) {
    companySyncInFlight = (async () => {
      try {
        const result = await runCompanySync();
        return Response.json(
          { ...result, timestamp: new Date().toISOString() },
          { status: result.success ? 200 : 500 }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[sync] Company sync error: ${msg}`);
        return Response.json(
          { error: msg, success: false, timestamp: new Date().toISOString() },
          { status: 500 }
        );
      }
    })().finally(() => {
      companySyncInFlight = null;
    });
  }

  return await companySyncInFlight;
}
