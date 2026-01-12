import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const takeoff = db.prepare("SELECT * FROM takeoffs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  if (!takeoff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse JSON fields
  return NextResponse.json({
    ...takeoff,
    annotations: JSON.parse((takeoff.annotations as string) || "[]"),
    page_scales: JSON.parse((takeoff.page_scales as string) || "{}"),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

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

  return NextResponse.json({
    ...takeoff,
    annotations: JSON.parse((takeoff.annotations as string) || "[]"),
    page_scales: JSON.parse((takeoff.page_scales as string) || "{}"),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  db.prepare("DELETE FROM takeoffs WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
