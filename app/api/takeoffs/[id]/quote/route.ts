import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: Find a quote linked to this takeoff
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
      return NextResponse.json({ quote: null });
    }

    return NextResponse.json({ quote });
  } catch (error) {
    console.error("Failed to get linked quote:", error);
    return NextResponse.json(
      { error: "Failed to get linked quote" },
      { status: 500 }
    );
  }
}
