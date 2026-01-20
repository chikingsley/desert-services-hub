/**
 * Takeoffs API handlers
 * Routes: GET /api/takeoffs, POST /api/takeoffs
 */
import { db } from "../../lib/db";

// GET /api/takeoffs - List all takeoffs
export function listTakeoffs(): Response {
  const takeoffs = db
    .prepare("SELECT * FROM takeoffs ORDER BY created_at DESC")
    .all() as Record<string, unknown>[];

  return Response.json(
    takeoffs.map((t) => ({
      ...t,
      annotations: JSON.parse((t.annotations as string) || "[]"),
      page_scales: JSON.parse((t.page_scales as string) || "{}"),
    }))
  );
}

// POST /api/takeoffs - Create a new takeoff
export async function createTakeoff(req: Request): Promise<Response> {
  const body = await req.json();
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO takeoffs (id, name, pdf_url, annotations, page_scales, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.name || "Untitled Takeoff",
    body.pdf_url || null,
    JSON.stringify(body.annotations || []),
    JSON.stringify(body.page_scales || {}),
    body.status || "draft"
  );

  const takeoff = db
    .prepare("SELECT * FROM takeoffs WHERE id = ?")
    .get(id) as Record<string, unknown>;

  return Response.json({
    ...takeoff,
    annotations: JSON.parse((takeoff.annotations as string) || "[]"),
    page_scales: JSON.parse((takeoff.page_scales as string) || "{}"),
  });
}

// Route handler object for Bun.serve()
export const takeoffsRoutes = {
  GET: listTakeoffs,
  POST: createTakeoff,
};
