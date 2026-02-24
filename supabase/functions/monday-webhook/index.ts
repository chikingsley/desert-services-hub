/* global Deno */

/**
 * Monday Webhook — Supabase Edge Function
 *
 * Receives Monday.com webhook notifications for board item changes.
 * Triggers the Trigger.dev `monday-sync-item` task via REST API.
 *
 * Replaces the old pgmq-based flow that enqueued to a dead queue.
 * Follows the same pattern as outlook-webhook/index.ts.
 */

interface MondayEvent {
  boardId?: number;
  columnId?: string;
  columnTitle?: string;
  pulseId?: number;
  type?: string;
  userId?: number;
}

const TRIGGER_API_URL =
  Deno.env.get("TRIGGER_API_URL") ?? "https://trigger.desertservices.app";
const TRIGGER_SECRET_KEY = Deno.env.get("TRIGGER_SECRET_KEY") ?? "";

function estimatingBoardId(): string {
  return (Deno.env.get("MONDAY_ESTIMATING_BOARD_ID") ?? "7943937851").trim();
}

function allowedBoardIds(): Set<string> {
  const raw =
    Deno.env.get("MONDAY_WEBHOOK_BOARD_IDS") ??
    // ESTIMATING board default
    "7943937851";

  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Trigger the monday-sync-item task via Trigger.dev REST API. */
async function triggerItemSync(mondayItemId: string): Promise<boolean> {
  if (!TRIGGER_SECRET_KEY) {
    console.error("[edge:monday] TRIGGER_SECRET_KEY not set");
    return false;
  }

  const response = await fetch(
    `${TRIGGER_API_URL}/api/v1/tasks/monday-sync-item/trigger`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
      },
      body: JSON.stringify({
        payload: { mondayItemId },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[edge:monday] Trigger.dev monday-sync-item failed (${response.status}): ${body}`
    );
    return false;
  }

  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Bad Request" }, 400);
  }

  // Monday webhook challenge handshake
  if (body.challenge) {
    return json({ challenge: body.challenge });
  }

  const event = (body.event ?? undefined) as MondayEvent | undefined;
  const boardId = event?.boardId ? String(event.boardId) : null;
  if (!(boardId && allowedBoardIds().has(boardId))) {
    return json({ ok: true });
  }

  const itemId = event?.pulseId ? String(event.pulseId) : null;

  // For ESTIMATING board items, trigger immediate item sync
  if (itemId && boardId === estimatingBoardId()) {
    const triggered = await triggerItemSync(itemId);
    console.log(
      `[edge:monday] ${triggered ? "Triggered" : "Failed to trigger"} monday-sync-item for ${itemId} (${event?.type ?? "unknown"}, board=${boardId})`
    );
  }

  return json({ ok: true });
});
