/**
 * Takeoff by ID API handlers
 * Routes: /api/takeoffs/:id, /api/takeoffs/:id/pdf, /api/takeoffs/:id/quote
 */
import { db } from "../../lib/db";
import {
  BUCKETS,
  fileExists,
  getFileTags,
  getFileWebStream,
  getTakeoffPdfUrl,
} from "../../lib/minio";

// Bun request type with params
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
  const body = await req.json();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (body.pdf_url !== undefined) {
    updates.push("pdf_url = ?");
    values.push(body.pdf_url);
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
    values.push(body.status);
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

// GET /api/takeoffs/:id/pdf - Get presigned URL or stream PDF
export async function getTakeoffPdf(req: BunRequest): Promise<Response> {
  try {
    const { id } = req.params;
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename") || "original.pdf";
    const mode = searchParams.get("mode") || "url";

    const objectName = `${id}/${filename}`;

    // Check if file exists
    const exists = await fileExists(BUCKETS.TAKEOFFS, objectName);
    if (!exists) {
      return Response.json(
        { error: "PDF not found", takeoffId: id },
        { status: 404 }
      );
    }

    if (mode === "stream") {
      // Stream the file directly using Web API-compatible stream
      const webStream = await getFileWebStream(BUCKETS.TAKEOFFS, objectName);

      return new Response(webStream, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // Default: return presigned URL (valid for 1 hour)
    const url = await getTakeoffPdfUrl(id, filename, 3600);

    // Also get metadata if available
    let tags: Record<string, string> = {};
    try {
      tags = await getFileTags(BUCKETS.TAKEOFFS, objectName);
    } catch {
      // Tags might not exist
    }

    return Response.json({
      url,
      takeoffId: id,
      filename,
      expiresIn: 3600,
      metadata: tags,
    });
  } catch (error) {
    console.error("Failed to get PDF:", error);
    return Response.json(
      {
        error: "Failed to get PDF",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET /api/takeoffs/:id/quote - Get linked quote
export function getTakeoffQuote(req: BunRequest): Response {
  try {
    const { id } = req.params;

    const quote = db
      .prepare(
        `SELECT q.id, q.base_number, q.job_name, q.status, q.created_at
         FROM quotes q
         WHERE q.takeoff_id = ?
         ORDER BY q.created_at DESC
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

    if (!quote) {
      return Response.json({ quote: null });
    }

    return Response.json({ quote });
  } catch (error) {
    console.error("Failed to get linked quote:", error);
    return Response.json(
      { error: "Failed to get linked quote" },
      { status: 500 }
    );
  }
}
