/**
 * Sync API Handler
 *
 * HTTP handler for syncing permits from the Maricopa County portal.
 * Sync handlers were removed — these stubs keep routes alive until restored.
 */

/**
 * POST /api/sync - Sync permits from portal
 */
export function handleSync(): Response {
  return Response.json(
    {
      error: "Sync handler not available (removed)",
      success: false,
      timestamp: new Date().toISOString(),
    },
    { status: 501 }
  );
}

/**
 * POST /api/sync/company - Sync company permits from portal
 */
export function handleCompanySync(): Response {
  return Response.json(
    {
      error: "Company sync handler not available (removed)",
      success: false,
      timestamp: new Date().toISOString(),
    },
    { status: 501 }
  );
}
