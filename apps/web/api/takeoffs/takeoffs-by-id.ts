/**
 * Takeoff by ID API handlers
 * Routes: /api/takeoffs/:id, /api/takeoffs/:id/pdf, /api/takeoffs/:id/estimate
 */
import { db } from "@lib/db/hub";
import { createSharePointClientFromEnv } from "@lib/sharepoint/intake-upload";
import {
  decodeSharePointPdfPath,
  isExternalPdfUrl,
} from "../../lib/takeoff-pdf-storage";

// Bun extends Request with params from route matching
type BunRequest = Request & { params: { id: string } };

const SHAREPOINT_NOT_FOUND_RE = /404|itemNotFound/i;

// GET /api/takeoffs/:id - Get a single takeoff
export async function getTakeoff(req: BunRequest): Promise<Response> {
  const { id } = req.params;

  const takeoff = (await db
    .prepare("SELECT * FROM takeoffs WHERE id = ?")
    .get(id)) as Record<string, unknown> | undefined;

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

  updates.push("updated_at = now()");
  values.push(id);

  await db
    .prepare(`UPDATE takeoffs SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);

  const takeoff = (await db
    .prepare("SELECT * FROM takeoffs WHERE id = ?")
    .get(id)) as Record<string, unknown>;

  return Response.json({
    ...takeoff,
    annotations: JSON.parse((takeoff.annotations as string) || "[]"),
    page_scales: JSON.parse((takeoff.page_scales as string) || "{}"),
  });
}

// DELETE /api/takeoffs/:id - Delete a takeoff
export async function deleteTakeoff(req: BunRequest): Promise<Response> {
  const { id } = req.params;
  await db.prepare("DELETE FROM takeoffs WHERE id = ?").run(id);
  return Response.json({ success: true });
}

// GET /api/takeoffs/:id/pdf - Serve takeoff PDF
export async function getTakeoffPdf(req: BunRequest): Promise<Response> {
  const { id } = req.params;

  const takeoff = (await db
    .prepare("SELECT pdf_url FROM takeoffs WHERE id = ?")
    .get(id)) as { pdf_url: string | null } | undefined;

  if (!takeoff?.pdf_url) {
    return Response.json(
      { error: "PDF not found", takeoffId: id },
      { status: 404 }
    );
  }

  if (isExternalPdfUrl(takeoff.pdf_url)) {
    return Response.redirect(takeoff.pdf_url, 302);
  }

  const sharePointPath = decodeSharePointPdfPath(takeoff.pdf_url);
  if (!sharePointPath) {
    return Response.json(
      {
        error: "Unsupported PDF storage reference",
        takeoffId: id,
      },
      { status: 422 }
    );
  }

  const sharePointClient = createSharePointClientFromEnv();
  if (!sharePointClient) {
    return Response.json(
      {
        error: "SharePoint client not configured",
        takeoffId: id,
      },
      { status: 500 }
    );
  }

  try {
    const pdfBuffer = await sharePointClient.download(sharePointPath);
    const fileName = sharePointPath.split("/").pop() || `${id}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound = SHAREPOINT_NOT_FOUND_RE.test(message);

    return Response.json(
      {
        error: notFound
          ? "PDF not found in SharePoint"
          : "Failed to fetch PDF from SharePoint",
        takeoffId: id,
        details: message,
      },
      { status: notFound ? 404 : 502 }
    );
  }
}

// GET /api/takeoffs/:id/estimate - Get linked estimate
export async function getTakeoffEstimate(req: BunRequest): Promise<Response> {
  try {
    const { id } = req.params;

    const estimate = (await db
      .prepare(
        `SELECT e.id, e.base_number, e.job_name, e.status, e.created_at
         FROM estimates e
         WHERE e.takeoff_id = ?
         ORDER BY e.created_at DESC
         LIMIT 1`
      )
      .get(id)) as
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
