import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export function GET() {
  const takeoffs = db
    .prepare("SELECT * FROM takeoffs ORDER BY created_at DESC")
    .all() as Record<string, unknown>[];

  return NextResponse.json(
    takeoffs.map((t) => ({
      ...t,
      annotations: JSON.parse((t.annotations as string) || "[]"),
      page_scales: JSON.parse((t.page_scales as string) || "{}"),
    }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();
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

  return NextResponse.json({
    ...takeoff,
    annotations: JSON.parse((takeoff.annotations as string) || "[]"),
    page_scales: JSON.parse((takeoff.page_scales as string) || "{}"),
  });
}
