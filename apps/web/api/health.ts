/**
 * Health check API
 * Route: GET /api/health
 */
import { db } from "@lib/db/client";

const HEALTH_DB_TIMEOUT_MS = 2_000;

async function checkDbConnectivity(timeoutMs = HEALTH_DB_TIMEOUT_MS) {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`DB health probe timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await Promise.race([
      db.query<{ ok: number }>("SELECT 1 as ok").get(),
      timeoutPromise,
    ]);

    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function healthCheck(): Promise<Response> {
  const timestamp = new Date().toISOString();
  try {
    const dbStatus = await checkDbConnectivity();
    return Response.json({
      status: "healthy",
      timestamp,
      checks: {
        db: dbStatus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api.health] unhealthy", { error: message });
    return Response.json(
      {
        status: "unhealthy",
        timestamp,
        checks: {
          db: {
            ok: false,
            error: message,
          },
        },
      },
      { status: 503 }
    );
  }
}
