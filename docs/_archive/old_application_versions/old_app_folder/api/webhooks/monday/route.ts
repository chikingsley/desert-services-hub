import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Monday.com Webhook endpoint
// Handles real-time updates to keep the local cache in sync

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Challenge verification (Monday requires this for URL verification)
    if (body.challenge) {
      console.log("Monday webhook challenge received");
      return NextResponse.json({ challenge: body.challenge });
    }

    // 2. Event handling
    const event = body.event;
    if (!event) {
      return NextResponse.json({ ok: true });
    }

    const { boardId, itemId, type } = event;
    console.log(
      `Monday event received: ${type} on item ${itemId} (board ${boardId})`
    );

    // In a production environment, we would fetch the latest item data from Monday
    // to ensure the cache is perfectly correct, especially for mirror columns.
    // However, for immediate response, we can mark it as dirty or do a background fetch.

    // For now, let's implement a simple "refetch" if it's a structural change,
    // or update the name directly if it's a name change.

    if (type === "create_item" || type === "change_column_value") {
      // Background refetch would be best here.
      // For this implementation, we will assume the sync script runs periodically,
      // and webhooks are for high-priority updates.

      // If name change, we can update directly
      if (type === "change_name") {
        db.prepare(
          "UPDATE monday_cache SET name = ?, updated_at = ? WHERE id = ?"
        ).run(event.value.name, event.pulseId, event.itemId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error handling Monday webhook:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
