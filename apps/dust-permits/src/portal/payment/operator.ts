/**
 * Operator Checkpoint Client
 *
 * Creates a checkpoint via the web app API and polls until the operator
 * responds via the web UI (Yes/No buttons on the automation page).
 *
 * Usage:
 *   const go = await checkpoint("Submit application D0065031?", { appId: "D0065031" });
 *   if (!go) { console.log("Operator declined"); return; }
 */

const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:3000";
const POLL_INTERVAL_MS = 1000;

interface CheckpointResponse {
  id: string;
  label: string;
  status: "pending" | "approved" | "declined";
}

/**
 * Create a checkpoint and wait for the operator to respond via the web UI.
 *
 * @param label - Human-readable prompt shown in the UI
 * @param context - Optional key-value metadata shown below the label
 * @returns true if approved, false if declined
 */
export async function checkpoint(
  label: string,
  context?: Record<string, unknown>
): Promise<boolean> {
  console.log(`\n  [Checkpoint] Waiting for operator: ${label}`);

  // Create the checkpoint
  const createRes = await fetch(`${WEB_APP_URL}/api/checkpoints`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label, context }),
  });

  if (!createRes.ok) {
    console.log("  [Checkpoint] Failed to create checkpoint, auto-declining");
    return false;
  }

  const created = (await createRes.json()) as CheckpointResponse;
  console.log(`  [Checkpoint] Created #${created.id} - check web UI`);

  // Poll until resolved
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${WEB_APP_URL}/api/checkpoints/${created.id}`);
    if (!pollRes.ok) {
      console.log("  [Checkpoint] Poll failed, auto-declining");
      return false;
    }

    const current = (await pollRes.json()) as CheckpointResponse;

    if (current.status === "approved") {
      console.log("  [Checkpoint] Operator approved - continuing");
      return true;
    }

    if (current.status === "declined") {
      console.log("  [Checkpoint] Operator declined - stopping");
      return false;
    }
  }
}
