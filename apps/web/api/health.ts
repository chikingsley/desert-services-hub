/**
 * Health check API
 * Route: GET /api/health
 */

export function healthCheck(): Response {
  return Response.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
