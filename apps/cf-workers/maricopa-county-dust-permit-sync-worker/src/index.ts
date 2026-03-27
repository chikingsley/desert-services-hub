import { getPermitPdfUrl, runMaricopaCountyDustPermitSync } from "./sync";

let syncInFlight: Promise<Response> | null = null;

const jsonError = (error: string, status = 400): Response =>
  Response.json({ error, success: false }, { status });

const handleSync = (request: Request, db: D1Database): Promise<Response> => {
  if (request.method !== "POST") {
    return Promise.resolve(jsonError("Method not allowed", 405));
  }

  if (!syncInFlight) {
    syncInFlight = (async () => {
      try {
        const payload = await runMaricopaCountyDustPermitSync(db);
        return Response.json({
          ...payload,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(message, 500);
      } finally {
        syncInFlight = null;
      }
    })();
  }

  return syncInFlight;
};

const handlePermitPdf = async (url: URL): Promise<Response> => {
  const permitId = url.searchParams.get("permitId")?.trim();
  if (!permitId) {
    return jsonError("permitId is required", 400);
  }

  const pdfUrl = await getPermitPdfUrl(permitId);
  return Response.json({
    pdfUrl,
    permitId,
    success: pdfUrl !== null,
  });
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return Response.json({
          ok: true,
          service: "maricopa-county-dust-permit-sync-worker",
        });
      }

      if (url.pathname === "/api/sync") {
        return await handleSync(request, env.DB);
      }

      if (url.pathname === "/api/aqdata/permit-pdf") {
        return await handlePermitPdf(url);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message, success: false }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
