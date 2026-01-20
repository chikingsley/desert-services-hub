/**
 * Webhook handlers
 * Routes: POST /api/webhooks/monday
 */
import { db } from "../../lib/db";

interface MondayEvent {
  boardId?: string;
  itemId?: string;
  type?: string;
  value?: { name?: string };
  pulseId?: string;
}

// POST /api/webhooks/monday - Handle Monday.com webhooks
export async function handleMondayWebhook(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Challenge verification (Monday requires this)
    if (body.challenge) {
      return Response.json({ challenge: body.challenge });
    }

    // 2. Event handling
    const event = body.event as MondayEvent | undefined;
    if (!event) {
      return Response.json({ ok: true });
    }

    const { type } = event;

    // Handle name changes by updating the cache directly
    if (type === "change_name" && event.value?.name && event.itemId) {
      db.prepare(
        "UPDATE monday_cache SET name = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(event.value.name, event.itemId);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error handling Monday webhook:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
