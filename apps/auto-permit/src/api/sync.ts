/**
 * Sync API Handler
 *
 * HTTP handler for syncing permits from the Maricopa County portal.
 */

import { syncPermits } from "@/handlers/sync";

/**
 * POST /api/sync - Sync permits from portal
 *
 * Downloads the "Export to Excel" files from the portal and syncs
 * both company-permits and marketing-permits databases.
 */
export async function handleSync(): Promise<Response> {
  console.log("\n📡 SYNC request via API");

  try {
    const result = await syncPermits({});

    return Response.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
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
