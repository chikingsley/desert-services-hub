/* global Deno */

import { enqueueBackgroundJob, json } from "../_shared/queue.ts";

interface MondayEvent {
  boardId?: number;
  pulseId?: number;
  type?: string;
}

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

  if (body.challenge) {
    return json({ challenge: body.challenge });
  }

  const event = (body.event ?? undefined) as MondayEvent | undefined;
  const boardId = event?.boardId ? String(event.boardId) : null;
  if (!(boardId && allowedBoardIds().has(boardId))) {
    return json({ ok: true });
  }

  const itemId = event?.pulseId ? String(event.pulseId) : null;
  const shouldSyncItem = Boolean(itemId) && boardId === estimatingBoardId();
  if (itemId && shouldSyncItem) {
    await enqueueBackgroundJob(
      "sync_item",
      (event ?? {}) as Record<string, unknown>,
      {
        mondayItemId: itemId,
        dedupe: false,
        maxAttempts: 3,
      }
    );
  }

  await enqueueBackgroundJob(
    "monday_status_sync",
    {},
    {
      dedupe: true,
      maxAttempts: 3,
    }
  );

  console.log(
    `[edge:monday] Enqueued ${shouldSyncItem ? "sync_item + " : ""}monday_status_sync (${event?.type ?? "unknown"}, board=${boardId})`
  );

  return json({ ok: true });
});
