/**
 * Operator Checkpoints API
 *
 * In-memory store for interactive yes/no checkpoints during permit automation.
 * The automation script creates a checkpoint and polls until the operator
 * responds via the web UI.
 *
 * Flow:
 * 1. Automation POSTs to create a pending checkpoint
 * 2. Web UI polls GET for pending checkpoints, shows Yes/No buttons
 * 3. Operator clicks → UI PUTs the response
 * 4. Automation's poll sees the resolution and continues/stops
 */

interface Checkpoint {
  id: string;
  label: string;
  context?: Record<string, unknown>;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  resolvedAt?: string;
}

/** In-memory checkpoint store. Transient - clears on server restart. */
const checkpoints = new Map<string, Checkpoint>();
let nextId = 1;

/** Auto-expire checkpoints older than 10 minutes */
function pruneStale(): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, cp] of checkpoints) {
    if (new Date(cp.createdAt).getTime() < cutoff) {
      checkpoints.delete(id);
    }
  }
}

/**
 * POST /api/checkpoints
 *
 * Automation calls this to create a pending checkpoint.
 * Body: { label: string, context?: object }
 * Returns: { id, label, status }
 */
export async function createCheckpoint(req: Request): Promise<Response> {
  pruneStale();

  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    context?: Record<string, unknown>;
  };

  if (!body.label) {
    return Response.json({ error: "label is required" }, { status: 400 });
  }

  const id = String(nextId++);
  const checkpoint: Checkpoint = {
    id,
    label: body.label,
    context: body.context,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  checkpoints.set(id, checkpoint);
  console.log(`[Checkpoint] Created #${id}: ${body.label}`);

  return Response.json(checkpoint, { status: 201 });
}

/**
 * GET /api/checkpoints
 *
 * Returns all checkpoints (pending first, then resolved).
 * UI polls this to detect new checkpoints.
 */
export function listCheckpoints(): Response {
  pruneStale();

  const all = [...checkpoints.values()].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") {
      return -1;
    }
    if (a.status !== "pending" && b.status === "pending") {
      return 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return Response.json({ checkpoints: all });
}

type BunRequest = Request & { params: { id: string } };

/**
 * PUT /api/checkpoints/:id
 *
 * Operator responds to a checkpoint.
 * Body: { action: "approve" | "decline" }
 */
export async function respondCheckpoint(req: BunRequest): Promise<Response> {
  const { id } = req.params;
  const checkpoint = checkpoints.get(id);
  if (!checkpoint) {
    return Response.json({ error: "checkpoint not found" }, { status: 404 });
  }

  if (checkpoint.status !== "pending") {
    return Response.json(
      { error: "checkpoint already resolved", checkpoint },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action !== "approve" && body.action !== "decline") {
    return Response.json(
      { error: 'action must be "approve" or "decline"' },
      { status: 400 }
    );
  }

  checkpoint.status = body.action === "approve" ? "approved" : "declined";
  checkpoint.resolvedAt = new Date().toISOString();

  console.log(`[Checkpoint] #${id} ${checkpoint.status}: ${checkpoint.label}`);

  return Response.json(checkpoint);
}

/**
 * GET /api/checkpoints/:id
 *
 * Automation polls this to check if a checkpoint has been resolved.
 */
export function getCheckpoint(req: BunRequest): Response {
  const { id } = req.params;
  const checkpoint = checkpoints.get(id);
  if (!checkpoint) {
    return Response.json({ error: "checkpoint not found" }, { status: 404 });
  }
  return Response.json(checkpoint);
}
