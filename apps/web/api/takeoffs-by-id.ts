/**
 * Takeoff by ID API handlers
 * Routes: /api/takeoffs/:id, /api/takeoffs/:id/pdf, /api/takeoffs/:id/estimate
 */
import { db } from "@lib/db/hub";

// Bun extends Request with params from route matching
type BunRequest = Request & { params: { id: string } };

// GET /api/takeoffs/:id - Get a single takeoff
export function getTakeoff(req: BunRequest): Response {
  const { id } = req.params;

  const takeoff = db.prepare("SELECT * FROM takeoffs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  if (!takeoff) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    ...takeoff,
    annotations: JSON.parse((takeoff.annotations as string) || "[]"),
    page_scales: JSON.parse((takeoff.page_scales as string) || "{}"),
  });
}

// PUT /api/takeoffs/:id - Update a takeoff
export async function updateTakeoff(req: BunRequest): Promise<Response> {
  const { id } = req.params;
  const body = (await req.json()) as Record<string, unknown>;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    values.push(body.name as string);
  }
  if (body.pdf_url !== undefined) {
    updates.push("pdf_url = ?");
    values.push(body.pdf_url as string);
  }
  if (body.annotations !== undefined) {
    updates.push("annotations = ?");
    values.push(JSON.stringify(body.annotations));
  }
  if (body.page_scales !== undefined) {
    updates.push("page_scales = ?");
    values.push(JSON.stringify(body.page_scales));
  }
  if (body.status !== undefined) {
    updates.push("status = ?");
    values.push(body.status as string);
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE takeoffs SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
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

// DELETE /api/takeoffs/:id - Delete a takeoff
export function deleteTakeoff(req: BunRequest): Response {
  const { id } = req.params;
  db.prepare("DELETE FROM takeoffs WHERE id = ?").run(id);
  return Response.json({ success: true });
}

// GET /api/takeoffs/:id/pdf - Serve takeoff PDF
export function getTakeoffPdf(req: BunRequest): Response {
  const { id } = req.params;

  const takeoff = db
    .prepare("SELECT pdf_url FROM takeoffs WHERE id = ?")
    .get(id) as { pdf_url: string | null } | undefined;

  if (!takeoff?.pdf_url) {
    return Response.json(
      { error: "PDF not found", takeoffId: id },
      { status: 404 }
    );
  }

  return Response.json(
    { error: "PDF serving not available — storage migrated to SharePoint" },
    { status: 501 }
  );
}

// GET /api/takeoffs/:id/estimate - Get linked estimate
export function getTakeoffEstimate(req: BunRequest): Response {
  try {
    const { id } = req.params;

    const estimate = db
      .prepare(
        `SELECT e.id, e.base_number, e.job_name, e.status, e.created_at
         FROM estimates e
         WHERE e.takeoff_id = ?
         ORDER BY e.created_at DESC
         LIMIT 1`
      )
      .get(id) as
      | {
          id: string;
          base_number: string;
          job_name: string;
          status: string;
          created_at: string;
        }
      | undefined;

    if (!estimate) {
      return Response.json({ estimate: null });
    }

    return Response.json({ estimate });
  } catch (error) {
    console.error("Failed to get linked estimate:", error);
    return Response.json(
      { error: "Failed to get linked estimate" },
      { status: 500 }
    );
  }
}
