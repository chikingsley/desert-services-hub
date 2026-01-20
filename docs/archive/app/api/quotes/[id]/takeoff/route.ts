import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: Get the takeoff linked to this quote
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First get the quote to find the takeoff_id
    const quote = db
      .prepare("SELECT takeoff_id FROM quotes WHERE id = ?")
      .get(id) as { takeoff_id: string | null } | undefined;

    if (!(quote && quote.takeoff_id)) {
      return NextResponse.json({ takeoff: null });
    }

    // Now get the takeoff details
    const takeoff = db
      .prepare(
        `SELECT id, name, status, created_at, updated_at
         FROM takeoffs
         WHERE id = ?`
      )
      .get(quote.takeoff_id) as
      | {
          id: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!takeoff) {
      return NextResponse.json({ takeoff: null });
    }

    return NextResponse.json({ takeoff });
  } catch (error) {
    console.error("Failed to get linked takeoff:", error);
    return NextResponse.json(
      { error: "Failed to get linked takeoff" },
      { status: 500 }
    );
  }
}
