/**
 * Webhook handler -- thin enqueue layer.
 *
 * Route: POST /api/webhooks/monday
 *
 * Receives Monday.com webhook events, validates them,
 * enqueues to the webhook_jobs table, and returns 200 immediately.
 * Actual processing happens in the background worker (apps/background-jobs/worker.ts).
 */
import { db } from "@lib/db/hub";
import { BOARD_IDS } from "@monday/types/schema";

const enqueueStmt = db.prepare(
  "INSERT INTO webhook_jobs (job_type, monday_item_id, payload) VALUES (?, ?, ?)"
);

function isEstimatingBoard(boardId: number): boolean {
  return String(boardId) === BOARD_IDS.ESTIMATING;
}

export async function handleMondayWebhook(req: Request): Promise<Response> {
  const body = (await req.json()) as Record<string, unknown>;

  // Challenge verification (Monday requires this on webhook creation)
  if (body.challenge) {
    return Response.json({ challenge: body.challenge });
  }

  const event = body.event as
    | { boardId?: number; pulseId?: number; type?: string }
    | undefined;

  if (!(event?.boardId && isEstimatingBoard(event.boardId))) {
    return Response.json({ ok: true });
  }

  // Enqueue for async processing
  const itemId = event.pulseId ? String(event.pulseId) : null;
  await enqueueStmt.run("sync_item", itemId, JSON.stringify(event));

  console.log(
    `[webhook] Enqueued sync_item for ${itemId ?? "unknown"} (${event.type})`
  );

  return Response.json({ ok: true });
}
